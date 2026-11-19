import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { unzipSync } from "fflate";
import { parsePages, processPdf } from "../lib/pdf";

async function fixture(widths = [200, 300, 400]) {
  const doc = await PDFDocument.create();
  widths.forEach((w) => doc.addPage([w, 500]));
  return { name: "test.pdf", bytes: await doc.save() };
}
describe("page selection", () => {
  it("selects all pages when blank", () =>
    expect(parsePages("", 3)).toEqual([0, 1, 2]));
  it("preserves requested order and deduplicates", () =>
    expect(parsePages("3, 1-2, 3", 4)).toEqual([2, 0, 1]));
  it.each(["0", "4", "2-1", "1,", "1.5", "-1", "a", "1-999999999999"])(
    "rejects invalid selection %s",
    (value) => expect(() => parsePages(value, 3)).toThrow(),
  );
});
describe("PDF operations", () => {
  it("merges documents in input order", async () => {
    const result = await processPdf("merge", [
      await fixture([220]),
      await fixture([330, 440]),
    ]);
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPages().map((p) => p.getWidth())).toEqual([220, 330, 440]);
  });
  it("extracts selected pages in requested order", async () => {
    const result = await processPdf("split", [await fixture()], {
      pages: "3, 1",
    });
    expect(
      (await PDFDocument.load(result.bytes))
        .getPages()
        .map((p) => p.getWidth()),
    ).toEqual([400, 200]);
  });
  it("creates a readable single-page PDF for each ZIP entry", async () => {
    const result = await processPdf("split", [await fixture()], {
      pages: "2-3",
      separate: true,
    });
    const files = unzipSync(result.bytes);
    expect(Object.keys(files)).toEqual(["page-2.pdf", "page-3.pdf"]);
    expect((await PDFDocument.load(files["page-2.pdf"])).getPageCount()).toBe(
      1,
    );
    expect(
      (await PDFDocument.load(files["page-3.pdf"])).getPage(0).getWidth(),
    ).toBe(400);
  });
  it("rotates selected pages relative to their existing rotation", async () => {
    const doc = await PDFDocument.load((await fixture()).bytes);
    doc.getPage(1).setRotation(degrees(270));
    const result = await processPdf(
      "rotate",
      [{ name: "rotation.pdf", bytes: await doc.save() }],
      { pages: "2", angle: 180 },
    );
    expect(
      (await PDFDocument.load(result.bytes))
        .getPages()
        .map((p) => p.getRotation().angle),
    ).toEqual([0, 90, 0]);
  });
  it("embeds a PNG on an A4 page", async () => {
    const bytes = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOt8AAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const result = await processPdf("images", [{ name: "pixel.png", bytes }]);
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(595.28);
  });
  it("rejects corrupt PDFs and unsupported image data", async () => {
    const invalid = { name: "bad.pdf", bytes: new Uint8Array([1, 2, 3]) };
    await expect(processPdf("rotate", [invalid])).rejects.toThrow(
      "unencrypted",
    );
    await expect(processPdf("images", [invalid])).rejects.toThrow(
      "PNG or JPEG",
    );
  });
  it("validates file counts and rotation", async () => {
    await expect(processPdf("merge", [])).rejects.toThrow("at least one");
    await expect(processPdf("merge", [await fixture()])).rejects.toThrow(
      "at least two",
    );
    await expect(
      processPdf("split", [await fixture(), await fixture()]),
    ).rejects.toThrow("one PDF");
    await expect(
      processPdf("rotate", [await fixture()], { angle: 45 }),
    ).rejects.toThrow("90");
  });
  it("merges more than 100 PDFs without an arbitrary file-count cap", async () => {
    const one = await fixture([200]);
    const result = await processPdf("merge", Array(101).fill(one));
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(101);
  });
});
