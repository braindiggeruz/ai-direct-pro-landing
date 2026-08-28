from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from telethon.tl.types import User  # noqa: E402

from lead_radar_bridge.telegram_adapter import (  # noqa: E402
    TelethonAccount,
    classify_provider_exception,
    masked_account_label,
)


class Message:
    id = 42


class FakeClient:
    def __init__(self, entity: object) -> None:
        self.entity = entity
        self.lookups: list[str] = []
        self.text_calls: list[tuple[object, str, dict[str, object]]] = []
        self.photo_calls: list[tuple[object, str, dict[str, object]]] = []
        self.code_requests: list[tuple[str, bool]] = []
        self.sign_in_calls: list[dict[str, str]] = []
        self.authorized = False
        self.require_password = False

    def is_connected(self) -> bool:
        return True

    async def get_entity(self, value: str) -> object:
        self.lookups.append(value)
        return self.entity

    async def send_message(self, entity: object, text: str, **kwargs: object) -> Message:
        self.text_calls.append((entity, text, kwargs))
        return Message()

    async def send_file(self, entity: object, path: str, **kwargs: object) -> Message:
        self.photo_calls.append((entity, path, kwargs))
        return Message()

    async def send_code_request(self, phone: str, *, force_sms: bool = False):
        self.code_requests.append((phone, force_sms))
        return type("SentCode", (), {"phone_code_hash": "hash-12345678"})()

    async def sign_in(self, **kwargs: str) -> None:
        self.sign_in_calls.append(kwargs)
        if self.require_password:
            raise type("SessionPasswordNeededError", (Exception,), {})()
        self.authorized = True

    async def is_user_authorized(self) -> bool:
        return self.authorized


def account(client: FakeClient, folder: Path) -> TelethonAccount:
    result = TelethonAccount(
        api_id=123456,
        api_hash="a" * 32,
        session="",
        device_id="lrtgbd_" + "a" * 32,
        secure_temp=folder,
        client_factory=lambda *_args: client,
    )
    result.client = client
    return result


class TelegramAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_contact_lookup_uses_resolve_not_import_or_send(self) -> None:
        from telethon.tl import functions, types
        class Resolver(FakeClient):
            calls: list[object] = []
            async def __call__(self, request):
                self.calls.append(request)
                return type("Resolved", (), {"peer": types.PeerUser(123), "users": [self.entity]})()
        with tempfile.TemporaryDirectory() as folder:
            client = Resolver(User(id=123, username="clinic_uz"))
            bridge = account(client, Path(folder))
            result = await bridge.resolve_public_contact("phone", "+998901234567")
            self.assertEqual(result["status"], "resolved")
            self.assertIsInstance(client.calls[-1], functions.contacts.ResolvePhoneRequest)
            self.assertEqual(client.text_calls, [])
            self.assertEqual(client.photo_calls, [])
            client.entity = User(id=123, bot=True, username="clinic_bot")
            self.assertEqual((await bridge.resolve_public_contact("username", "clinic_bot"))["status"], "unsupported")
            client.entity = User(id=123)
            self.assertEqual((await bridge.resolve_public_contact("phone", "+998901234567"))["reason"], "peer_access_unavailable")
            self.assertNotIn("+998901234567", str(result))

    async def test_phone_peer_without_username_is_local_durable_and_identity_checked(self) -> None:
        from telethon.tl import types
        class Resolver(FakeClient):
            async def __call__(self, _request):
                return type("Resolved", (), {"peer": types.PeerUser(123), "users": [self.entity]})()
        with tempfile.TemporaryDirectory() as folder:
            client = Resolver(User(id=123, access_hash=-456, username=None))
            bridge = account(client, Path(folder))
            result = await bridge.resolve_public_contact("phone", "+998901234567")
            self.assertEqual(result["status"], "resolved")
            self.assertIsNone(result["username"])
            ref = result["peerRef"]
            self.assertRegex(ref, r"^lrpeer:[a-f0-9]{32}$")
            self.assertNotIn("access_hash", str(result))
            self.assertNotIn("user_id", str(result))
            self.assertEqual(client.text_calls, [])
            restarted = account(client, Path(folder))
            restarted.restore_peer_bindings(bridge.peer_bindings)
            self.assertEqual((await restarted.send_text(ref, "fixture only")).kind, "sent")
            self.assertIsInstance(client.lookups[-1], types.InputPeerUser)
            self.assertEqual(client.lookups[-1].user_id, 123)
            self.assertEqual(client.lookups[-1].access_hash, -456)
            client.entity = User(id=124, access_hash=-456)
            self.assertNotEqual((await restarted.send_text(ref, "wrong peer")).kind, "sent")
            client.entity = User(id=123, bot=True, access_hash=-456)
            self.assertNotEqual((await restarted.send_text(ref, "bot")).kind, "sent")
            restarted.restore_peer_bindings({ref: {"user_id": 123, "access_hash": -456, "expires_at": 1}})
            self.assertNotEqual((await restarted.send_text(ref, "expired")).kind, "sent")
            self.assertEqual(len(client.text_calls), 1)

    async def test_auth_rpc_deadlines_do_not_claim_a_code_or_retry(self) -> None:
        async def stalled(*_args, **_kwargs):
            await asyncio.Event().wait()

        with tempfile.TemporaryDirectory() as folder:
            client = FakeClient(User(id=123, username="clinic_uz"))
            bridge = account(client, Path(folder))
            bridge.request_timeout = 0.01
            client.send_code_request = mock.AsyncMock(side_effect=stalled)
            with self.assertRaises(TimeoutError):
                await bridge.submit_phone("+998901234567")
            self.assertIsNone(bridge.pending_phone_code_hash)
            self.assertEqual(client.send_code_request.await_count, 1)
            client.sign_in = mock.AsyncMock(side_effect=stalled)
            with self.assertRaises(TimeoutError):
                await bridge.submit_code("12345", phone="+998901234567", phone_code_hash="hash-12345678")
            with self.assertRaises(TimeoutError):
                await bridge.submit_password("fixture-password")
            self.assertEqual(client.sign_in.await_count, 2)

    async def test_probe_timeout_is_not_misreported_as_revocation_or_restriction(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            client = FakeClient(User(id=123, username="clinic_uz"))
            bridge = account(client, Path(folder))
            client.is_user_authorized = mock.AsyncMock(side_effect=TimeoutError())
            with self.assertRaises(TimeoutError):
                await bridge.probe()

    async def test_send_deadline_is_ambiguous_and_never_retries(self) -> None:
        async def stalled(*_args, **_kwargs):
            await asyncio.Event().wait()

        with tempfile.TemporaryDirectory() as folder:
            client = FakeClient(User(id=123, username="clinic_uz"))
            bridge = account(client, Path(folder))
            bridge.request_timeout = 0.01
            client.send_message = mock.AsyncMock(side_effect=stalled)
            outcome = await bridge.send_text("clinic_uz", "fixture canary")
            self.assertEqual(outcome.kind, "ambiguous")
            self.assertEqual(client.send_message.await_count, 1)

    async def test_phone_code_login_uses_exact_telethon_challenge(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            client = FakeClient(User(id=123, username="clinic_uz"))
            bridge = account(client, Path(folder))
            await bridge.begin_phone("auth_fixture_123456")
            phone_hash = await bridge.submit_phone("+998901234567")
            state = await bridge.submit_code(
                "12345", phone="+998901234567", phone_code_hash=phone_hash,
            )
        self.assertEqual(client.code_requests, [("+998901234567", False)])
        self.assertEqual(client.sign_in_calls, [{
            "phone": "+998901234567", "code": "12345", "phone_code_hash": "hash-12345678",
        }])
        self.assertEqual(state, "connected")

    async def test_phone_code_login_surfaces_telegram_two_factor_step(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            client = FakeClient(User(id=123, username="clinic_uz"))
            client.require_password = True
            bridge = account(client, Path(folder))
            state = await bridge.submit_code(
                "12345", phone="+998901234567", phone_code_hash="hash-12345678",
            )
        self.assertEqual(state, "awaiting_password")

    async def test_exact_plain_text_and_paid_features_remain_disabled(self) -> None:
        user = User(id=123, username="Clinic_Uz", first_name="Clinic")
        with tempfile.TemporaryDirectory() as folder:
            client = FakeClient(user)
            bridge = account(client, Path(folder))
            text = "  Салом, Ўзбекистон 👩‍💻 e\u0301\n\t*literal* <b>literal</b>  "
            outcome = await bridge.send_text("clinic_uz", text)
        self.assertEqual(outcome.kind, "sent")
        self.assertEqual(client.lookups, ["@clinic_uz"])
        self.assertEqual(client.text_calls[0][1], text)
        self.assertEqual(client.text_calls[0][2], {
            "parse_mode": None,
            "formatting_entities": [],
            "link_preview": False,
        })
        self.assertNotIn("allow_paid_floodskip", client.text_calls[0][2])
        self.assertNotIn("allow_paid_stars", client.text_calls[0][2])

    async def test_caption_is_exact_and_photo_never_falls_back_to_document(self) -> None:
        user = User(id=123, username="clinic_uz", first_name="Clinic")

        @contextmanager
        def photo_file(_value: bytes, folder: Path):
            yield folder / "sanitized.jpg"

        with tempfile.TemporaryDirectory() as folder:
            client = FakeClient(user)
            bridge = account(client, Path(folder))
            caption = "Макет для {company_name}\nСалом 👋"
            with mock.patch(
                "lead_radar_bridge.telegram_adapter.sanitize_static_image",
                return_value=b"jpeg",
            ), mock.patch(
                "lead_radar_bridge.telegram_adapter.private_photo_file",
                side_effect=photo_file,
            ):
                outcome = await bridge.send_photo("clinic_uz", caption, b"source")
        self.assertEqual(outcome.kind, "sent")
        self.assertEqual(client.photo_calls[0][2], {
            "caption": caption,
            "parse_mode": None,
            "formatting_entities": [],
            "force_document": False,
        })

    async def test_only_exact_live_regular_username_is_eligible(self) -> None:
        fixtures = [
            (User(id=1, username="other_name"), "clinic_uz"),
            (User(id=2, username="clinic_uz", bot=True), "clinic_uz"),
            (object(), "clinic_uz"),
            (User(id=3, username="12345"), "12345"),
        ]
        with tempfile.TemporaryDirectory() as folder:
            for entity, endpoint in fixtures:
                client = FakeClient(entity)
                outcome = await account(client, Path(folder)).send_text(endpoint, "Hello")
                # Numeric-looking values are still forced through explicit @
                # username resolution; they can never be interpreted as ids.
                self.assertEqual(client.lookups, [f"@{endpoint}"])
                if isinstance(entity, User) and not entity.bot and entity.username == endpoint:
                    self.assertEqual(outcome.kind, "sent")
                else:
                    self.assertEqual(outcome.kind, "failed")
                    self.assertEqual(client.text_calls, [])

    def test_labels_are_distinguishable_without_full_identifiers(self) -> None:
        short = masked_account_label(User(id=1, username="abcde"))
        long = masked_account_label(User(id=2, username="different_user"))
        phone = masked_account_label(User(id=3, phone="998901234567"))
        self.assertNotEqual(short, long)
        self.assertEqual(short, "@a•••e")
        self.assertEqual(long, "@di•••••er")
        self.assertEqual(phone, "Telegram ••••4567")
        self.assertNotIn("abcde", short)
        self.assertNotIn("different_user", long)
        self.assertNotIn("998901234567", phone)

    def test_unknown_provider_exception_is_ambiguous(self) -> None:
        self.assertEqual(classify_provider_exception(TimeoutError()).kind, "ambiguous")
        self.assertEqual(classify_provider_exception(ConnectionError()).kind, "ambiguous")


if __name__ == "__main__":
    unittest.main()
