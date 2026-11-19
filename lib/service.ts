export type ServiceTool =
  | "compress"
  | "pdf-word"
  | "pdf-powerpoint"
  | "pdf-excel"
  | "word-pdf"
  | "powerpoint-pdf"
  | "excel-pdf";
export function serviceUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid converter URL.");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new Error(
      "Use an HTTP(S) converter URL without credentials or query parameters.",
    );
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("Remote converters must use HTTPS.");
  return url.href.replace(/\/$/, "");
}
export async function convertOnService(
  tool: ServiceTool,
  file: File,
  endpoint: string,
  key: string,
  mode: string,
) {
  const base = serviceUrl(endpoint);
  let response: Response;
  try {
    response = await fetch(
      `${base}/convert/${tool}?filename=${encodeURIComponent(file.name)}&mode=${encodeURIComponent(mode)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(key ? { "X-API-Key": key } : {}),
        },
        body: file,
        credentials: "omit",
        redirect: "error",
      },
    );
  } catch {
    throw new Error(
      "Could not reach the converter, or it timed out. Start the service and check its URL and allowed origins.",
    );
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Conversion failed (${response.status}). Check the service and API key.`,
    );
  }
  const extension =
    tool === "pdf-word"
      ? "docx"
      : tool === "pdf-powerpoint"
        ? "pptx"
        : tool === "pdf-excel"
          ? "xlsx"
          : "pdf";
  return {
    blob: await response.blob(),
    name: `paperfree-${tool}.${extension}`,
  };
}
