import { PDFDocument, degrees } from "pdf-lib";
import { zipSync } from "fflate";

export type Tool = "merge" | "split" | "rotate" | "images";
export type Input = { name: string; bytes: Uint8Array };
export function parsePages(value: string, count: number): number[] {
  if (!value.trim()) return Array.from({ length: count }, (_, i) => i);
  const pages = new Set<number>();
  for (const part of value.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match)
      throw new Error("Use page numbers or ranges, for example: 1, 3-5.");
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (start < 1 || end > count || start > end || !Number.isSafeInteger(end))
      throw new Error(
        `Choose pages between 1 and ${count}, with ranges in ascending order.`,
      );
    for (let p = start; p <= end; p++) pages.add(p - 1);
  }
  return [...pages];
}

async function load(input: Input) {
  try {
    return await PDFDocument.load(input.bytes);
  } catch {
    throw new Error(
      `“${input.name}” could not be opened. Use a valid, unencrypted PDF. Password-protected PDFs are not supported.`,
    );
  }
}

export async function processPdf(
  tool: Tool,
  files: Input[],
  options: { pages?: string; angle?: number; separate?: boolean } = {},
) {
  if (!files.length) throw new Error("Choose at least one file.");
  if ((tool === "split" || tool === "rotate") && files.length !== 1)
    throw new Error("Choose one PDF for this tool.");
  if (tool === "merge" && files.length < 2)
    throw new Error("Choose at least two PDFs to merge.");
  const output = await PDFDocument.create();
  if (tool === "merge") {
    for (const file of files) {
      const doc = await load(file);
      for (const page of await output.copyPages(doc, doc.getPageIndices()))
        output.addPage(page);
    }
  } else if (tool === "images") {
    for (const file of files) {
      let img;
      try {
        img =
          file.bytes[0] === 0x89
            ? await output.embedPng(file.bytes)
            : await output.embedJpg(file.bytes);
      } catch {
        throw new Error(`“${file.name}” is not a supported PNG or JPEG image.`);
      }
      const landscape = img.width > img.height;
      const size: [number, number] = landscape
        ? [841.89, 595.28]
        : [595.28, 841.89];
      const page = output.addPage(size);
      const scale = Math.min(
        (size[0] - 48) / img.width,
        (size[1] - 48) / img.height,
      );
      const width = img.width * scale,
        height = img.height * scale;
      page.drawImage(img, {
        x: (size[0] - width) / 2,
        y: (size[1] - height) / 2,
        width,
        height,
      });
    }
  } else {
    const doc = await load(files[0]);
    const selected = parsePages(options.pages ?? "", doc.getPageCount());
    if (tool === "rotate") {
      const angle = options.angle ?? 90;
      if (![90, 180, 270].includes(angle))
        throw new Error("Choose a 90°, 180°, or 270° rotation.");
      selected.forEach((i) => {
        const page = doc.getPage(i);
        page.setRotation(degrees((page.getRotation().angle + angle) % 360));
      });
      return {
        bytes: await doc.save(),
        name: "paperfree-rotated.pdf",
        type: "application/pdf",
      };
    }
    if (options.separate) {
      const archive: Record<string, Uint8Array> = {};
      for (const i of selected) {
        const single = await PDFDocument.create();
        const [page] = await single.copyPages(doc, [i]);
        single.addPage(page);
        archive[`page-${i + 1}.pdf`] = await single.save();
      }
      return {
        bytes: zipSync(archive, { level: 0 }),
        name: "paperfree-pages.zip",
        type: "application/zip",
      };
    }
    for (const page of await output.copyPages(doc, selected))
      output.addPage(page);
  }
  if (!output.getPageCount()) throw new Error("The document has no pages.");
  return {
    bytes: await output.save(),
    name: `paperfree-${tool}.pdf`,
    type: "application/pdf",
  };
}
