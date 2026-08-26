from __future__ import annotations

import hashlib
import io
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from PIL import Image, ImageOps, UnidentifiedImageError

from .protocol import DIGEST, MEDIA_ID, ProtocolError
from .security import secure_directory, secure_file


MAX_MEDIA_BYTES = 5_000_000
MAX_PIXELS = 25_000_000
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def _magic_matches(value: bytes, mime_type: str) -> bool:
    if mime_type == "image/jpeg":
        return value.startswith(b"\xff\xd8\xff")
    if mime_type == "image/png":
        return value.startswith(b"\x89PNG\r\n\x1a\n")
    return len(value) >= 12 and value[:4] == b"RIFF" and value[8:12] == b"WEBP"


def verify_media_bytes(
    value: bytes,
    *,
    media_id: str,
    media_digest: str,
    mime_type: str,
    size_bytes: int,
) -> None:
    if not MEDIA_ID.fullmatch(media_id) or not DIGEST.fullmatch(media_digest):
        raise ProtocolError("media_identity_invalid")
    if mime_type not in ALLOWED_MIME:
        raise ProtocolError("media_type_invalid")
    if not isinstance(size_bytes, int) or isinstance(size_bytes, bool):
        raise ProtocolError("media_size_invalid")
    if not 1 <= size_bytes <= MAX_MEDIA_BYTES or len(value) != size_bytes:
        raise ProtocolError("media_size_invalid")
    if not _magic_matches(value, mime_type):
        raise ProtocolError("media_magic_invalid")
    if hashlib.sha256(value).hexdigest() != media_digest:
        raise ProtocolError("media_digest_invalid")


def sanitize_static_image(value: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(value)) as source:
            if getattr(source, "n_frames", 1) != 1 or getattr(source, "is_animated", False):
                raise ProtocolError("media_multiframe_rejected")
            source.verify()
        with Image.open(io.BytesIO(value)) as decoded:
            decoded.load()
            if decoded.width < 1 or decoded.height < 1 or decoded.width * decoded.height > MAX_PIXELS:
                raise ProtocolError("media_dimensions_invalid")
            oriented = ImageOps.exif_transpose(decoded)
            if oriented.mode in {"RGBA", "LA"} or "transparency" in oriented.info:
                rgba = oriented.convert("RGBA")
                rgb = Image.new("RGB", rgba.size, (255, 255, 255))
                rgb.paste(rgba, mask=rgba.getchannel("A"))
            else:
                rgb = oriented.convert("RGB")
            output = io.BytesIO()
            # Static canonical JPEG strips EXIF/GPS/profiles and avoids sending
            # attacker-controlled container metadata to Telegram.
            rgb.save(output, format="JPEG", quality=92, optimize=True, progressive=False)
            sanitized = output.getvalue()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError) as exc:
        raise ProtocolError("media_decode_invalid") from exc
    if not sanitized.startswith(b"\xff\xd8\xff") or not 1 <= len(sanitized) <= MAX_MEDIA_BYTES:
        raise ProtocolError("media_sanitized_invalid")
    return sanitized


@contextmanager
def private_photo_file(value: bytes, secure_root: Path) -> Iterator[Path]:
    if os.name == "nt":
        secure_directory(secure_root)
    else:
        secure_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(secure_root, 0o700)
    descriptor, raw_path = tempfile.mkstemp(prefix="photo-", suffix=".jpg", dir=secure_root)
    path = Path(raw_path)
    try:
        if os.name == "nt":
            secure_file(path)
        else:
            os.chmod(path, 0o600)
        with os.fdopen(descriptor, "wb", closefd=True) as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        yield path
    finally:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
