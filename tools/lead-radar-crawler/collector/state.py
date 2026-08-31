"""Small durable local store: absolute origin deadlines and immutable receipts."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any


class StateStore:
    def __init__(self, path: str | Path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, timeout=5)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS cooldowns (
                origin TEXT PRIMARY KEY, deadline REAL NOT NULL, reason TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS outbox (
                receipt_id TEXT PRIMARY KEY, digest TEXT NOT NULL, payload TEXT NOT NULL,
                created_at REAL NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at REAL NOT NULL DEFAULT 0,
                last_error TEXT
            );
            CREATE TABLE IF NOT EXISTS robots (
                origin TEXT PRIMARY KEY, body TEXT NOT NULL, expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS process_lease (
                slot INTEGER PRIMARY KEY CHECK(slot=1), owner TEXT NOT NULL, expires_at REAL NOT NULL
            );
        """)
        self.db.commit()

    def close(self) -> None:
        self.db.close()

    def postpone(self, origin: str, deadline: float, reason: str) -> float:
        """A shorter later response must never shorten an existing cooldown."""
        with self.db:
            self.db.execute("""
                INSERT INTO cooldowns(origin, deadline, reason) VALUES (?, ?, ?)
                ON CONFLICT(origin) DO UPDATE SET
                    deadline=MAX(deadline, excluded.deadline),
                    reason=CASE WHEN excluded.deadline > deadline
                        THEN excluded.reason ELSE reason END
            """, (origin, deadline, reason))
        return self.deadline(origin)

    def deadline(self, origin: str) -> float:
        row = self.db.execute("SELECT deadline FROM cooldowns WHERE origin=?", (origin,)).fetchone()
        return float(row[0]) if row else 0.0

    def cooldown(self, origin: str) -> tuple[float, str]:
        row = self.db.execute("SELECT deadline,reason FROM cooldowns WHERE origin=?", (origin,)).fetchone()
        return (float(row[0]), str(row[1])) if row else (0.0, "")

    def save_robots(self, origin: str, body: str, expires_at: float) -> None:
        with self.db:
            self.db.execute("INSERT INTO robots(origin,body,expires_at) VALUES(?,?,?) "
                            "ON CONFLICT(origin) DO UPDATE SET body=excluded.body,expires_at=excluded.expires_at",
                            (origin, body, expires_at))

    def robots(self, origin: str, now: float) -> str | None:
        row = self.db.execute("SELECT body FROM robots WHERE origin=? AND expires_at>?", (origin, now)).fetchone()
        return row[0] if row else None

    def enqueue(self, receipt_id: str, payload: dict[str, Any], now: float | None = None) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        digest = hashlib.sha256(encoded.encode()).hexdigest()
        with self.db:
            row = self.db.execute("SELECT digest FROM outbox WHERE receipt_id=?", (receipt_id,)).fetchone()
            if row:
                if row[0] != digest:
                    raise ValueError("receipt_payload_conflict")
                return
            self.db.execute("INSERT INTO outbox(receipt_id,digest,payload,created_at) VALUES(?,?,?,?)",
                            (receipt_id, digest, encoded, time.time() if now is None else now))

    def pending(self, now: float | None = None, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.db.execute("""
            SELECT receipt_id,payload,attempts FROM outbox
            WHERE state='pending' AND next_attempt_at<=? ORDER BY created_at LIMIT ?
        """, (time.time() if now is None else now, min(max(limit, 1), 100))).fetchall()
        return [{"receipt_id": r["receipt_id"], "payload": json.loads(r["payload"]),
                 "attempts": r["attempts"]} for r in rows]

    def has_pending(self) -> bool:
        return self.db.execute("SELECT 1 FROM outbox WHERE state='pending' LIMIT 1").fetchone() is not None

    def receipt_state(self, receipt_id: str) -> str | None:
        row = self.db.execute("SELECT state FROM outbox WHERE receipt_id=?", (receipt_id,)).fetchone()
        return row[0] if row else None

    def acquire_run(self, now: float, ttl: float = 600) -> str | None:
        owner = str(uuid.uuid4())
        with self.db:
            changed = self.db.execute("""
                INSERT INTO process_lease(slot,owner,expires_at) VALUES(1,?,?)
                ON CONFLICT(slot) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
                WHERE expires_at<=?
            """, (owner, now + ttl, now)).rowcount
        return owner if changed == 1 else None

    def release_run(self, owner: str) -> None:
        with self.db:
            self.db.execute("DELETE FROM process_lease WHERE slot=1 AND owner=?", (owner,))

    def acknowledge(self, receipt_id: str) -> None:
        with self.db:
            self.db.execute("UPDATE outbox SET state='acknowledged',payload='{}',last_error=NULL WHERE receipt_id=?",
                            (receipt_id,))

    def retry(self, receipt_id: str, next_attempt_at: float, reason: str) -> None:
        with self.db:
            self.db.execute("""UPDATE outbox SET attempts=attempts+1,next_attempt_at=?,last_error=?
                            WHERE receipt_id=? AND state='pending'""",
                            (next_attempt_at, reason[:120], receipt_id))

    def reject(self, receipt_id: str, reason: str) -> None:
        with self.db:
            self.db.execute("UPDATE outbox SET state='rejected',payload='{}',last_error=? WHERE receipt_id=?",
                            (reason[:120], receipt_id))

    def maintenance(self, now: float) -> dict[str, int]:
        """Seven-day unresolved retention; never reinterpret expiry as acceptance.

        Stable receipt digests remain as tombstones. Expired source metadata is
        pruned only when its existing absolute deadline has actually passed.
        """
        with self.db:
            expired = self.db.execute("""
                UPDATE outbox SET state='rejected',payload='{}',last_error='pending_retention_expired'
                WHERE state='pending' AND created_at<=?
            """, (now - 7 * 86400,)).rowcount
            robots = self.db.execute("DELETE FROM robots WHERE expires_at<=?", (now,)).rowcount
            cooldowns = self.db.execute("DELETE FROM cooldowns WHERE deadline<=?", (now,)).rowcount
        return {"expired_pending": expired, "expired_robots": robots, "expired_cooldowns": cooldowns}
