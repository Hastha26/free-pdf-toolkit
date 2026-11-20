"""One conversion per process, terminated by the API deadline."""
from io import BytesIO
import os
from pathlib import Path
import shutil
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
    import pypdfium2 as pdfium
    from pdf2docx import Converter
    from docx import Document
    from docx.oxml.ns import qn

    check_pdf(source)
    pdf = pdfium.PdfDocument(source)
    selectable = False
    try:
        for index in range(len(pdf)):
            page = pdf[index]
            try:
                text_page = page.get_textpage()
                try:
                    if text_page.get_text_range().strip():
                        selectable = True
                        break
                finally:
                    text_page.close()
            finally:
                page.close()
    finally:
        pdf.close()
    if not selectable:
        scanned_pdf_word(source, target)
        return

    converter = Converter(str(source))
    try:
        converter.convert(str(target))
    finally:
        converter.close()
    if not target.is_file() or not target.stat().st_size:
        raise ValueError("Could not create an editable Word document from this PDF.")

    # Word may substitute the PDF's embedded condensed Noto face with an
    # unrelated script font. Arial Narrow is a common compatible fallback.
    document = Document(target)
    changed = False
    for root in (document.element.body, document.styles.element):
        for fonts in root.iter(qn("w:rFonts")):
            for name, value in list(fonts.attrib.items()):
                if "Noto Sans Condensed" in value:
                    fonts.set(name, "Arial Narrow")
                    changed = True
    if changed:
        document.save(target)


def scanned_pdf_word(source, target):
    """OCR a scanned PDF into actual Word paragraphs, without page screenshots."""
    import csv
    import pypdfium2 as pdfium
    from docx import Document
    from docx.shared import Pt

    executable = os.getenv("TESSERACT_PATH", "tesseract")
    if not shutil.which(executable):
        raise ValueError("This PDF has no selectable text. OCR requires Tesseract on the converter service.")
    document = Document()
    pdf = pdfium.PdfDocument(source)
    found = False
    try:
        for index in range(len(pdf)):
            page = pdf[index]
            try:
                width, height = page.get_size()
                scale = min(2.5, 2400 / max(width, height))
                bitmap = page.render(scale=scale)
                try:
                    image = bitmap.to_pil()
                    try:
                        image_path = source.parent / f"ocr-page-{index}.png"
                        image.save(image_path)
                    finally:
                        image.close()
                finally:
                    bitmap.close()
            finally:
                page.close()
            try:
                result = subprocess.run(
                    [executable, str(image_path), "stdout", "-l", "eng", "tsv"],
                    capture_output=True, text=True, timeout=60,
                )
            finally:
                image_path.unlink(missing_ok=True)
            if result.returncode:
                raise ValueError("OCR could not read this scanned PDF.")
            lines = {}
            for item in csv.DictReader(result.stdout.splitlines(), delimiter="\t"):
                word = (item.get("text") or "").strip()
                if word and item.get("level") == "5":
                    key = (item["block_num"], item["par_num"], item["line_num"])
                    lines.setdefault(key, []).append(word)
            if index:
                document.add_page_break()
            for words in lines.values():
                paragraph = document.add_paragraph(" ".join(words))
                paragraph.paragraph_format.space_after = Pt(2)
                found = True
    finally:
        pdf.close()
    if not found:
        raise ValueError("OCR found no readable text in this PDF.")
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
