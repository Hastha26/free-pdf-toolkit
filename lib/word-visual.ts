import { strToU8, zipSync } from "fflate";

type PageImage = { png: Uint8Array; width: number; height: number };

function sectionXml(width: number, height: number) {
  const fit = Math.min(1, 1580 / Math.max(width, height));
  return `<w:sectPr><w:pgSz w:w="${Math.round(width * fit * 20)}" w:h="${Math.round(height * fit * 20)}"/><w:pgMar w:top="120" w:right="120" w:bottom="120" w:left="120" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
}

function imageXml(index: number, width: number, height: number) {
  const fit = Math.min(1, 1580 / Math.max(width, height));
  const scale = Math.min((width - 12) / width, (height - 24) / height) * fit;
  const cx = Math.round(width * scale * 12700);
  const cy = Math.round(height * scale * 12700);
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${index}" name="PDF page ${index}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="page-${index}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${index}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

export function packWordPages(pages: PageImage[]): Uint8Array {
  if (!pages.length) throw new Error("The PDF has no pages.");
  const xml = (value: string) =>
    strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${value}`);
  const archive: Record<string, Uint8Array> = {
    "[Content_Types].xml": xml(
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    "_rels/.rels": xml(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/_rels/document.xml.rels": xml(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${pages.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page-${i + 1}.png"/>`).join("")}</Relationships>`,
    ),
  };
  const content = pages
    .map((page, i) => {
      if (
        !Number.isFinite(page.width) ||
        !Number.isFinite(page.height) ||
        page.width <= 12 ||
        page.height <= 24
      )
        throw new Error(`PDF page ${i + 1} has an invalid size.`);
      archive[`word/media/page-${i + 1}.png`] = page.png;
      const picture = imageXml(i + 1, page.width, page.height);
      return i < pages.length - 1
        ? `${picture}<w:p><w:pPr>${sectionXml(page.width, page.height)}</w:pPr></w:p>`
        : picture;
    })
    .join("");
  const last = pages[pages.length - 1];
  archive["word/document.xml"] = xml(
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${content}${sectionXml(last.width, last.height)}</w:body></w:document>`,
  );
  return zipSync(archive, { level: 0 });
}

export async function convertPdfToWordVisual(file: File): Promise<Blob> {
  const { openPdf } = await import("./viewer");
  const { doc, dispose } = await openPdf(
    new Uint8Array(await file.arrayBuffer()),
  );
  const pages: PageImage[] = [];
  try {
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const size = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(2, 2400 / Math.max(size.width, size.height)),
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot render PDF pages.");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Could not create a page image.")),
          "image/png",
        ),
      );
      pages.push({
        png: new Uint8Array(await blob.arrayBuffer()),
        width: size.width,
        height: size.height,
      });
      canvas.width = canvas.height = 0;
      page.cleanup();
    }
    return new Blob([new Uint8Array(packWordPages(pages))], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  } finally {
    await dispose();
  }
}
