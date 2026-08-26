import threading
import sys
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

from server import Runtime


class _ConnectedClient:
    authorization_state = "connected"


class RuntimeAuthCancellationTests(unittest.TestCase):
    def test_connected_client_is_never_reset_by_auth_cancellation(self) -> None:
        runtime = object.__new__(Runtime)
        runtime.lock = threading.RLock()
        runtime.client = _ConnectedClient()

        self.assertFalse(runtime.cancel_auth())
        self.assertIsInstance(runtime.client, _ConnectedClient)
        self.assertEqual(runtime.client.authorization_state, "connected")


if __name__ == "__main__":
    unittest.main()
