from __future__ import annotations

import asyncio
import datetime as dt
import threading
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lead_radar_bridge.ledger import BridgeLedger, payload_digest  # noqa: E402
from lead_radar_bridge.protocol import BridgeCommand, ProtocolError  # noqa: E402
from lead_radar_bridge.runtime import BridgeRuntime, safe_poll_error_code  # noqa: E402


DEVICE_ID = "lrtgbd_" + "a" * 32
COMMAND_ID = "lrtgbc_" + "b" * 32
AUTH_ID = "auth_fixture_123456"
ACCOUNT_REF = "lracct_" + "c" * 43
ORG_ID = "org_" + "d" * 32


class BridgePollDiagnosticTests(unittest.TestCase):
    def test_poll_diagnostics_are_allowlisted_and_never_echo_exception_text(self) -> None:
        secret = "fixture-secret-that-must-not-be-logged"
        self.assertEqual(
            safe_poll_error_code(ProtocolError("poll_device_unauthorized")),
            "poll_device_unauthorized",
        )
        self.assertEqual(
            safe_poll_error_code(ProtocolError(secret)),
            "poll_protocol_invalid",
        )
        self.assertNotIn(secret, safe_poll_error_code(ProtocolError(secret)))
        self.assertEqual(safe_poll_error_code(TimeoutError(secret)), "poll_timeout")
        self.assertEqual(safe_poll_error_code(OSError(secret)), "poll_network_failed")


def iso_after(seconds: int) -> str:
    return (
        dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=seconds)
    ).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class FakeVault:
    def __init__(self) -> None:
        self.saved: list[dict[str, object]] = []

    def save(self, value: dict[str, object]) -> None:
        self.saved.append(value)


class FakeLogger:
    def info(self, _event: str) -> None: pass
    def warning(self, _event: str) -> None: pass


class FakeMailbox:
    def __init__(self, command: BridgeCommand) -> None:
        self.command = command
        self.fail_submit = False
        self.download_error: BaseException | None = None
        self.download_calls = 0
        self.submitted: list[dict[str, object]] = []

    def poll(self, _version: str):
        return self.command, 30

    def submit_result(self, _command: BridgeCommand, body: dict[str, object]) -> None:
        self.submitted.append(body)
        if self.fail_submit:
            raise OSError("fixture transport loss")

    def download_media(self, *_args):
        self.download_calls += 1
        if self.download_error is not None:
            raise self.download_error
        raise AssertionError("media not expected")


class FakeTelegram:
    def __init__(self) -> None:
        self.begin_calls = 0
        self.logout_calls = 0
        self.logout_failures = 0
        self.authorized = False
        self.photo_calls = 0
        self.text_calls = 0
        self.pending_phone = None
        self.pending_phone_code_hash = None
        self.phone_error: BaseException | None = None

    async def begin_qr(self, _auth_id: str) -> str:
        self.begin_calls += 1
        return "tg://login?token=" + "A" * 32

    async def begin_phone(self, _auth_id: str) -> None:
        self.begin_calls += 1

    async def submit_phone(self, phone: str) -> str:
        if self.phone_error is not None:
            raise self.phone_error
        self.pending_phone = phone
        self.pending_phone_code_hash = "hash-12345678"
        return self.pending_phone_code_hash

    async def submit_code(self, _code: str, *, phone: str, phone_code_hash: str) -> str:
        assert phone == self.pending_phone
        assert phone_code_hash == self.pending_phone_code_hash
        self.authorized = True
        return "connected"

    def export_session(self) -> str:
        return "fixture-string-session-placeholder"

    async def is_authorized(self) -> bool:
        return self.authorized

    async def wait_qr(self, timeout_seconds: int = 1) -> str:
        return "awaiting_qr"

    async def connected_identity(self, expected: str):
        return expected, "@c•••z"

    async def logout(self) -> None:
        self.logout_calls += 1
        if self.logout_calls <= self.logout_failures:
            raise OSError("fixture logout uncertainty")

    async def close_unauthorized_auth(self) -> None: pass
    async def probe(self) -> str: return "connected"

    async def send_photo(self, *_args):
        self.photo_calls += 1
        raise AssertionError("provider must not be called")

    async def send_text(self, *_args):
        self.text_calls += 1
        raise AssertionError("provider must not be called")


def connect_command() -> BridgeCommand:
    return BridgeCommand(
        COMMAND_ID,
        "connect",
        1,
        iso_after(90),
        {
            "org_id": ORG_ID,
            "auth_id": AUTH_ID,
            "account_ref": ACCOUNT_REF,
            "browser_key": {
                "alg": "RSA-OAEP-256",
                "key_id": "e" * 64,
                "spki": "fixture-spki-placeholder",
                "expires_at": iso_after(80),
            },
            "expires_at": iso_after(540),
        },
    )


def disconnect_command() -> BridgeCommand:
    return BridgeCommand(
        COMMAND_ID,
        "disconnect",
        1,
        iso_after(90),
        {"account_ref": ACCOUNT_REF, "auth_id": AUTH_ID},
    )


def phone_connect_command(command_id: str = COMMAND_ID) -> BridgeCommand:
    return BridgeCommand(
        command_id,
        "connect_phone",
        1,
        iso_after(90),
        {
            "org_id": ORG_ID,
            "auth_id": AUTH_ID,
            "account_ref": ACCOUNT_REF,
            "expires_at": iso_after(540),
        },
    )


def auth_input_command(command_id: str, action: str) -> BridgeCommand:
    return BridgeCommand(
        command_id,
        "submit_auth",
        1,
        iso_after(90),
        {"org_id": ORG_ID, "auth_id": AUTH_ID, "action": action, "auth_envelope": {}},
    )


def send_media_command() -> BridgeCommand:
    return BridgeCommand(
        COMMAND_ID,
        "send",
        1,
        iso_after(90),
        {
            "effect_id": "effect_fixture_123456",
            "account_ref": ACCOUNT_REF,
            "endpoint": "clinic_uz",
            "text": "Exact caption",
            "link_preview": False,
            "media": {
                "media_id": "lrtgcm_" + "f" * 32,
                "media_digest": "0" * 64,
                "mime_type": "image/png",
                "size_bytes": 8,
                "download_path": f"/v1/bridge/commands/{COMMAND_ID}/media",
            },
            "paid_message_policy": "reject",
            "allow_paid_floodskip": False,
        },
    )


def send_text_command() -> BridgeCommand:
    command = send_media_command()
    return BridgeCommand(
        command.id,
        command.kind,
        command.attempt,
        command.lease_expires_at,
        {**command.payload, "media": None, "text": "Exact plain text"},
    )


def validate_media_command() -> BridgeCommand:
    media = send_media_command().payload["media"]
    return BridgeCommand(
        COMMAND_ID,
        "validate_media",
        1,
        iso_after(90),
        {"media": media},
    )


class BridgeRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_mailbox_io_does_not_block_telegram_event_loop(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            runtime, ledger, mailbox, _telegram, _state = self.make_runtime(folder, phone_connect_command())
            released = threading.Event()
            def blocking_poll(_version):
                if not released.wait(0.5):
                    raise AssertionError("mailbox blocked event loop")
                return None, 2
            mailbox.poll = blocking_poll
            asyncio.get_running_loop().call_later(0.02, released.set)
            try:
                self.assertEqual(await runtime.run_once(), 2)
            finally:
                ledger.close()

    async def test_failed_provider_probe_never_finalizes_local_custody(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            runtime, ledger, _mailbox, telegram, state = self.make_runtime(folder, phone_connect_command())
            try:
                await runtime.run_once()
                telegram.probe = mock.AsyncMock(side_effect=TimeoutError())
                probe = BridgeCommand("lrtgbc_" + "f" * 32, "probe", 1, iso_after(90), {"account_ref": ACCOUNT_REF, "finalize_auth_id": AUTH_ID})
                with self.assertRaises(TimeoutError):
                    await runtime._probe(probe)
                self.assertEqual(ledger.auth_custody(AUTH_ID)["state"], "provisional")
                self.assertEqual(state["telegram"]["custody"], "provisional")
            finally:
                ledger.close()

    def make_runtime(self, folder: str, command: BridgeCommand):
        ledger = BridgeLedger(Path(folder) / "ledger.sqlite3")
        mailbox = FakeMailbox(command)
        telegram = FakeTelegram()
        state = {
            "device": {
                "device_id": DEVICE_ID,
                "private_key_pkcs8": "fixture-private-key-placeholder",
                "key_id": "e" * 64,
            },
            "telegram": {
                "api_id": 123456,
                "api_hash": "a" * 32,
                "session": "fixture-string-session-placeholder",
                "auth_id": None,
                "account_ref": None,
                "custody": "revoked",
                "expires_at": 0,
            },
        }
        with mock.patch("lead_radar_bridge.runtime._safe_logger", return_value=FakeLogger()):
            runtime = BridgeRuntime(
                root=Path(folder),
                vault=FakeVault(),
                ledger=ledger,
                mailbox=mailbox,
                telegram=telegram,
                vault_state=state,
            )
        return runtime, ledger, mailbox, telegram, state

    async def test_lost_connect_result_ack_replays_exact_body_without_new_qr(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            runtime, ledger, mailbox, telegram, _state = self.make_runtime(folder, connect_command())
            mailbox.fail_submit = True
            with mock.patch(
                "lead_radar_bridge.runtime.encrypt_qr_envelope",
                return_value={"fixture": "ciphertext"},
            ):
                await runtime.run_once()
                pending = ledger.pending_result(COMMAND_ID)
                self.assertIsNotNone(pending)
                self.assertEqual(telegram.begin_calls, 1)
                mailbox.fail_submit = False
                await runtime.run_once()
                self.assertIsNone(ledger.pending_result(COMMAND_ID))
                await runtime.run_once()
                self.assertEqual(telegram.begin_calls, 1)
                self.assertTrue(all(body == mailbox.submitted[0] for body in mailbox.submitted[:2]))
            ledger.close()

    async def test_phone_then_code_connects_without_exposing_plaintext_to_mailbox(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            runtime, ledger, mailbox, telegram, state = self.make_runtime(
                folder, phone_connect_command(),
            )
            await runtime.handle_command(mailbox.command)
            self.assertEqual(mailbox.submitted[-1]["result_code"], "awaiting_phone")
            relay_expires = dt.datetime.fromisoformat(
                str(mailbox.submitted[-1]["result"]["expires_at"]).replace("Z", "+00:00"),
            ).timestamp()
            self.assertGreater(relay_expires, time.time() + 300)
            phone_command = auth_input_command("lrtgbc_" + "c" * 32, "phone")
            with mock.patch(
                "lead_radar_bridge.runtime.envelope_decrypt_context",
                return_value="+998901234567",
            ):
                await runtime.handle_command(phone_command)
            self.assertEqual(mailbox.submitted[-1]["result_code"], "awaiting_code")
            self.assertEqual(state["telegram"]["pending_phone"], "+998901234567")
            code_command = auth_input_command("lrtgbc_" + "d" * 32, "code")
            with mock.patch(
                "lead_radar_bridge.runtime.envelope_decrypt_context",
                return_value="12345",
            ):
                await runtime.handle_command(code_command)
            self.assertEqual(mailbox.submitted[-1]["result_code"], "connected")
            self.assertNotIn("pending_phone", state["telegram"])
            self.assertNotIn("pending_phone_code_hash", state["telegram"])
            ledger.close()

    async def test_phone_provider_uncertainty_finishes_command_instead_of_spinning(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            runtime, ledger, mailbox, telegram, _state = self.make_runtime(
                folder, phone_connect_command(),
            )
            await runtime.handle_command(mailbox.command)
            phone_command = auth_input_command("lrtgbc_" + "c" * 32, "phone")
            mailbox.command = phone_command
            telegram.phone_error = TimeoutError("fixture provider timeout")
            with mock.patch(
                "lead_radar_bridge.runtime.envelope_decrypt_context",
                return_value="+998901234567",
            ):
                await runtime.run_once()
            self.assertEqual(mailbox.submitted[-1], {
                "schema": "gptbot.lead-radar.telegram-bridge.v1",
                "command_id": phone_command.id,
                "sequence": 1,
                "status": "ambiguous",
                "result_code": "telegram_timeout",
                "result": {},
            })
            ledger.close()

    async def test_disconnect_retries_more_than_32_times_without_consuming_sequence(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            runtime, ledger, mailbox, telegram, state = self.make_runtime(folder, disconnect_command())
            state["telegram"].update({
                "auth_id": AUTH_ID,
                "account_ref": ACCOUNT_REF,
                "custody": "finalized",
                "expires_at": int(time.time()) + 600,
            })
            ledger.put_auth_custody(
                auth_id=AUTH_ID,
                command_id="lrtgbc_" + "f" * 32,
                account_ref=ACCOUNT_REF,
                state="finalized",
                expires_at=int(time.time()) + 600,
            )
            telegram.logout_failures = 35
            for _ in range(35):
                await runtime.handle_command(mailbox.command)
            self.assertEqual({body["sequence"] for body in mailbox.submitted}, {1})
            await runtime.handle_command(mailbox.command)
            self.assertEqual(mailbox.submitted[-1]["status"], "succeeded")
            self.assertEqual(mailbox.submitted[-1]["sequence"], 2)
            self.assertEqual(telegram.logout_calls, 36)
            ledger.close()

    async def test_stale_expired_custody_never_logs_out_newer_session(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            runtime, ledger, _mailbox, telegram, state = self.make_runtime(folder, connect_command())
            ledger.put_auth_custody(
                auth_id=AUTH_ID,
                command_id=COMMAND_ID,
                account_ref=ACCOUNT_REF,
                state="provisional",
                expires_at=int(time.time()) - 1,
            )
            state["telegram"].update({
                "auth_id": "auth_newer_123456",
                "account_ref": "lracct_" + "z" * 43,
                "custody": "finalized",
            })
            await runtime.cleanup_expired_provisional()
            self.assertEqual(telegram.logout_calls, 0)
            self.assertEqual(ledger.auth_custody(AUTH_ID)["state"], "provisional")
            ledger.close()

    async def test_media_validation_failure_closes_exact_effect_without_provider_retry(self) -> None:
        command = send_media_command()
        with tempfile.TemporaryDirectory() as folder:
            runtime, ledger, mailbox, telegram, _state = self.make_runtime(folder, command)
            ledger.put_auth_custody(
                auth_id=AUTH_ID,
                command_id="lrtgbc_" + "f" * 32,
                account_ref=ACCOUNT_REF,
                state="finalized",
                expires_at=int(time.time()) + 600,
            )
            mailbox.download_error = ProtocolError("fixture_media_digest_invalid")

            await runtime.run_once()

            self.assertEqual(telegram.photo_calls, 0)
            self.assertEqual(mailbox.download_calls, 1)
            self.assertIsNone(ledger.pending_result(COMMAND_ID))
            self.assertEqual(mailbox.submitted[-1], {
                "schema": "gptbot.lead-radar.telegram-bridge.v1",
                "command_id": COMMAND_ID,
                "sequence": 1,
                "status": "failed",
                "result_code": "local_validation_failed",
                "result": {
                    "effect_id": "effect_fixture_123456",
                    "retryable": False,
                },
            })
            replay = ledger.reserve_send(
                "effect_fixture_123456",
                payload_digest(command.payload),
            )
            self.assertEqual(replay.kind, "replay")
            self.assertEqual(replay.result["kind"], "failed")

            await runtime.run_once()
            self.assertEqual(mailbox.download_calls, 1)
            self.assertEqual(telegram.photo_calls, 0)
            self.assertEqual(mailbox.submitted[-1], mailbox.submitted[-2])
            ledger.close()

    async def test_pre_reservation_send_failure_is_accepted_ambiguous_no_repeat_shape(self) -> None:
        command = send_text_command()
        with tempfile.TemporaryDirectory() as folder:
            runtime, ledger, mailbox, telegram, _state = self.make_runtime(folder, command)

            # No finalized custody exists, so the command fails before the
            # local effect reservation and before any Telegram provider call.
            await runtime.run_once()

            self.assertEqual(telegram.text_calls, 0)
            self.assertIsNone(ledger.pending_result(COMMAND_ID))
            self.assertEqual(mailbox.submitted[-1], {
                "schema": "gptbot.lead-radar.telegram-bridge.v1",
                "command_id": COMMAND_ID,
                "sequence": 1,
                "status": "ambiguous",
                "result_code": "provider_outcome_unknown",
                "result": {"effect_id": "effect_fixture_123456"},
            })

            await runtime.run_once()
            self.assertEqual(telegram.text_calls, 0)
            self.assertEqual(mailbox.submitted[-1], mailbox.submitted[-2])
            ledger.close()

    async def test_media_download_rejection_uses_gateway_accepted_invalid_shape(self) -> None:
        command = validate_media_command()
        with tempfile.TemporaryDirectory() as folder:
            runtime, ledger, mailbox, telegram, _state = self.make_runtime(folder, command)
            mailbox.download_error = ProtocolError("fixture_media_download_rejected")

            await runtime.run_once()

            self.assertEqual(mailbox.download_calls, 1)
            self.assertEqual(telegram.photo_calls, 0)
            self.assertIsNone(ledger.pending_result(COMMAND_ID))
            self.assertEqual(mailbox.submitted[-1], {
                "schema": "gptbot.lead-radar.telegram-bridge.v1",
                "command_id": COMMAND_ID,
                "sequence": 1,
                "status": "failed",
                "result_code": "media_invalid",
                "result": {},
            })

            await runtime.run_once()
            self.assertEqual(mailbox.download_calls, 1)
            self.assertEqual(mailbox.submitted[-1], mailbox.submitted[-2])
            ledger.close()


if __name__ == "__main__":
    unittest.main()
