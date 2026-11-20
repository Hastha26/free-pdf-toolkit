import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { packWordPages } from "../lib/word-visual";

const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/qXcAAAAASUVORK5CYII=",
  ),
  (char) => char.charCodeAt(0),
);

describe("visual Word package", () => {
  it("includes every page image and page geometry", () => {
    const archive = unzipSync(
      packWordPages([
        { png, width: 612, height: 792 },
        { png, width: 792, height: 612 },
      ]),
    );
    const document = strFromU8(archive["word/document.xml"]);
    const relationships = strFromU8(archive["word/_rels/document.xml.rels"]);
    expect(archive["word/media/page-1.png"]).toEqual(png);
    expect(archive["word/media/page-2.png"]).toEqual(png);
    expect(document.match(/<wp:inline/g)).toHaveLength(2);
    expect(document).toContain('w:w="12240" w:h="15840"');
    expect(document).toContain('w:w="15840" w:h="12240"');
    expect(relationships).toContain('Target="media/page-2.png"');
  });

  it("rejects an empty PDF", () => {
    expect(() => packWordPages([])).toThrow("The PDF has no pages.");
  });
});
