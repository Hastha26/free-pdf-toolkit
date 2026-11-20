"""Bounded, ephemeral conversion API. Bind to loopback or an authenticated proxy."""
import asyncio
import hmac
import os
from pathlib import Path
import shutil
import signal
import sys
import tempfile

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

MAX_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", "0"))
MAX_OUTPUT = int(os.getenv("MAX_OUTPUT_BYTES", "0"))
TIMEOUT = 120
TOOLS = {
    "compress": ({".pdf"}, "pdf", "application/pdf"),
    "pdf-word": ({".pdf"}, "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "pdf-powerpoint": ({".pdf"}, "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    "pdf-excel": ({".pdf"}, "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "word-pdf": ({".doc", ".docx", ".odt"}, "pdf", "application/pdf"),
    "powerpoint-pdf": ({".ppt", ".pptx", ".odp"}, "pdf", "application/pdf"),
    "excel-pdf": ({".xls", ".xlsx", ".ods"}, "pdf", "application/pdf"),
}
ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app = FastAPI(title="Paperfree conversion service", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-API-Key"], expose_headers=["Content-Disposition"])
gate = asyncio.Semaphore(max(1, int(os.getenv("MAX_CONCURRENT_JOBS", "3"))))


def office_available():
    return bool(shutil.which(os.getenv("SOFFICE_PATH", "soffice")))


@app.middleware("http")
async def protect(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in ORIGINS:
        return Response("Origin not allowed", status_code=403)
    token = os.getenv("API_AUTH_TOKEN", "")
    if request.method != "OPTIONS" and token and not hmac.compare_digest(request.headers.get("x-api-key", ""), token):
        return Response("Authentication required", status_code=401)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/health")
def health():
    return {"service": "paperfree", "status": "ok", "office": office_available(), "ocr": bool(shutil.which(os.getenv("TESSERACT_PATH", "tesseract"))), "maxBytes": MAX_BYTES, "maxConcurrentJobs": max(1, int(os.getenv("MAX_CONCURRENT_JOBS", "3")))}


async def run_worker(tool: str, source: Path, target: Path, mode: str):
    process = await asyncio.create_subprocess_exec(
        sys.executable, str(Path(__file__).with_name("convert.py")), tool,
        str(source), str(target), mode,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        start_new_session=os.name != "nt",
    )
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(), TIMEOUT)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        if process.returncode is None:
            if os.name == "nt":
                process.kill()
            else:
                os.killpg(process.pid, signal.SIGKILL)
            await process.communicate()
        raise HTTPException(408, "Conversion timed out. Try a smaller document.")
    if process.returncode:
        message = stdout.decode("utf-8", errors="replace").strip()
        raise HTTPException(422, message[:400] or "Conversion failed. Check the document and try again.")


@app.post("/convert/{tool}")
async def convert(tool: str, request: Request, filename: str = "", mode: str = "default"):
    if tool not in TOOLS:
        raise HTTPException(404, "Unknown tool")
    extensions, output_ext, mime = TOOLS[tool]
    extension = Path(filename).suffix.lower()
    if extension not in extensions:
        raise HTTPException(415, "Unsupported file type for this tool")
    if mode not in {"default", "text", "visual", "tables", "rows"}:
        raise HTTPException(400, "Unsupported conversion mode")
    if tool.endswith("-pdf") and not office_available():
        raise HTTPException(503, "LibreOffice is not installed on this service. Start the supplied Docker service.")
    async with gate:
        with tempfile.TemporaryDirectory(prefix="paperfree-") as folder:
            source = Path(folder) / ("input" + extension)
            target = Path(folder) / ("result." + output_ext)
            total = 0
            with source.open("wb") as stream:
                try:
                    async with asyncio.timeout(60):
                        async for chunk in request.stream():
                            total += len(chunk)
                            if MAX_BYTES and total > MAX_BYTES:
                                raise HTTPException(413, "This file exceeds the configured service upload limit.")
                            stream.write(chunk)
                except TimeoutError:
                    raise HTTPException(408, "Upload timed out")
            if total == 0:
                raise HTTPException(400, "The file is empty")
            await run_worker(tool, source, target, mode)
            if not target.exists() or (MAX_OUTPUT and target.stat().st_size > MAX_OUTPUT):
                raise HTTPException(422, "Output is missing or exceeds the configured output limit.")
            # Read before leaving the context; all temporary files are deleted before responding.
            data = target.read_bytes()
        return Response(data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="paperfree-{tool}.{output_ext}"'})
