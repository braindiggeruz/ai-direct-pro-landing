import io
import json
import shutil
import sqlite3
import sys
import tarfile
import tempfile
import threading
import time
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import qrcode  # noqa: F401
except ModuleNotFoundError:
    qrcode_stub = types.ModuleType("qrcode")
    qrcode_stub.make = lambda _value: None
    sys.modules["qrcode"] = qrcode_stub

import server
from server import EFFECT_RETENTION_SECONDS, EffectLedger, Runtime, response


DIGEST = "a" * 64


class EffectLedgerRetentionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="lead-radar-ledger-test-"))
        self.path = self.root / "gateway-effects.sqlite3"
        self.ledger = EffectLedger(self.path)

    def tearDown(self) -> None:
        self.ledger.close()
        shutil.rmtree(self.root, ignore_errors=True)

    def _finish(self, operation_id: str, status: str = "sent") -> None:
        self.assertEqual(self.ledger.reserve(operation_id, DIGEST), ("reserved", None))
        result = (
            response("sent", provider_message_id="fixture-message")
            if status == "sent"
            else response(status, code="provider_rejected")
        )
        self.ledger.finish(operation_id, DIGEST, result)

    def _age(self, operation_id: str, seconds: int) -> None:
        assert self.ledger._connection is not None
        self.ledger._connection.execute(
            "UPDATE effects SET created_at=?, updated_at=? WHERE operation_id=?",
            (seconds, seconds, operation_id),
        )
        self.ledger._connection.commit()

    def _rows(self) -> list[tuple[str, str]]:
        assert self.ledger._connection is not None
        return self.ledger._connection.execute(
            "SELECT operation_id,status FROM effects ORDER BY operation_id"
        ).fetchall()

    def test_reserve_prunes_only_expired_terminal_and_preserves_replay(self) -> None:
        now = int(time.time())
        self._finish("operation_old_terminal", "sent")
        self._age("operation_old_terminal", now - EFFECT_RETENTION_SECONDS - 1)
        self._finish("operation_fresh_terminal", "ambiguous")
        self.assertEqual(self.ledger.reserve("operation_old_inflight", DIGEST), ("reserved", None))
        self._age("operation_old_inflight", now - EFFECT_RETENTION_SECONDS * 4)

        self.assertEqual(self.ledger.reserve("operation_prune_trigger", DIGEST), ("reserved", None))
        self.assertEqual(self._rows(), [
            ("operation_fresh_terminal", "ambiguous"),
            ("operation_old_inflight", "in_flight"),
            ("operation_prune_trigger", "in_flight"),
        ])
        replay = self.ledger.reserve("operation_fresh_terminal", DIGEST)
        self.assertEqual(replay[0], "replay")
        self.assertEqual((replay[1] or {}).get("status"), "ambiguous")

    def test_snapshot_prunes_compacts_and_archives_no_wal(self) -> None:
        now = int(time.time())
        assert self.ledger._connection is not None
        old_response = json.dumps(response("sent", provider_message_id="x" * 256))
        self.ledger._connection.executemany(
            "INSERT INTO effects(operation_id,payload_digest,status,response_json,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            [
                (
                    f"operation_old_{index:05d}",
                    DIGEST,
                    "sent",
                    old_response,
                    now - EFFECT_RETENTION_SECONDS - 60,
                    now - EFFECT_RETENTION_SECONDS - 60,
                )
                for index in range(2_000)
            ],
        )
        self.ledger._connection.commit()
        self._finish("operation_recent_replay", "sent")
        self.assertEqual(self.ledger.reserve("operation_active_inflight", DIGEST), ("reserved", None))
        self.ledger._connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        size_before = self.path.stat().st_size

        original = (server.DATA_DIR, server.DB_DIR, server.FILES_DIR, server.LEDGER_PATH)
        server.DATA_DIR = self.root
        server.DB_DIR = self.root / "db"
        server.FILES_DIR = self.root / "files"
        server.LEDGER_PATH = self.path
        runtime = object.__new__(Runtime)
        runtime.lock = threading.RLock()
        runtime.client = None
        runtime.boot_id = "fixture-ledger-boot"
        runtime.ledger = self.ledger
        try:
            archive_bytes = runtime.export_session()
        finally:
            server.DATA_DIR, server.DB_DIR, server.FILES_DIR, server.LEDGER_PATH = original

        # export_session reopens the same ledger after producing the archive.
        rows = self._rows()
        self.assertEqual(rows, [
            ("operation_active_inflight", "in_flight"),
            ("operation_recent_replay", "sent"),
        ])
        self.assertLess(self.path.stat().st_size, size_before)
        self.assertLess(len(archive_bytes), 256_000)
        with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
            names = archive.getnames()
            self.assertIn("gateway-effects.sqlite3", names)
            self.assertFalse(any(name.endswith(("-wal", "-shm")) for name in names))
            ledger_member = archive.extractfile("gateway-effects.sqlite3")
            self.assertIsNotNone(ledger_member)
            archived_path = self.root / "archived-effects.sqlite3"
            archived_path.write_bytes(ledger_member.read())
        with sqlite3.connect(archived_path) as archived:
            self.assertEqual(
                archived.execute(
                    "SELECT operation_id,status FROM effects ORDER BY operation_id"
                ).fetchall(),
                rows,
            )


if __name__ == "__main__":
    unittest.main()
