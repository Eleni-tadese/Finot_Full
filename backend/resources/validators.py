"""
Upload validation for study materials.

Limits follow the Cloudinary free plan (10 MB per document or image, larger for video).
Raise them with MATERIAL_MAX_DOCUMENT_MB / MATERIAL_MAX_VIDEO_MB in settings after
upgrading the plan.

Besides size and extension, the first bytes of the file are compared with what the
extension promises, so a renamed program or script cannot be uploaded as ".pdf".
"""
import os

from django.conf import settings
from django.core.exceptions import ValidationError

DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
VIDEO_EXTENSIONS = {".mp4"}
ALLOWED_EXTENSIONS = DOCUMENT_EXTENSIONS | IMAGE_EXTENSIONS | VIDEO_EXTENSIONS

_ZIP = (b"PK\x03\x04",)  # docx / pptx / xlsx are zip containers
_OLE = (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",)  # legacy doc / ppt / xls
_SIGNATURES = {
    ".pdf": (b"%PDF-",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".docx": _ZIP, ".pptx": _ZIP, ".xlsx": _ZIP,
    ".doc": _OLE, ".ppt": _OLE, ".xls": _OLE,
}


def max_size_bytes(extension):
    if extension in VIDEO_EXTENSIONS:
        return getattr(settings, "MATERIAL_MAX_VIDEO_MB", 100) * 1024 * 1024
    return getattr(settings, "MATERIAL_MAX_DOCUMENT_MB", 10) * 1024 * 1024


def _mb(size):
    return f"{size / (1024 * 1024):.1f} MB"


def _matches_signature(extension, head):
    if extension == ".mp4":
        return head[4:8] == b"ftyp"
    if extension == ".txt":
        return b"\x00" not in head  # plain text never contains NUL bytes
    return head.startswith(_SIGNATURES[extension])


def validate_material_file(file):
    """Validate an uploaded file. Raises django.core.exceptions.ValidationError."""
    name = os.path.basename(file.name or "")
    extension = os.path.splitext(name)[1].lower()

    if extension not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(e.lstrip(".") for e in ALLOWED_EXTENSIONS))
        raise ValidationError(
            f"File type '{extension or 'none'}' is not allowed. Allowed types: {allowed}."
        )

    if file.size == 0:
        raise ValidationError("The file is empty.")

    limit = max_size_bytes(extension)
    if file.size > limit:
        raise ValidationError(
            f"The file is too large ({_mb(file.size)}). "
            f"The maximum for {extension} files is {_mb(limit)}."
        )

    position = file.tell() if hasattr(file, "tell") else 0
    try:
        file.seek(0)
        head = file.read(16)
    finally:
        file.seek(position)
    if not _matches_signature(extension, head):
        raise ValidationError(
            f"The file content does not look like a real {extension} file. Check that it was not renamed."
        )


def validate_material_url(url):
    """Only plain web links are allowed (no ftp:, javascript:, data: ...)."""
    if url and not url.lower().startswith(("http://", "https://")):
        raise ValidationError("Only http:// and https:// links are allowed.")
