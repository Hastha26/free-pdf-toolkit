# Self-hosted conversion service

Run from the repository root with Docker Desktop (Linux containers) or Docker Engine:

```sh
docker compose up --build -d
```

The browser's default converter URL is **http://127.0.0.1:8765**. Click **Check connection**, choose a file, confirm the displayed destination, then convert. First startup downloads LibreOffice and Python dependencies. Stop with `docker compose down`.

## Supported operations

- `compress`: lossless stream compression and duplicate-object removal. The original is returned if optimization does not reduce size. No image downsampling.
- `pdf-word`: reconstructs selectable PDF text, tables, layout, and images in an editable DOCX where possible. Complex layouts may need adjustment. Scans require OCR, which is not included.
- `pdf-powerpoint`: page images on slides (default), or simple editable text slides (`mode=text`). Visual mode works for scans but is not editable text.
- `pdf-excel`: detected tables (default), or selectable text rows (`mode=rows`), one worksheet per page. Extracted values are literal strings; formulas are never executed.
- `word-pdf`: DOC/DOCX/ODT using LibreOffice.
- `powerpoint-pdf`: PPT/PPTX/ODP using LibreOffice.
- `excel-pdf`: XLS/XLSX/ODS using LibreOffice's print layout.

PDF input must be unencrypted and contain one or more pages. Scanned PDFs need OCR for Word/Excel/text-slide extraction; OCR is not included. Office fidelity depends on available fonts and LibreOffice support. Animations, macros, and external-link updates are not supported. Check output before relying on it.

## Resource and privacy boundaries

The API has no fixed file-count or byte quota by default. It runs up to three jobs at once, queues additional jobs, and allows a 60-second upload and 120-second conversion per file. Set MAX_CONCURRENT_JOBS, MAX_UPLOAD_BYTES, and MAX_OUTPUT_BYTES to tune resource use; zero byte limits disable those checks. Container memory, temporary storage, CPU, and time still set practical bounds. Temporary input, profiles, and outputs are removed before the response is returned, including on errors. Logs do not intentionally contain filenames or document contents. Downloads remain on the user's device. Deletion is not guaranteed forensic erasure.

The converter is an unprivileged container with a read-only filesystem, a 512 MB temporary filesystem, a 1.5 GB memory limit, CPU/PID limits, no extra capabilities, and no outbound network. A separate loopback-bound nginx gateway exposes it to the browser. These controls reduce risk; they are not a claim that arbitrary hostile documents are safe. Keep the image and libraries updated.

The default configuration is **local use**, not a public multi-tenant deployment. For a remote deployment, add HTTPS, authentication, rate limiting, and operational monitoring; set `API_AUTH_TOKEN` on the converter and enter it in the UI; restrict `ALLOWED_ORIGINS` to the actual frontend origin. Never place a secret in `NEXT_PUBLIC_*`. A remote frontend needs a reachable HTTPS converter URL; static hosting alone cannot run LibreOffice. Hosting and resource costs are yours to manage.

## API

`GET /health` returns the service identifier and LibreOffice availability. `POST /convert/{tool}?filename=example.docx&mode=default` takes raw file bytes with `Content-Type: application/octet-stream`; it returns a downloadable file. If configured, send `X-API-Key`. No URL-fetching endpoint exists.

## Development and tests

```sh
python -m venv .venv
# Activate the environment for your shell, then:
pip install -r service/requirements-dev.txt
python -m pytest service -q
```

Tests generate their own PDF/Office fixtures. Install LibreOffice on PATH (or set `SOFFICE_PATH`) for direct Office tests, or set `CONVERTER_URL=http://127.0.0.1:8765` to test the running Docker service. Those three tests skip if neither is available. CI installs LibreOffice and runs all tests.

For trusted local development only, run `uvicorn service.app:app --host 127.0.0.1 --port 8765`. This does not provide Docker's network/process isolation. Python 3.11+ is required.
