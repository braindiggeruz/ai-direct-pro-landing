"""Bounded correlation for TDLib's temporary message identifiers."""

from __future__ import annotations

import queue
import threading
from typing import Any


class SendCorrelation:
    def __init__(self, maximum_early_results: int = 128) -> None:
        if maximum_early_results < 1:
            raise ValueError("maximum_early_results")
        self._maximum = maximum_early_results
        self._lock = threading.RLock()
        self._waiters: dict[int, queue.Queue[dict[str, Any]]] = {}
        self._early: dict[int, dict[str, Any]] = {}

    def complete(self, temporary_message_id: int, event: dict[str, Any]) -> None:
        with self._lock:
            waiter = self._waiters.get(temporary_message_id)
            if waiter is None:
                if len(self._early) >= self._maximum:
                    oldest = next(iter(self._early))
                    self._early.pop(oldest, None)
                self._early[temporary_message_id] = event
                return
        try:
            waiter.put_nowait(event)
        except queue.Full:
            pass

    def register(
        self,
        temporary_message_id: int,
    ) -> tuple[dict[str, Any] | None, queue.Queue[dict[str, Any]]]:
        waiter: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
        with self._lock:
            early = self._early.pop(temporary_message_id, None)
            if early is None:
                self._waiters[temporary_message_id] = waiter
        return early, waiter

    def cleanup(self, temporary_message_id: int) -> None:
        with self._lock:
            self._waiters.pop(temporary_message_id, None)
            self._early.pop(temporary_message_id, None)

    def clear(self) -> None:
        with self._lock:
            self._waiters.clear()
            self._early.clear()

    @property
    def early_count(self) -> int:
        with self._lock:
            return len(self._early)
