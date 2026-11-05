"""Universal Document Parser for Architectural Requirements.

Extracts clean text and architectural structure from any document type:
- PDF (.pdf)
- Microsoft Word (.docx, .doc)
- Markdown (.md, .markdown)
- Plain Text (.txt, .log)
- Structured Configs (.json, .yaml, .yml)
- Tabular Data (.csv, .tsv)
- Rich Text (.rtf)
- HTML / XML (.html, .htm, .xml)
"""

from __future__ import annotations

import io
import re
import json
from pathlib import Path
from typing import Dict, Any, Tuple


def parse_any_document(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """Parse text and metadata from any uploaded document file."""
    ext = Path(filename).suffix.lower()
    raw_size = len(file_bytes)

    extracted_text = ""
    doc_type = "Unknown Document"

    try:
        # 1. PDF Documents
        if ext == ".pdf":
            doc_type = "PDF Document (.pdf)"
            extracted_text = _extract_from_pdf(file_bytes)

        # 2. Microsoft Word Documents
        elif ext == ".docx":
            doc_type = "Microsoft Word Document (.docx)"
            extracted_text = _extract_from_docx(file_bytes)
        elif ext == ".doc":
            raise ValueError("Legacy .doc is unsupported. Save the document as .docx or PDF.")
        elif ext == ".xlsx":
            doc_type = "Excel Requirements Workbook (.xlsx)"
            extracted_text = _extract_from_xlsx(file_bytes)

        # 3. Markdown Specifications
        elif ext in [".md", ".markdown"]:
            doc_type = "Markdown Architecture Spec (.md)"
            extracted_text = _decode_text(file_bytes)

        # 4. JSON Architecture Config
        elif ext == ".json":
            doc_type = "JSON Architecture Config (.json)"
            extracted_text = _extract_from_json(file_bytes)

        # 5. YAML Configuration
        elif ext in [".yaml", ".yml"]:
            doc_type = "YAML Specification (.yaml)"
            extracted_text = _decode_text(file_bytes)
            import yaml
            yaml.safe_load(extracted_text)

        # 6. Tabular Requirements (CSV/TSV)
        elif ext in [".csv", ".tsv"]:
            doc_type = "Tabular Requirements Sheet (.csv)"
            extracted_text = _extract_from_csv(file_bytes, delimiter="\t" if ext == ".tsv" else ",")

        # 7. HTML / XML Web Specs
        elif ext in [".html", ".htm", ".xml"]:
            doc_type = "HTML/XML Document"
            extracted_text = _extract_from_html_xml(file_bytes)

        # 8. Rich Text Format (RTF)
        elif ext == ".rtf":
            doc_type = "Rich Text Document (.rtf)"
            extracted_text = _extract_from_rtf(file_bytes)

        # 9. Plain text, code, or any other extension
        elif ext in [".txt", ".log", ""]:
            doc_type = f"Plain Text / Document ({ext or 'raw'})"
            extracted_text = _decode_text(file_bytes)
        else:
            raise ValueError(f"Unsupported requirements format: {ext}")

    except Exception as e:
        raise ValueError(f"Unable to parse {filename}: {e}") from e

    # Clean and normalize text
    normalized_text = _clean_text(extracted_text)
    if not normalized_text:
        raise ValueError("No readable requirements text found. Scanned documents need OCR before upload.")

    # Compute statistics and architectural keywords
    char_count = len(normalized_text)
    words = re.findall(r"\b\w+\b", normalized_text)
    word_count = len(words)
    lines = [line.strip() for line in normalized_text.splitlines() if line.strip()]
    line_count = len(lines)

    # Architectural highlights discovery
    keywords = ["security", "database", "https", "ssl", "tls", "api", "client", "server", "subnet", "vpc", "cache", "redis", "gateway", "service"]
    found_keywords = [kw for kw in keywords if re.search(r"\b" + kw + r"\b", normalized_text, re.IGNORECASE)]

    summary = (
        f"Analyzed {doc_type} ({raw_size:,} bytes). "
        f"Extracted {word_count:,} words across {line_count:,} lines. "
        f"Identified architectural concepts: {', '.join(found_keywords[:6]) if found_keywords else 'General requirements'}."
    )

    return {
        "filename": filename,
        "file_size": raw_size,
        "doc_type": doc_type,
        "extracted_text": normalized_text,
        "character_count": char_count,
        "word_count": word_count,
        "line_count": line_count,
        "detected_concepts": found_keywords,
        "summary": summary
    }


def _extract_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF pages."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        pages_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                pages_text.append(f"--- Page {i + 1} ---\n{text.strip()}")
        return "\n\n".join(pages_text)
    except Exception as e:
        raise ValueError(f"PDF text extraction failed: {e}") from e


def _extract_from_docx(file_bytes: bytes) -> str:
    """Extract text, headings, and tables from Word docx."""
    try:
        import docx
        doc = docx.Document(io.BytesIO(file_bytes))
        sections = []

        # Extract paragraphs & headings
        for p in doc.paragraphs:
            txt = p.text.strip()
            if txt:
                if p.style and "Heading" in p.style.name:
                    sections.append(f"\n## {txt}\n")
                else:
                    sections.append(txt)

        # Extract tables
        for table in doc.tables:
            table_lines = []
            for row in table.rows:
                cells = [c.text.strip().replace("\n", " ") for c in row.cells]
                table_lines.append("| " + " | ".join(cells) + " |")
            if table_lines:
                sections.append("\n" + "\n".join(table_lines) + "\n")

        return "\n".join(sections)
    except Exception as e:
        raise ValueError(f"DOCX text extraction failed: {e}") from e


def _extract_from_json(file_bytes: bytes) -> str:
    """Pretty-format JSON architecture definitions into readable requirement lines."""
    try:
        content = _decode_text(file_bytes)
        data = json.loads(content)
        # If it's a list or dictionary, format cleanly
        return json.dumps(data, indent=2)
    except Exception as e:
        raise ValueError("Invalid JSON requirements") from e


def _extract_from_csv(file_bytes: bytes, delimiter: str = ",") -> str:
    """Convert CSV/TSV table rows into markdown table formatting."""
    try:
        import csv
        content = _decode_text(file_bytes)
        reader = csv.reader(io.StringIO(content), delimiter=delimiter)
        rows = list(reader)
        if not rows:
            return content

        output = []
        # Header
        header = rows[0]
        output.append("| " + " | ".join(header) + " |")
        output.append("| " + " | ".join(["---"] * len(header)) + " |")
        for row in rows[1:]:
            output.append("| " + " | ".join(row) + " |")
        return "\n".join(output)
    except Exception:
        return _decode_text(file_bytes)


def _extract_from_html_xml(file_bytes: bytes) -> str:
    """Strip HTML/XML tags and keep text structure."""
    text = _decode_text(file_bytes)
    # Remove script and style elements
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", text, flags=re.DOTALL | re.IGNORECASE)
    # Convert <br>, <p>, <li>, <h1>-<h6> to newlines
    text = re.sub(r"<(p|br|div|li|h[1-6])[^>]*>", "\n", text, flags=re.IGNORECASE)
    # Strip remaining tags
    text = re.sub(r"<[^>]+>", " ", text)
    # Decode basic entities
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return text


def _extract_from_rtf(file_bytes: bytes) -> str:
    """Basic RTF text stripper."""
    text = _decode_text(file_bytes)
    # Strip RTF control words
    text = re.sub(r"\\([a-z]{1,32})(-?\d+)? ?", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"[{}]", "", text)
    return text


def _decode_text(file_bytes: bytes, fallback_error: str = "") -> str:
    """Safely decode bytes using multiple encodings."""
    if file_bytes.startswith((b"\xff\xfe", b"\xfe\xff")):
        return file_bytes.decode("utf-16")
    if b"\x00" in file_bytes:
        raise ValueError("Binary content cannot be used as text requirements.")
    encodings = ["utf-8-sig", "cp1252"]
    for enc in encodings:
        try:
            return file_bytes.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue

    raise ValueError("Unsupported text encoding. Save the requirements as UTF-8.")


def _clean_text(text: str) -> str:
    """Remove excessive blank lines and trailing spaces."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    # Collapse 3+ newlines into 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _extract_from_xlsx(file_bytes: bytes) -> str:
    """Read cell values without running workbook macros or external links."""
    import zipfile
    import xml.etree.ElementTree as ET
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
        if sum(item.file_size for item in archive.infolist()) > 50 * 1024 * 1024:
            raise ValueError("Expanded workbook exceeds 50 MB.")
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(item.itertext()) for item in root.findall("s:si", ns)]
        output = []
        for name in sorted(archive.namelist()):
            if not re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name):
                continue
            root = ET.fromstring(archive.read(name))
            output.append(f"## {Path(name).stem}")
            for row in root.findall(".//s:row", ns):
                cells = []
                for cell in row.findall("s:c", ns):
                    value = cell.find("s:v", ns)
                    text = value.text if value is not None and value.text else ""
                    if cell.get("t") == "s" and text:
                        text = shared[int(text)]
                    elif cell.get("t") == "inlineStr":
                        text = "".join(t.text or "" for t in cell.findall("s:is//s:t", ns))
                    cells.append(text)
                if any(cells):
                    output.append(" | ".join(cells))
        return "\n".join(output)

