from __future__ import annotations

import hashlib
import hmac
import io
import json
import sys
import tempfile
import time
import unittest
import urllib.error
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lead_radar_bridge.e2e import (  # noqa: E402
    decrypt_password_envelope,
    encrypt_qr_envelope,
    envelope_encrypt,
    generate_rsa_identity,
)
from lead_radar_bridge.ledger import BridgeLedger, LedgerConflict, payload_digest  # noqa: E402
from lead_radar_bridge.mailbox import (  # noqa: E402
    HttpResponse,
    MailboxClient,
    system_https_transport,
)
from lead_radar_bridge.protocol import (  # noqa: E402
    SCHEMA,
    ProtocolError,
    b64url_encode,
    body_digest,
    response_signature_canonical,
    verify_registration_response,
    verify_signed_response,
)


DEVICE_ID = "lrtgbd_" + "a" * 32
COMMAND_ID = "lrtgbc_" + "b" * 32
PAIRING_ID = "lrtgbp_" + "c" * 32
NONCE = b64url_encode(b"n" * 16)
SECRET = b"s" * 32


class BridgeProtocolTests(unittest.TestCase):
    def test_poll_rejection_distinguishes_stale_device_from_server_failure(self) -> None:
        def response(status: int):
            return lambda *_args: HttpResponse(status=status, headers={}, body=b"")

        for status, expected in (
            (401, "poll_device_unauthorized"),
            (404, "poll_device_unavailable"),
            (429, "poll_rate_limited"),
            (503, "poll_server_unavailable"),
        ):
            client = MailboxClient(
                "https://lead-radar-bridge.gptbot.uz",
                device_id=DEVICE_ID,
                device_secret=SECRET,
                transport=response(status),
            )
            with self.subTest(status=status), self.assertRaisesRegex(ProtocolError, expected):
                client.poll("1.3.2")

    def test_server_signatures_are_direction_bound_and_tamper_evident(self) -> None:
        now = int(time.time())
        raw = b'{"schema":"gptbot.lead-radar.telegram-bridge.v1","status":"idle"}'
        canonical = response_signature_canonical(
            device_id=DEVICE_ID,
            request_nonce=NONCE,
            server_timestamp=now,
            path="/v1/bridge/poll",
            command_id="idle",
            sequence=0,
            expires_at="none",
            raw_body=raw,
        )
        signature = b64url_encode(hmac.new(SECRET, canonical, hashlib.sha256).digest())
        headers = {
            "x-lead-radar-server-timestamp": str(now),
            "x-lead-radar-request-nonce": NONCE,
            "x-lead-radar-server-signature": signature,
        }
        verify_signed_response(
            headers=headers,
            device_id=DEVICE_ID,
            device_secret=SECRET,
            request_nonce=NONCE,
            path="/v1/bridge/poll",
            command_id="idle",
            sequence=0,
            expires_at="none",
            raw_body=raw,
            now=now,
        )
        with self.assertRaises(ProtocolError):
            verify_signed_response(
                headers=headers,
                device_id=DEVICE_ID,
                device_secret=SECRET,
                request_nonce=NONCE,
                path="/v1/bridge/poll",
                command_id="idle",
                sequence=0,
                expires_at="none",
                raw_body=raw + b" ",
                now=now,
            )

    def test_registration_response_is_signed_over_request_and_response(self) -> None:
        now = int(time.time())
        request = b'{"pairing":"fixture"}'
        response = b'{"device":"fixture"}'
        canonical = (
            f"LRTG-BRIDGE-V1\nSERVER-TO-DEVICE-REGISTER\n{PAIRING_ID}\n{DEVICE_ID}\n"
            f"{now}\n{body_digest(request)}\n{body_digest(response)}"
        ).encode()
        headers = {
            "x-lead-radar-server-timestamp": str(now),
            "x-lead-radar-registration-signature": b64url_encode(
                hmac.new(SECRET, canonical, hashlib.sha256).digest()
            ),
        }
        verify_registration_response(
            headers=headers,
            pairing_id=PAIRING_ID,
            device_id=DEVICE_ID,
            device_secret=SECRET,
            request_body=request,
            response_body=response,
            now=now,
        )
        with self.assertRaises(ProtocolError):
            verify_registration_response(
                headers=headers,
                pairing_id=PAIRING_ID,
                device_id=DEVICE_ID,
                device_secret=SECRET,
                request_body=request,
                response_body=response + b"x",
                now=now,
            )

    def test_https_transport_never_follows_redirect_with_device_headers(self) -> None:
        seen: list[tuple[str, dict[str, str], bytes]] = []

        class Opener:
            def open(self, request, timeout=0):  # type: ignore[no-untyped-def]
                seen.append((request.full_url, dict(request.headers), request.data))
                raise urllib.error.HTTPError(
                    request.full_url,
                    302,
                    "redirect",
                    {"Location": "https://attacker.invalid/capture"},
                    io.BytesIO(b""),
                )

        with mock.patch("urllib.request.build_opener", return_value=Opener()):
            response = system_https_transport(
                "POST",
                "https://lead-radar-bridge.gptbot.uz/v1/bridge/poll",
                {"X-Lead-Radar-Device-Token": "fixture-token-placeholder"},
                b"{}",
                1_000,
            )
        self.assertEqual(response.status, 302)
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0][0], "https://lead-radar-bridge.gptbot.uz/v1/bridge/poll")
        self.assertEqual(
            seen[0][1].get("User-agent"),
                "GPTBot-LeadRadar-Telegram-Bridge/1.3.2",
        )

    def test_qr_and_password_envelopes_bind_exact_context_and_key(self) -> None:
        identity = generate_rsa_identity(2048)
        expires = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 60))
        qr = encrypt_qr_envelope(
            public_key_spki=identity.public_key_spki,
            key_id=identity.key_id,
            org_id="org_" + "a" * 32,
            device_id=DEVICE_ID,
            command_id=COMMAND_ID,
            auth_id="auth_fixture_123456",
            expires_at=expires,
            qr_login_url="tg://login?token=" + "A" * 32,
        )
        self.assertEqual(qr["key_id"], identity.key_id)
        self.assertLessEqual(len(qr["ciphertext"]), 131_072)

        password_context = {
            "schema": SCHEMA,
            "purpose": "password",
            "org_id": "org_" + "a" * 32,
            "device_id": DEVICE_ID,
            "command_id": COMMAND_ID,
            "auth_id": "auth_fixture_123456",
            "expires_at": expires,
            "password": "fixture-password-placeholder",
        }
        password = envelope_encrypt(identity.public_key_spki, password_context)
        self.assertEqual(
            decrypt_password_envelope(
                identity.private_key_pkcs8,
                password,
                key_id=identity.key_id,
                org_id=password_context["org_id"],
                device_id=DEVICE_ID,
                command_id=COMMAND_ID,
                auth_id=password_context["auth_id"],
            ),
            "fixture-password-placeholder",
        )
        with self.assertRaises(ProtocolError):
            decrypt_password_envelope(
                identity.private_key_pkcs8,
                password,
                key_id=identity.key_id,
                org_id="org_" + "b" * 32,
                device_id=DEVICE_ID,
                command_id=COMMAND_ID,
                auth_id=password_context["auth_id"],
            )


class BridgeLedgerTests(unittest.TestCase):
    def test_send_effect_is_permanent_and_unknown_inflight_never_retries(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            ledger = BridgeLedger(Path(folder) / "ledger.sqlite3")
            try:
                effect = "effect_fixture_1234"
                digest = payload_digest({"text": "Здравствуйте 👋"})
                self.assertEqual(ledger.reserve_send(effect, digest).kind, "reserved")
                recovered = ledger.reserve_send(effect, digest)
                self.assertEqual(recovered.kind, "replay")
                self.assertEqual(recovered.result, {"kind": "ambiguous"})
                self.assertEqual(ledger.reserve_send(effect, digest).result, {"kind": "ambiguous"})
                with self.assertRaises(LedgerConflict):
                    ledger.reserve_send(effect, "f" * 64)
            finally:
                ledger.close()

    def test_unacknowledged_result_is_exact_durable_outbox(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            ledger = BridgeLedger(Path(folder) / "ledger.sqlite3")
            body = {
                "schema": SCHEMA,
                "command_id": COMMAND_ID,
                "sequence": 1,
                "status": "progress",
                "result_code": "awaiting_qr",
                "result": {"auth_id": "auth_fixture_123456"},
            }
            try:
                self.assertTrue(ledger.store_result(body, terminal=False))
                self.assertEqual(ledger.pending_result(COMMAND_ID), body)
                self.assertFalse(ledger.store_result(body, terminal=False))
                altered = json.loads(json.dumps(body))
                altered["result_code"] = "awaiting_password"
                with self.assertRaises(LedgerConflict):
                    ledger.store_result(altered, terminal=False)
                ledger.acknowledge_result(body)
                self.assertIsNone(ledger.pending_result(COMMAND_ID))
            finally:
                ledger.close()


if __name__ == "__main__":
    unittest.main()
