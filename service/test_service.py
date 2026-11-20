from io import BytesIO
import os
from pathlib import Path
import shutil

from fastapi.testclient import TestClient
import httpx
from docx import Document
from openpyxl import Workbook, load_workbook
from pptx import Presentation
from pptx.util import Inches
from pypdf import PdfReader, PdfWriter
import pytest
from reportlab.pdfgen.canvas import Canvas

from service import app as api
from service.convert import convert, check_office


@pytest.fixture
def pdf(tmp_path):
    path = tmp_path / 'sample.pdf'
    canvas = Canvas(str(path), pageCompression=0)
    canvas.drawString(72, 750, 'Paperfree test document')
    canvas.drawString(72, 720, '=1+1')
    for x in [72, 200, 330]:
        canvas.line(x, 600, x, 680)
    for y in [600, 640, 680]:
        canvas.line(72, y, 330, y)
    canvas.drawString(80, 655, 'Name')
    canvas.drawString(210, 655, 'Amount')
    canvas.drawString(80, 615, 'Alice')
    canvas.drawString(210, 615, '42')
    canvas.showPage()
    canvas.drawString(72, 750, 'Second page')
    canvas.save()
    return path


def test_compress_preserves_text_and_never_grows(pdf, tmp_path):
    output = tmp_path / 'small.pdf'
    convert('compress', pdf, output)
    assert output.stat().st_size <= pdf.stat().st_size
    doc = PdfReader(output)
    assert len(doc.pages) == 2
    assert 'Paperfree' in doc.pages[0].extract_text()


def test_word_contains_editable_text(pdf, tmp_path):
    output = tmp_path / 'out.docx'
    convert('pdf-word', pdf, output, 'text')
    text = '\n'.join(p.text for p in Document(output).paragraphs)
    assert 'Paperfree test document' in text and 'Second page' in text


def test_word_visual_preserves_pages(pdf, tmp_path):
    output = tmp_path / 'visual.docx'
    convert('pdf-word', pdf, output)
    document = Document(output)
    assert len(document.inline_shapes) == 2
    if shutil.which(os.getenv('SOFFICE_PATH', 'soffice')):
        roundtrip = tmp_path / 'roundtrip.pdf'
        convert('word-pdf', output, roundtrip)
        assert len(PdfReader(roundtrip).pages) == 2


@pytest.mark.parametrize('mode', ['default', 'text'])
def test_powerpoint_has_one_slide_per_page(pdf, tmp_path, mode):
    output = tmp_path / 'out.pptx'
    convert('pdf-powerpoint', pdf, output, mode)
    presentation = Presentation(output)
    assert len(presentation.slides) == 2
    if mode == 'text':
        assert 'Paperfree' in presentation.slides[0].shapes[0].text
    else:
        assert presentation.slides[0].shapes[0].shape_type == 13


@pytest.mark.parametrize('mode', ['default', 'rows'])
def test_excel_extracts_tables_or_rows_without_formulas(pdf, tmp_path, mode):
    output = tmp_path / 'out.xlsx'
    convert('pdf-excel', pdf, output, mode)
    workbook = load_workbook(output)
    assert workbook.sheetnames == ['Page 1', 'Page 2']
    cells = [c for row in workbook.worksheets[0] for c in row]
    assert any('Alice' in str(c.value) for c in cells)
    assert all(c.data_type != 'f' for c in cells)
    if mode == 'rows':
        assert any(c.value == '=1+1' and c.data_type == 's' for c in cells)


def test_encrypted_pdf_is_rejected(pdf, tmp_path):
    writer = PdfWriter(clone_from=pdf)
    writer.encrypt('test-password')
    encrypted = tmp_path / 'encrypted.pdf'
    writer.write(encrypted)
    with pytest.raises(ValueError, match='Password'):
        convert('compress', encrypted, tmp_path / 'out.pdf')


def test_scan_without_text_is_rejected_for_word(tmp_path):
    writer = PdfWriter()
    writer.add_blank_page(200, 300)
    blank = tmp_path / 'blank.pdf'
    writer.write(blank)
    with pytest.raises(ValueError, match='No selectable text'):
        convert('pdf-word', blank, tmp_path / 'out.docx', 'text')
    convert('pdf-word', blank, tmp_path / 'visual.docx')
    assert len(Document(tmp_path / 'visual.docx').inline_shapes) == 1


def test_macro_archive_is_rejected(tmp_path):
    from zipfile import ZipFile
    path = tmp_path / 'macros.docx'
    with ZipFile(path, 'w') as archive:
        archive.writestr('word/vbaProject.bin', 'not a real macro')
    with pytest.raises(ValueError, match='Macro'):
        check_office(path)


def test_api_validates_requests_and_origins(monkeypatch):
    with TestClient(api.app) as client:
        assert client.get('/health').status_code == 200
        assert client.get('/health', headers={'Origin': 'https://untrusted.example'}).status_code == 403
        assert client.post('/convert/compress?filename=x.txt', content=b'x').status_code == 415
        assert client.post('/convert/unknown?filename=x.pdf', content=b'x').status_code == 404
        assert client.post('/convert/compress?filename=x.pdf', content=b'').status_code == 400
        monkeypatch.setattr(api, 'MAX_BYTES', 2)
        assert client.post('/convert/compress?filename=x.pdf', content=b'abc').status_code == 413
        monkeypatch.setenv('API_AUTH_TOKEN', 'test-key')
        assert client.get('/health').status_code == 401
        assert client.get('/health', headers={'X-API-Key': 'test-key'}).status_code == 200


def test_api_returns_real_file_and_no_cache(pdf):
    with TestClient(api.app) as client:
        response = client.post('/convert/pdf-word?filename=sample.pdf&mode=text', content=pdf.read_bytes())
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'no-store'
    assert 'Paperfree' in '\n'.join(p.text for p in Document(BytesIO(response.content)).paragraphs)


def office_fixture(tmp_path, kind):
    if kind == 'word':
        path = tmp_path / 'sample.docx'
        document = Document(); document.add_paragraph('Office conversion test'); document.save(path)
    elif kind == 'excel':
        path = tmp_path / 'sample.xlsx'
        book = Workbook(); book.active.append(['Office conversion test', 42]); book.active.column_dimensions['A'].width = 32; book.save(path)
    else:
        path = tmp_path / 'sample.pptx'
        deck = Presentation(); slide = deck.slides.add_slide(deck.slide_layouts[6]); slide.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(2)).text = 'Office conversion test'; deck.save(path)
    return path


@pytest.mark.parametrize('kind', ['word', 'excel', 'powerpoint'])
def test_office_to_pdf(tmp_path, kind):
    base = os.getenv('CONVERTER_URL')
    source = office_fixture(tmp_path, kind)
    if base:
        response = httpx.post(f'{base}/convert/{kind}-pdf', params={'filename': source.name}, content=source.read_bytes(), timeout=120)
        assert response.status_code == 200, response.text
        data = BytesIO(response.content)
    else:
        if not shutil.which(os.getenv('SOFFICE_PATH', 'soffice')):
            pytest.skip('LibreOffice unavailable; run with CONVERTER_URL or install LibreOffice')
        output = tmp_path / 'out.pdf'
        convert(f'{kind}-pdf', source, output)
        data = output
    reader = PdfReader(data)
    assert len(reader.pages) >= 1
    assert 'Office conversion test' in ''.join(p.extract_text() for p in reader.pages)
