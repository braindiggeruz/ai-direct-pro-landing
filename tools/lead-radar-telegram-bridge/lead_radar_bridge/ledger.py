from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .protocol import ProtocolError, canonical_json


LEDGER_SCHEMA_VERSION = 2


class LedgerConflict(RuntimeError):
    pass


@dataclass(frozen=True)
class EffectDecision:
    kind: str
    result: dict[str, Any] | None = None


def payload_digest(value: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


class BridgeLedger:
    """Crash-safe local command/effect ledger.

    Send effects are intentionally append-only. There is no retention or
    delete API for ``send_effects``: a terminal provider outcome is a permanent
    no-repeat barrier on this Windows account.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=FULL")
        self._db.execute("PRAGMA foreign_keys=ON")
        self._db.execute("PRAGMA busy_timeout=5000")
        self._migrate()

    def _migrate(self) -> None:
        with self._lock, self._db:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS bridge_meta (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS command_results (
                  command_id TEXT NOT NULL,
                  sequence INTEGER NOT NULL CHECK(sequence BETWEEN 1 AND 32),
                  body_digest TEXT NOT NULL CHECK(length(body_digest) = 64),
                  body_json TEXT NOT NULL,
                  terminal INTEGER NOT NULL CHECK(terminal IN (0,1)),
                  acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN (0,1)),
                  created_at INTEGER NOT NULL,
                  PRIMARY KEY(command_id, sequence)
                ) WITHOUT ROWID;
                CREATE TABLE IF NOT EXISTS send_effects (
                  effect_id TEXT PRIMARY KEY,
                  payload_digest TEXT NOT NULL CHECK(length(payload_digest) = 64),
                  status TEXT NOT NULL CHECK(status IN ('in_flight','sent','failed','ambiguous')),
                  result_json TEXT,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS auth_custody (
                  auth_id TEXT PRIMARY KEY,
                  command_id TEXT NOT NULL,
                  account_ref TEXT,
                  state TEXT NOT NULL CHECK(state IN ('provisional','finalizing','finalized','revoking','revoked')),
                  expires_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL
                );
                """
            )
            row = self._db.execute(
                "SELECT value FROM bridge_meta WHERE key='schema_version'"
            ).fetchone()
            columns = {
                str(column["name"])
                for column in self._db.execute("PRAGMA table_info(command_results)").fetchall()
            }
            if "acknowledged" not in columns:
                self._db.execute(
                    "ALTER TABLE command_results ADD COLUMN acknowledged INTEGER NOT NULL DEFAULT 0 "
                    "CHECK(acknowledged IN (0,1))"
                )
            if row is None:
                self._db.execute(
                    "INSERT INTO bridge_meta(key,value) VALUES('schema_version',?)",
                    (str(LEDGER_SCHEMA_VERSION),),
                )
            elif row["value"] == "1":
                self._db.execute(
                    "UPDATE bridge_meta SET value=? WHERE key='schema_version'",
                    (str(LEDGER_SCHEMA_VERSION),),
                )
            elif row["value"] != str(LEDGER_SCHEMA_VERSION):
                raise LedgerConflict("ledger_schema_unsupported")

    def close(self) -> None:
        with self._lock:
            self._db.close()

    def recover_inflight_sends(self, now: int | None = None) -> int:
        timestamp = int(time.time()) if now is None else now
        with self._lock, self._db:
            cursor = self._db.execute(
                """UPDATE send_effects
                   SET status='ambiguous', result_json=?, updated_at=?
                   WHERE status='in_flight'""",
                ('{"kind":"ambiguous"}', timestamp),
            )
            return cursor.rowcount

    def reserve_send(self, effect_id: str, digest: str, now: int | None = None) -> EffectDecision:
        if len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
            raise ProtocolError("payload_digest_invalid")
        timestamp = int(time.time()) if now is None else now
        with self._lock, self._db:
            row = self._db.execute(
                "SELECT payload_digest,status,result_json FROM send_effects WHERE effect_id=?",
                (effect_id,),
            ).fetchone()
            if row is not None:
                if row["payload_digest"] != digest:
                    raise LedgerConflict("effect_payload_conflict")
                if row["status"] == "in_flight":
                    # The caller cannot distinguish whether a previous process
                    # crossed Telegram's provider boundary. Never retry it.
                    self._db.execute(
                        "UPDATE send_effects SET status='ambiguous',result_json=?,updated_at=? WHERE effect_id=?",
                        ('{"kind":"ambiguous"}', timestamp, effect_id),
                    )
                    return EffectDecision("replay", {"kind": "ambiguous"})
                result = json.loads(row["result_json"]) if row["result_json"] else {"kind": row["status"]}
                return EffectDecision("replay", result)
            self._db.execute(
                "INSERT INTO send_effects(effect_id,payload_digest,status,result_json,created_at,updated_at) "
                "VALUES(?,?,'in_flight',NULL,?,?)",
                (effect_id, digest, timestamp, timestamp),
            )
            return EffectDecision("reserved")

    def finish_send(
        self,
        effect_id: str,
        digest: str,
        status: str,
        result: dict[str, Any],
        now: int | None = None,
    ) -> None:
        if status not in {"sent", "failed", "ambiguous"}:
            raise ProtocolError("effect_status_invalid")
        body = canonical_json(result).decode("utf-8")
        timestamp = int(time.time()) if now is None else now
        with self._lock, self._db:
            row = self._db.execute(
                "SELECT payload_digest,status FROM send_effects WHERE effect_id=?", (effect_id,)
            ).fetchone()
            if row is None or row["payload_digest"] != digest or row["status"] != "in_flight":
                raise LedgerConflict("effect_finish_conflict")
            self._db.execute(
                "UPDATE send_effects SET status=?,result_json=?,updated_at=? WHERE effect_id=?",
                (status, body, timestamp, effect_id),
            )

    def store_result(self, body: dict[str, Any], *, terminal: bool, now: int | None = None) -> bool:
        command_id = body.get("command_id")
        sequence = body.get("sequence")
        if not isinstance(command_id, str) or not isinstance(sequence, int):
            raise ProtocolError("command_result_invalid")
        encoded = canonical_json(body)
        digest = hashlib.sha256(encoded).hexdigest()
        timestamp = int(time.time()) if now is None else now
        with self._lock, self._db:
            existing = self._db.execute(
                "SELECT body_digest FROM command_results WHERE command_id=? AND sequence=?",
                (command_id, sequence),
            ).fetchone()
            if existing is not None:
                if existing["body_digest"] != digest:
                    raise LedgerConflict("result_sequence_conflict")
                return False
            previous = self._db.execute(
                "SELECT COALESCE(MAX(sequence),0) AS last_sequence, MAX(terminal) AS terminal "
                "FROM command_results WHERE command_id=?",
                (command_id,),
            ).fetchone()
            if previous["terminal"] == 1 or sequence != int(previous["last_sequence"]) + 1:
                raise LedgerConflict("result_sequence_conflict")
            self._db.execute(
                "INSERT INTO command_results(command_id,sequence,body_digest,body_json,terminal,acknowledged,created_at) "
                "VALUES(?,?,?,?,?,0,?)",
                (command_id, sequence, digest, encoded.decode("utf-8"), int(terminal), timestamp),
            )
            return True

    def acknowledge_result(self, body: dict[str, Any]) -> None:
        command_id = body.get("command_id")
        sequence = body.get("sequence")
        if not isinstance(command_id, str) or not isinstance(sequence, int):
            raise ProtocolError("command_result_invalid")
        digest = hashlib.sha256(canonical_json(body)).hexdigest()
        with self._lock, self._db:
            row = self._db.execute(
                "SELECT body_digest FROM command_results WHERE command_id=? AND sequence=?",
                (command_id, sequence),
            ).fetchone()
            if row is None or row["body_digest"] != digest:
                raise LedgerConflict("result_ack_conflict")
            self._db.execute(
                "UPDATE command_results SET acknowledged=1 WHERE command_id=? AND sequence=?",
                (command_id, sequence),
            )

    def pending_result(self, command_id: str) -> dict[str, Any] | None:
        """Return the first exact result body whose HTTP acknowledgement is unknown.

        The serialized body is the durable outbox. A transport failure before or
        after the server commits is retried byte-for-byte and can never advance
        the command sequence until the signed acknowledgement is observed.
        """
        with self._lock:
            row = self._db.execute(
                "SELECT body_json FROM command_results "
                "WHERE command_id=? AND acknowledged=0 ORDER BY sequence LIMIT 1",
                (command_id,),
            ).fetchone()
        return json.loads(row["body_json"]) if row else None

    def result_acknowledged(self, command_id: str, sequence: int) -> bool:
        with self._lock:
            row = self._db.execute(
                "SELECT acknowledged FROM command_results WHERE command_id=? AND sequence=?",
                (command_id, sequence),
            ).fetchone()
        return bool(row and row["acknowledged"] == 1)

    def result(self, command_id: str, sequence: int) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute(
                "SELECT body_json FROM command_results WHERE command_id=? AND sequence=?",
                (command_id, sequence),
            ).fetchone()
        return json.loads(row["body_json"]) if row else None

    def last_result(self, command_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute(
                "SELECT body_json FROM command_results WHERE command_id=? ORDER BY sequence DESC LIMIT 1",
                (command_id,),
            ).fetchone()
        return json.loads(row["body_json"]) if row else None

    def put_auth_custody(
        self,
        *,
        auth_id: str,
        command_id: str,
        account_ref: str | None,
        state: str,
        expires_at: int,
        now: int | None = None,
    ) -> None:
        if state not in {"provisional", "finalizing", "finalized", "revoking", "revoked"}:
            raise ProtocolError("auth_custody_state_invalid")
        timestamp = int(time.time()) if now is None else now
        with self._lock, self._db:
            self._db.execute(
                """INSERT INTO auth_custody(auth_id,command_id,account_ref,state,expires_at,updated_at)
                   VALUES(?,?,?,?,?,?)
                   ON CONFLICT(auth_id) DO UPDATE SET
                     account_ref=excluded.account_ref,state=excluded.state,
                     expires_at=excluded.expires_at,updated_at=excluded.updated_at""",
                (auth_id, command_id, account_ref, state, expires_at, timestamp),
            )

    def expired_provisional_auth(self, now: int | None = None) -> list[dict[str, Any]]:
        timestamp = int(time.time()) if now is None else now
        with self._lock:
            rows = self._db.execute(
                "SELECT auth_id,command_id,account_ref,expires_at FROM auth_custody "
                "WHERE state IN ('provisional','finalizing') AND expires_at<=? ORDER BY expires_at",
                (timestamp,),
            ).fetchall()
        return [dict(row) for row in rows]

    def mark_auth_state(self, auth_id: str, state: str, now: int | None = None) -> bool:
        if state not in {"finalizing", "finalized", "revoking", "revoked"}:
            raise ProtocolError("auth_custody_state_invalid")
        timestamp = int(time.time()) if now is None else now
        with self._lock, self._db:
            cursor = self._db.execute(
                "UPDATE auth_custody SET state=?,updated_at=? WHERE auth_id=?",
                (state, timestamp, auth_id),
            )
            return cursor.rowcount == 1

    def auth_custody(self, auth_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute(
                "SELECT auth_id,command_id,account_ref,state,expires_at,updated_at "
                "FROM auth_custody WHERE auth_id=?",
                (auth_id,),
            ).fetchone()
        return dict(row) if row else None

    def auth_custody_for_account(self, account_ref: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute(
                "SELECT auth_id,command_id,account_ref,state,expires_at,updated_at "
                "FROM auth_custody WHERE account_ref=? ORDER BY updated_at DESC LIMIT 1",
                (account_ref,),
            ).fetchone()
        return dict(row) if row else None

    def finalizing_auth(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._db.execute(
                "SELECT auth_id,command_id,account_ref,state,expires_at,updated_at "
                "FROM auth_custody WHERE state='finalizing' ORDER BY updated_at"
            ).fetchall()
        return [dict(row) for row in rows]

    def terminal_effect_count(self) -> int:
        with self._lock:
            row = self._db.execute(
                "SELECT COUNT(*) AS count FROM send_effects WHERE status!='in_flight'"
            ).fetchone()
        return int(row["count"])
