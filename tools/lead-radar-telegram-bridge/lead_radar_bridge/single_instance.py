from __future__ import annotations

import ctypes
import os
from ctypes import wintypes

from .security import SecurityError


ERROR_ALREADY_EXISTS = 183
MUTEX_NAME = "Local\\GPTBot.LeadRadar.TelegramBridge.v1"


class WindowsSingleInstance:
    """Per-user interactive-session mutex; never opens a network listener."""

    def __init__(self, name: str = MUTEX_NAME) -> None:
        self.name = name
        self._handle: int | None = None

    def acquire(self) -> None:
        if os.name != "nt":
            raise SecurityError("windows_runtime_required")
        kernel32 = ctypes.WinDLL("kernel32.dll", use_last_error=True)
        kernel32.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
        kernel32.CreateMutexW.restype = wintypes.HANDLE
        ctypes.set_last_error(0)
        handle = kernel32.CreateMutexW(None, False, self.name)
        if not handle:
            raise SecurityError("single_instance_unavailable")
        if ctypes.get_last_error() == ERROR_ALREADY_EXISTS:
            kernel32.CloseHandle(handle)
            raise SecurityError("bridge_already_running")
        self._handle = int(handle)

    def close(self) -> None:
        if self._handle is None:
            return
        kernel32 = ctypes.WinDLL("kernel32.dll", use_last_error=True)
        kernel32.CloseHandle(wintypes.HANDLE(self._handle))
        self._handle = None

    def __enter__(self) -> "WindowsSingleInstance":
        self.acquire()
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()
