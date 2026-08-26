from __future__ import annotations

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
