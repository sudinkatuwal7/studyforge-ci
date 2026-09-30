"""Upload-time PDF structure validation; never extracts page text."""

import hashlib
import re
import unicodedata

from pypdf import PdfReader

from apps.documents.errors import DocumentAPIError


MAX_PDF_BYTES = 20 * 1024 * 1024


def validate_pdf(upload):
    if not upload.size:
        raise DocumentAPIError("EMPTY_FILE")
    if upload.size > MAX_PDF_BYTES:
        raise DocumentAPIError("FILE_TOO_LARGE", 413)

    name = (upload.name or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(char for char in name if not unicodedata.category(char).startswith("C"))
    if not name.lower().endswith(".pdf") or not name[:-4].strip():
        raise DocumentAPIError("INVALID_PDF")
    name = name[:251] + name[-4:] if len(name) > 255 else name

    digest = hashlib.sha256()
    size = 0
    for chunk in upload.chunks():
        size += len(chunk)
        if size > MAX_PDF_BYTES:
            raise DocumentAPIError("FILE_TOO_LARGE", 413)
        digest.update(chunk)
    if not size:
        raise DocumentAPIError("EMPTY_FILE")

    try:
        upload.seek(0)
        if not re.match(rb"%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)", upload.read(16)):
            raise DocumentAPIError("INVALID_PDF")
        upload.seek(0)
        reader = PdfReader(upload, strict=True)
        if reader.is_encrypted:
            raise DocumentAPIError("UNSUPPORTED_PDF")
        if not len(reader.pages):
            raise DocumentAPIError("INVALID_PDF")
        # Force lazy page references and required geometry to be read. Image-only
        # and blank pages remain valid; text/content extraction belongs to the worker.
        for page in reader.pages:
            if page.get("/Type") != "/Page":
                raise DocumentAPIError("INVALID_PDF")
            box = page.mediabox
            if len(box) != 4:
                raise DocumentAPIError("INVALID_PDF")
            for coordinate in box:
                float(coordinate)
    except DocumentAPIError:
        raise
    except Exception as exc:
        # Parser failures must not leak document content or parser internals.
        raise DocumentAPIError("INVALID_PDF") from exc
    finally:
        upload.seek(0)

    return name, digest.hexdigest()
