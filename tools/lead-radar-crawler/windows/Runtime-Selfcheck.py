"""Offline relocated-runtime proof; no site request, token, state file or real company."""

import hashlib
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import sqlite3
import ssl
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from importlib.metadata import version


def traverse_bypass_present() -> bool:
    """Read this child process token; never adjust account or machine privileges."""
    class Luid(ctypes.Structure):
        _fields_ = [("low", wintypes.DWORD), ("high", wintypes.LONG)]

    kernel = ctypes.WinDLL("kernel32.dll", use_last_error=True)
    api = ctypes.WinDLL("advapi32.dll", use_last_error=True)
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    api.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
    api.OpenProcessToken.restype = wintypes.BOOL
    api.LookupPrivilegeValueW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, ctypes.POINTER(Luid)]
    api.LookupPrivilegeValueW.restype = wintypes.BOOL
    api.GetTokenInformation.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
    api.GetTokenInformation.restype = wintypes.BOOL
    token = wintypes.HANDLE()
    if not api.OpenProcessToken(kernel.GetCurrentProcess(), 8, ctypes.byref(token)):
        raise RuntimeError("child_token_query_failed")
    try:
        luid = Luid()
        if not api.LookupPrivilegeValueW(None, "SeChangeNotifyPrivilege", ctypes.byref(luid)):
            raise RuntimeError("child_privilege_lookup_failed")
        length = wintypes.DWORD()
        api.GetTokenInformation(token, 3, None, 0, ctypes.byref(length))
        if not 4 <= length.value <= 65536:
            raise RuntimeError("child_token_size_invalid")
        buffer = ctypes.create_string_buffer(length.value)
        if not api.GetTokenInformation(token, 3, buffer, length.value, ctypes.byref(length)):
            raise RuntimeError("child_token_privileges_failed")
        data = buffer.raw[:length.value]
        count = int.from_bytes(data[:4], "little")
        if count > 1024 or 4 + count * 12 > len(data):
            raise RuntimeError("child_token_invalid")
        expected = ctypes.string_at(ctypes.addressof(luid), 8)
        return any(data[4 + i * 12:12 + i * 12] == expected for i in range(count))
    finally:
        kernel.CloseHandle(token)


assert not traverse_bypass_present(), "child_traverse_privilege_not_removed"
ROOT = Path(r"C:\ProgramData\GPTBot\LeadRadarCollector")
assert Path(sys.prefix).resolve() == (ROOT / "python").resolve(), "python_not_relocated"
sys.path.insert(0, str(ROOT / "app"))
from collector.engine import SCHEMA
from scrapling import Selector

assert version("scrapling") == "0.4.15"
assert Selector(content="<a href='/contacts'>Owned fixture</a>", adaptive=False, huge_tree=False).css("a")[0].attrib["href"] == "/contacts"
assert sqlite3.connect(":memory:").execute("SELECT 1").fetchone()[0] == 1
assert ssl.create_default_context().check_hostname
identity = {"name": "Collector Runtime Selfcheck", "phone": "+998901234567", "address": None,
            "city": "Fixture", "website": "https://fixture-clinic.uz/", "canonical_key": "runtime-fixture"}
identity_digest = hashlib.sha256(json.dumps(identity, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
now = datetime.now(timezone.utc)
stamp = lambda value: value.isoformat(timespec="milliseconds").replace("+00:00", "Z")
job = {"schema": SCHEMA, "id": "runtime-selfcheck", "orgId": "fixture-org", "companyId": "fixture-company",
       "identity": identity, "identityDigest": identity_digest, "url": identity["website"], "leaseGeneration": 1,
       "deadlineAt": stamp(now + timedelta(seconds=120)), "leaseExpiresAt": stamp(now + timedelta(seconds=180)),
       "limits": {"maxPages": 1, "maxPageBytes": 4096, "maxTotalBytes": 4096, "maxRedirects": 0}, "resumeUrls": []}
html = '<h1>Collector Runtime Selfcheck</h1><a href="tel:+998901234567">+998 90 123 45 67</a>'
raw = {"schema": SCHEMA, "jobId": job["id"], "leaseGeneration": 1, "receiptId": "runtime-selfcheck-receipt",
       "identityDigest": identity_digest, "status": "completed", "reason": "ok", "retryAt": None, "resumeUrls": [],
       "pages": [{"requestedUrl": identity["website"], "url": identity["website"], "html": html, "status": 200,
                  "fetchedAt": stamp(now), "sha256": hashlib.sha256(html.encode()).hexdigest()}]}
node = ROOT / "node" / "node.exe"
extractor = ROOT / "app" / "extractor.mjs"
process = subprocess.run([str(node), str(extractor)], input=json.dumps({"job": job, "result": raw}),
                         text=True, capture_output=True, timeout=15, check=False)
assert process.returncode == 0, "canonical_extractor_failed"
result = json.loads(process.stdout)
assert result["schema"] == SCHEMA and result["binding"] and result["evidence"], "canonical_extractor_empty"
assert all("html" not in page for page in result["pages"]), "raw_html_leaked"
node_version = subprocess.run([str(node), "--version"], capture_output=True, text=True, timeout=5, check=True).stdout.strip()
print(json.dumps({"ok": True, "python": sys.version.split()[0], "scrapling": version("scrapling"),
                  "node": node_version, "extractorVersion": result["extractorVersion"], "networkUsed": False,
                  "traverseBypassRemoved": True}))
