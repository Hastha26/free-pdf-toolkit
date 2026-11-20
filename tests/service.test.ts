import { describe, expect, it, vi, afterEach } from "vitest";
import { serviceUrl, convertOnService, checkService } from "../lib/service";
describe("conversion destination validation", () => {
  it("allows loopback HTTP and remote HTTPS", () => {
    expect(serviceUrl("http://127.0.0.1:8765/")).toBe("http://127.0.0.1:8765");
    expect(serviceUrl("https://converter.example")).toBe(
      "https://converter.example",
    );
  });
  it.each([
    "http://remote.example",
    "https://user:secret@example.com",
    "javascript:alert(1)",
    "https://example.com/?secret=x",
    "not a url",
  ])("rejects unsafe endpoint %s", (value) =>
    expect(() => serviceUrl(value)).toThrow(),
  );
});
describe("service failures", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("reports an unreachable converter before batch uploads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(checkService("http://127.0.0.1:8765", "")).rejects.toThrow(
      "Converter unavailable at http://127.0.0.1:8765",
    );
  });
  it("surfaces backend error without creating a result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: "Password-protected PDFs are not supported.",
          }),
          { status: 422 },
        ),
      ),
    );
    await expect(
      convertOnService(
        "pdf-word",
        new File(["%PDF"], "test.pdf"),
        "http://127.0.0.1:8765",
        "",
        "default",
      ),
    ).rejects.toThrow("Password-protected");
  });
});
