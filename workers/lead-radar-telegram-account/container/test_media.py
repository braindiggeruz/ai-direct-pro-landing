import base64
import hashlib
import io
import json
import os
import shutil
import struct
import sys
import types
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image

try:
    import qrcode  # noqa: F401
except ModuleNotFoundError:
    qrcode_stub = types.ModuleType("qrcode")
    qrcode_stub.make = lambda _value: None
    sys.modules["qrcode"] = qrcode_stub

from correlation import SendCorrelation
from server import (
    correlated_send_result,
    MediaValidationError,
    sent_message_result,
    TdClient,
    input_message_content,
    sanitize_media_to_local_file,
    validate_media_for_preapproval,
)


EXACT_TEXT = (
    "  Здравствуйте, Oʻzbekiston! 👨‍👩‍👧‍👦 e\u0301\n"
    "\n"
    "*markdown* <b>html</b> https://example.uz/path?q=1\n"
    "\n"
    "Финальная строка  "
)


class MediaContractTests(unittest.TestCase):
    def test_send_update_classification_is_fail_closed(self) -> None:
        self.assertEqual(sent_message_result({"id": 91}), {
            "schema": "gptbot.lead-radar.tdlib-container.v1",
            "status": "sent",
            "provider_message_id": "91",
        })
        for malformed in (
            {},
            {"id": None},
            {"id": "91"},
            {"id": True},
        ):
            self.assertEqual(sent_message_result(malformed)["status"], "ambiguous")

        self.assertEqual(correlated_send_result({
            "@type": "updateMessageSendSucceeded",
            "message": {"id": 92},
        })["status"], "sent")
        self.assertEqual(correlated_send_result({
            "@type": "updateMessageSendFailed",
            "error": {"code": 400, "message": "CHAT_WRITE_FORBIDDEN"},
        })["status"], "rejected")
        for malformed in (
            None,
            {},
            {"@type": "unknownSendUpdate"},
            {"@type": "updateMessageSendSucceeded", "message": {}},
            {"@type": "updateMessageSendSucceeded", "message": {"id": "92"}},
            {"@type": "updateMessageSendFailed"},
            {"@type": "updateMessageSendFailed", "error": {}},
            {"@type": "updateMessageSendFailed", "error": {"code": True, "message": "FAIL"}},
            {"@type": "updateMessageSendFailed", "error": {"code": 400, "message": ""}},
        ):
            self.assertEqual(correlated_send_result(malformed)["status"], "ambiguous")

    def test_preapproval_rejects_invalid_huffman_without_send_effect(self) -> None:
        source = Image.new("RGB", (16, 16), (12, 34, 56))
        buffer = io.BytesIO()
        source.save(buffer, format="JPEG")
        raw = bytearray(buffer.getvalue())
        dht_offset = raw.find(b"\xff\xc4")
        self.assertGreater(dht_offset, 0)
        # Corrupt the first Huffman code-count byte while keeping the JPEG
        # marker framing, MIME magic, byte length and digest self-consistent.
        raw[dht_offset + 5] = 0xff
        envelope = {
            "media_id": "lrtgcm_" + "f" * 32,
            "media_digest": hashlib.sha256(raw).hexdigest(),
            "mime_type": "image/jpeg",
            "size_bytes": len(raw),
            "base64": base64.b64encode(raw).decode("ascii"),
        }
        send_calls: list[tuple[object, ...]] = []
        original_send = TdClient.send_message

        def forbidden_send(*args: object, **_kwargs: object) -> dict[str, object]:
            send_calls.append(args)
            raise AssertionError("media validation must not call sendMessage")

        TdClient.send_message = forbidden_send  # type: ignore[method-assign]
        try:
            result = validate_media_for_preapproval({
                "schema": "gptbot.lead-radar.tdlib-container.v1",
                "media": envelope,
            })
        finally:
            TdClient.send_message = original_send  # type: ignore[method-assign]
        self.assertEqual(result, {
            "schema": "gptbot.lead-radar.tdlib-container.v1",
            "status": "rejected",
            "code": "media_invalid",
        })
        self.assertEqual(send_calls, [])

    @staticmethod
    def _solid_rgba_png(width: int, height: int) -> bytes:
        def chunk(kind: bytes, payload: bytes) -> bytes:
            return (
                struct.pack(">I", len(payload))
                + kind
                + payload
                + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
            )

        compressor = zlib.compressobj(level=9)
        compressed: list[bytes] = []
        row = b"\x00" + (b"\x00\x00\x00\x00" * width)
        for _ in range(height):
            part = compressor.compress(row)
            if part:
                compressed.append(part)
        compressed.append(compressor.flush())
        ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
        return (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", b"".join(compressed))
            + chunk(b"IEND", b"")
        )

    def test_text_and_photo_preserve_exact_plain_caption(self) -> None:
        text_content = input_message_content(EXACT_TEXT)
        self.assertEqual(text_content["text"], {
            "@type": "formattedText", "text": EXACT_TEXT, "entities": [],
        })
        self.assertTrue(text_content["link_preview_options"]["is_disabled"])

        photo_content = input_message_content(
            EXACT_TEXT,
            (Path("/tmp/exact-photo.jpg"), 1200, 800),
        )
        self.assertEqual(photo_content["caption"], {
            "@type": "formattedText", "text": EXACT_TEXT, "entities": [],
        })
        self.assertFalse(photo_content["show_caption_above_media"])
        self.assertEqual(photo_content["photo"]["@type"], "inputPhoto")
        self.assertEqual(photo_content["photo"]["photo"]["@type"], "inputFileLocal")
        self.assertEqual(photo_content["photo"]["photo"], {
            "@type": "inputFileLocal", "path": str(Path("/tmp/exact-photo.jpg")),
        })

    def test_jpeg_is_orientation_corrected_and_metadata_stripped(self) -> None:
        source = Image.new("RGB", (2, 3), (20, 40, 60))
        exif = Image.Exif()
        exif[274] = 6
        exif[270] = "private metadata"
        buffer = io.BytesIO()
        source.save(buffer, format="JPEG", exif=exif)
        raw = buffer.getvalue()
        envelope = {
            "media_id": "lrtgcm_" + "a" * 32,
            "media_digest": hashlib.sha256(raw).hexdigest(),
            "mime_type": "image/jpeg",
            "size_bytes": len(raw),
            "base64": base64.b64encode(raw).decode("ascii"),
        }
        directory, path, width, height = sanitize_media_to_local_file(envelope)
        try:
            self.assertEqual((width, height), (3, 2))
            if os.name != "nt":
                self.assertEqual(os.stat(directory).st_mode & 0o777, 0o700)
                self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            with Image.open(path) as sanitized:
                self.assertEqual(sanitized.format, "JPEG")
                self.assertEqual(sanitized.mode, "RGB")
                self.assertEqual(sanitized.size, (3, 2))
                self.assertEqual(len(sanitized.getexif()), 0)
                self.assertEqual(getattr(sanitized, "n_frames", 1), 1)
        finally:
            shutil.rmtree(directory, ignore_errors=True)

    def test_provider_payload_is_one_effect_and_caption_is_byte_exact(self) -> None:
        source = Image.new("RGB", (6, 4), (10, 120, 230))
        buffer = io.BytesIO()
        source.save(buffer, format="PNG")
        raw = buffer.getvalue()
        media = {
            "media_id": "lrtgcm_" + "b" * 32,
            "media_digest": hashlib.sha256(raw).hexdigest(),
            "mime_type": "image/png",
            "size_bytes": len(raw),
            "base64": base64.b64encode(raw).decode("ascii"),
        }
        client = object.__new__(TdClient)
        client.authorization_state = "connected"
        client._send_correlation = SendCorrelation(maximum_early_results=8)
        requests = []

        def fake_request(payload, _timeout=25.0):
            requests.append(payload)
            if payload["@type"] == "searchPublicChat":
                return {"id": 42, "type": {"@type": "chatTypePrivate", "user_id": 7}}
            if payload["@type"] == "getUser":
                return {"type": {"@type": "userTypeRegular"}}
            if payload["@type"] == "sendMessage":
                local_path = Path(payload["input_message_content"]["photo"]["photo"]["path"])
                self.assertTrue(local_path.is_file())
                return {"id": 99, "sending_state": None}
            raise AssertionError(payload)

        client.request = fake_request
        result = client.send_message("clinic_test", EXACT_TEXT, "lrtgce_" + "c" * 32, media)
        self.assertEqual(result["status"], "sent")
        send_requests = [item for item in requests if item["@type"] == "sendMessage"]
        self.assertEqual(len(send_requests), 1)
        content = send_requests[0]["input_message_content"]
        self.assertEqual(content["caption"]["text"], EXACT_TEXT)
        self.assertEqual(content["caption"]["entities"], [])
        self.assertFalse(content["show_caption_above_media"])
        sent_path = Path(content["photo"]["photo"]["path"])
        self.assertFalse(sent_path.exists())

    def test_text_only_payload_preserves_whitespace_and_has_no_parse_mode(self) -> None:
        client = object.__new__(TdClient)
        client.authorization_state = "connected"
        client._send_correlation = SendCorrelation(maximum_early_results=8)
        requests: list[dict[str, object]] = []

        def fake_request(payload, _timeout=25.0):
            requests.append(payload)
            if payload["@type"] == "searchPublicChat":
                return {"id": 42, "type": {"@type": "chatTypePrivate", "user_id": 7}}
            if payload["@type"] == "getUser":
                return {"type": {"@type": "userTypeRegular"}}
            if payload["@type"] == "sendMessage":
                return {"id": 100, "sending_state": None}
            raise AssertionError(payload)

        client.request = fake_request
        result = client.send_message(
            "clinic_test", EXACT_TEXT, "lrtgce_" + "d" * 32, None
        )
        self.assertEqual(result["status"], "sent")
        send_requests = [item for item in requests if item["@type"] == "sendMessage"]
        self.assertEqual(len(send_requests), 1)
        content = send_requests[0]["input_message_content"]
        self.assertEqual(content["@type"], "inputMessageText")
        self.assertEqual(content["text"], {
            "@type": "formattedText", "text": EXACT_TEXT, "entities": [],
        })
        self.assertTrue(content["text"]["text"].startswith("  "))
        self.assertTrue(content["text"]["text"].endswith("  "))
        self.assertNotIn("parse_mode", json.dumps(send_requests[0]))

    def test_highly_compressible_25mp_rgba_is_rejected_without_temp_leak(self) -> None:
        raw = self._solid_rgba_png(5000, 5000)
        self.assertLess(len(raw), 5_000_000)
        envelope = {
            "media_id": "lrtgcm_" + "d" * 32,
            "media_digest": hashlib.sha256(raw).hexdigest(),
            "mime_type": "image/png",
            "size_bytes": len(raw),
            "base64": base64.b64encode(raw).decode("ascii"),
        }
        before = {path.name for path in Path("/tmp").glob("lead-radar-photo-*")}
        with self.assertRaises(MediaValidationError):
            sanitize_media_to_local_file(envelope)
        after = {path.name for path in Path("/tmp").glob("lead-radar-photo-*")}
        self.assertEqual(after, before)


if __name__ == "__main__":
    unittest.main()
