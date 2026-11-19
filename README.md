# Paperfree · Free PDF Toolkit

A free, open-source PDF toolkit built with Next.js, TypeScript, and React. No accounts, document uploads, analytics, or paid feature gates. Independent project; not affiliated with iLovePDF.

## MVP features

| Tool          | Behavior                                                                             |
| ------------- | ------------------------------------------------------------------------------------ |
| Merge PDF     | Combine PDFs in the displayed order; reorder or remove files first.                  |
| Split PDF     | Extract selected pages into a PDF, or save individual pages in a ZIP.                |
| Rotate PDF    | Rotate all or selected pages clockwise by 90, 180, or 270 degrees.                   |
| Images to PDF | Place JPEG/PNG images on individual A4 pages with margins and automatic orientation. |

Page selections use one-based numbers and inclusive ranges: `1, 3-5`. Blank means all pages. Requested order is preserved; duplicates are removed. The responsive interface supports drag-and-drop, keyboard controls, error feedback, and explicit downloads.

## Development

Requires Node.js 22.12+, 24+, or 26+ and npm. No API keys or environment variables needed.

```sh
npm ci
npm run dev
```

Open http://localhost:3000.

```sh
npm test
npm run typecheck
npm run build
```

Build output is a static website in `out/`. Deploy it to a static host at the domain root. GitHub Pages project subpaths require a matching Next.js `basePath` before building. This repository does not automatically deploy or incur hosting charges. GitHub Actions runs tests, type checks, and builds on pushes and pull requests.

## Privacy

- File bytes are processed locally using pdf-lib and fflate. No upload endpoints, third-party fonts, analytics, or external runtime scripts.
- Input File objects and generated Blob URLs remain in this tab's memory. Clear all, switch tools, or close the tab to release references. Obsolete download URLs are revoked. Memory cleanup is not guaranteed forensic erasure; downloaded files remain on disk.
- Your host may log ordinary page requests and IP addresses. The operating system and browser extensions are outside this app's control.
- This app is not a malware scanner or PDF sanitizer. Use trusted documents; existing links or active content may remain in output.
- Encrypted/password-protected PDFs are rejected. Password removal is not supported.

## Limits and fidelity

Up to **100 files and 100 MB total** per operation. These guardrails do not guarantee success: decoded images and complex PDFs can use much more memory than their file sizes. Processing runs on the main browser thread, so heavy jobs can temporarily pause the interface.

Keep originals and inspect results. Document-level bookmarks, attachments, tags, forms, and digital signatures may not survive page copying or edits. Editing signed documents can invalidate signatures. This is not an archival or accessibility-preservation tool.

Office conversion, OCR, advanced compression, PDF-to-image, and PDF editing are outside this MVP. They require separate fidelity testing, licensing review, resource budgets, and possibly funded backend infrastructure. No unlimited backend-heavy conversion is promised.

## Structure and tests

- `app/page.tsx`: homepage and local file workflow.
- `app/globals.css`: responsive design and reduced-motion support.
- `lib/pdf.ts`: validation, page parsing, PDF operations, and ZIP output.
- `tests/pdf.test.ts`: generated fixtures verify page order, extraction, ZIP entries, rotation, PNG embedding, and errors.
- `.github/workflows/ci.yml`: automated verification.

## Licensing and future work

MIT-licensed. Runtime libraries: Next.js, React/React DOM, pdf-lib, and fflate (MIT); lucide-react (ISC). See `THIRD_PARTY_NOTICES.md`. No proprietary conversion SDK or paid API is used.

Next steps: Web Worker processing, thumbnails, additional image options, and automated browser interaction tests. Add new formats only after verifying licensing, resource limits, and fidelity.

