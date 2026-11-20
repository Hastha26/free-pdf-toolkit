# Paperfree · Free PDF Toolkit

A free, open-source Next.js/TypeScript toolkit with **12 working tools**. Independent project; not affiliated with iLovePDF. No accounts or paid feature gates. Hosting and conversion resources are not unlimited.

## Tools and processing locations

| Tool              | Where it runs | Behavior                                                                        |
| ----------------- | ------------- | ------------------------------------------------------------------------------- |
| Merge PDF         | Browser       | Combine PDFs in the displayed order.                                            |
| Split PDF         | Browser       | Extract pages or download individual pages in a ZIP.                            |
| Rotate PDF        | Browser       | Rotate all or selected pages.                                                   |
| Images to PDF     | Browser       | JPEG/PNG images on A4 pages.                                                    |
| Edit PDF          | Browser       | Visual text, image, rectangle, and freehand overlays; undo and page navigation. |
| Compress PDF      | Your service  | Lossless stream/object optimization; original returned if no saving.            |
| PDF to Word       | Your service  | Editable DOCX with best-effort text, tables, images, and layout.                |
| PDF to PowerPoint | Your service  | Visual page-image slides, or simple editable text slides.                       |
| PDF to Excel      | Your service  | Detected tables or text rows in XLSX; one sheet per page.                       |
| Word to PDF       | Your service  | DOC, DOCX, ODT via LibreOffice.                                                 |
| PowerPoint to PDF | Your service  | PPT, PPTX, ODP via LibreOffice.                                                 |
| Excel to PDF      | Your service  | XLS, XLSX, ODS via LibreOffice.                                                 |

PDF-to-Word reconstructs selectable text, tables, images, and layout as editable Word content where possible. PDF-to-Excel and PDF-to-PowerPoint are also not promises of perfect reconstruction. Fonts, complex layouts, tables, and scans need review. The editor adds annotations; it cannot rewrite existing text or securely redact it. Original page content stays intact; added annotations are raster overlays. Digital signatures can be invalidated. Keep originals.

## Start locally

Requires Node.js 22.12+, 24+, or 26+ and npm. The converter needs Docker Desktop with Linux containers or Docker Engine.

```sh
npm ci
docker compose up --build -d
npm run dev
```

Open http://localhost:3000. Service tools default to http://127.0.0.1:8765. Click **Check connection**, select your file, and confirm the displayed destination before conversion. The first Docker build downloads LibreOffice and its dependencies. Local tools work without Docker.

Stop the converter with `docker compose down`. See [service setup and limits](service/README.md) for configuration and deployment.

## Privacy and limits

- Merge/split/rotate/images/edit process files inside the browser. No document upload occurs for these tools.
- Compression and Office conversions upload only to your configured self-hosted service after explicit confirmation. The supplied service deletes temporary files before responding. Other server operators may use different policies.
- Service URL and optional API key are held in this tab's memory, not browser storage. No analytics, external fonts, or paid conversion APIs are included. The app host still receives ordinary page requests.
- Local tools and batch conversion have no fixed file-count limit. A batch of service outputs downloads as a ZIP. Up to three conversion jobs run at once by default; additional jobs wait. The editor handles one PDF at a time. Device memory, server memory, temporary storage, and per-file timeouts still impose practical bounds.
- The editor uses Mozilla PDF.js assets hosted with the app. It does not execute PDF JavaScript. Password-protected PDFs are unsupported.
- This app is not a malware scanner or sanitizer. Links, attachments, or active content may remain. Page copying can lose bookmarks, form behavior, tags, or other document-level information.
- OCR, password removal, advanced lossy compression, and secure redaction are not included.

## Checks and deployment

```sh
npm test
npm run typecheck
npm run build
```

The frontend exports to `out/` for static hosting at the domain root. `npm ci`, `npm run dev`, and `npm run build` prepare local PDF.js assets automatically. A remote frontend needs its own reachable HTTPS converter service; static hosting alone cannot run LibreOffice. No public deployment is automatic. GitHub project subpaths require configuring both Next.js basePath and PDF.js asset URLs.

For a live build, set `NEXT_PUBLIC_CONVERTER_URL=https://your-converter.example` **before** running `npm run build`, then host `out/` at your site's domain root. This is a public URL, not an API secret. Deploy the converter separately behind HTTPS, set its `ALLOWED_ORIGINS` to the exact frontend origin, and add authentication, rate limiting, and monitoring before opening it to the public. Do not use `127.0.0.1` for a public frontend: that address refers to each visitor's own computer. See [service deployment guidance](service/README.md). The live host and domain are not included in this repository.

Service tests: install `service/requirements-dev.txt`, then run `python -m pytest service -q`. CI tests both frontend and service, including real LibreOffice conversions. See [service/README.md](service/README.md).

## Code layout

- `app/page.tsx`, `lib/tools.ts`: tool catalog, responsive UI, processing-location notices, explicit upload consent.
- `app/PdfEditor.tsx`, `lib/viewer.ts`: visual annotation editor and PDF.js rendering.
- `lib/pdf.ts`: local PDF operations and page selection.
- `lib/service.ts`: validated service URL, bounded request, error handling.
- `service/`: isolated conversion API, workers, Docker configuration, integration tests.
- `tests/`: local PDF and client-service tests.

MIT-licensed project. Dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
