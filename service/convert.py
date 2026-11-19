"""One conversion per process, terminated by the API deadline."""
from io import BytesIO
import os
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile, is_zipfile

from pypdf import PdfReader, PdfWriter


def check_pdf(source):
    reader = PdfReader(source)
    if reader.is_encrypted:
        raise ValueError("Password-protected PDFs are not supported.")
    if not len(reader.pages):
        raise ValueError("The PDF has no pages.")
    return reader


def check_office(source):
    if is_zipfile(source):
        with ZipFile(source) as archive:
            entries = archive.infolist()
            if len(entries) > 10000 or sum(i.file_size for i in entries) > 200 * 1024 * 1024:
                raise ValueError("The expanded Office document is too large.")
            if any("vbaproject" in i.filename.lower() for i in entries):
                raise ValueError("Macro-containing documents are not supported.")


def office_pdf(source, target):
    check_office(source)
    profile = source.parent / "lo-profile"
    # Never execute macros; a fresh profile is discarded with every job.
    user = profile / "user"
    user.mkdir(parents=True)
    (user / "registrymodifications.xcu").write_text('''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item></oor:items>''', encoding="utf-8")
    result = subprocess.run([
        os.getenv("SOFFICE_PATH", "soffice"), "-env:UserInstallation=" + profile.as_uri(),
        "--headless", "--nologo", "--nodefault", "--norestore", "--convert-to", "pdf",
        "--outdir", str(source.parent), str(source),
    ], capture_output=True, timeout=90)
    converted = source.with_suffix(".pdf")
    if result.returncode or not converted.exists():
        raise ValueError("LibreOffice could not convert this file. Check that it is valid and not password-protected.")
    check_pdf(converted)
    converted.replace(target)


def compress(source, target):
    reader = check_pdf(source)
    writer = PdfWriter(clone_from=reader)
    for page in writer.pages:
        page.compress_content_streams(level=9)
    writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    writer.write(target)
    if target.stat().st_size >= source.stat().st_size:
        target.write_bytes(source.read_bytes())


def pdf_word(source, target):
    import pdfplumber
    from docx import Document
    check_pdf(source)
    document = Document()
    chars = 0
    with pdfplumber.open(source) as pdf:
        for index, page in enumerate(pdf.pages):
            if index:
                document.add_page_break()
            text = page.extract_text() or ""
            chars += len(text.strip())
            for line in text.splitlines():
                document.add_paragraph(line)
    if not chars:
        raise ValueError("No selectable text found. This PDF may be scanned; OCR is not included.")
    document.save(target)


def pdf_excel(source, target, mode):
    import pdfplumber
    from openpyxl import Workbook
    check_pdf(source)
    workbook = Workbook()
    workbook.remove(workbook.active)
    found = False
    with pdfplumber.open(source) as pdf:
        for number, page in enumerate(pdf.pages, 1):
            sheet = workbook.create_sheet(f"Page {number}")
            rows = [[line] for line in (page.extract_text() or "").splitlines()] if mode == "rows" else [row for table in page.extract_tables() for row in table]
            for row in rows:
                values = [str(value or "") for value in row]
                if any(values):
                    found = True
                sheet.append(values)
                # Extracted content is always literal text, never spreadsheet formulas.
                for cell in sheet[sheet.max_row]:
                    cell.data_type = "s"
            sheet.freeze_panes = "A2"
    if not found:
        raise ValueError("No tables found. Try text rows mode, or use a PDF containing selectable text. OCR is not included.")
    workbook.save(target)


def pdf_powerpoint(source, target, mode):
    import pypdfium2 as pdfium
    from pptx import Presentation
    from pptx.util import Inches, Pt
    reader = check_pdf(source)
    presentation = Presentation()
    presentation.slide_width, presentation.slide_height = Inches(13.333), Inches(7.5)
    document = pdfium.PdfDocument(source)
    found_text = False
    try:
        for number in range(len(reader.pages)):
            slide = presentation.slides.add_slide(presentation.slide_layouts[6])
            if mode == "text":
                text = reader.pages[number].extract_text() or ""
                found_text = found_text or bool(text.strip())
                frame = slide.shapes.add_textbox(Inches(.4), Inches(.3), Inches(12.5), Inches(6.8)).text_frame
                frame.word_wrap = True
                frame.text = text
                for paragraph in frame.paragraphs:
                    paragraph.font.size = Pt(14)
            else:
                page = document[number]
                width, height = page.get_size()
                bitmap = page.render(scale=min(2, 1800 / max(width, height)))
                image = bitmap.to_pil()
                image_bytes = BytesIO()
                image.save(image_bytes, format="PNG")
                image_bytes.seek(0)
                ratio = min(13.333 / width, 7.5 / height)
                w, h = width * ratio, height * ratio
                slide.shapes.add_picture(image_bytes, Inches((13.333-w)/2), Inches((7.5-h)/2), width=Inches(w), height=Inches(h))
                image.close()
                bitmap.close()
                page.close()
        if mode == "text" and not found_text:
            raise ValueError("No selectable text found. Use visual slides mode for scanned PDFs.")
        presentation.save(target)
    finally:
        document.close()


def convert(tool, source, target, mode="default"):
    if tool.endswith("-pdf"):
        office_pdf(source, target)
    elif tool == "compress":
        compress(source, target)
    elif tool == "pdf-word":
        pdf_word(source, target)
    elif tool == "pdf-excel":
        pdf_excel(source, target, mode)
    elif tool == "pdf-powerpoint":
        pdf_powerpoint(source, target, mode)
    else:
        raise ValueError("Unknown conversion")


if __name__ == "__main__":
    try:
        convert(sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4])
    except ValueError as error:
        print(str(error))
        sys.exit(1)
    except Exception:
        print("Conversion failed. Check the file format, encryption, and document size.")
        sys.exit(1)
