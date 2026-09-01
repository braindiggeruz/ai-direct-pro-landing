"""Offline checks for the dedicated control API identity and redirect fence."""

import io
import json
import unittest
from unittest.mock import patch
from urllib.request import HTTPRedirectHandler

from collector.client import ApiClient, ApiError
from collector.engine import SCHEMA


class ControlClientTests(unittest.TestCase):
    def test_control_request_identifies_collector_without_changing_auth_or_payload(self):
        token = "lrcr_" + "a" * 64
        with patch("collector.client.build_opener") as build:
            build.return_value.open.return_value = io.BytesIO(b'{"ok":true,"job":null}')
            api = ApiClient("https://gptbot.uz/api/lead-radar/crawler", token)
            self.assertEqual(api.post("claim", {"schema": SCHEMA}), {"ok": True, "job": None})

        request = build.return_value.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://gptbot.uz/api/lead-radar/crawler/claim")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("User-agent"), "GPTBotLeadRadarCollector/2.0 (+https://gptbot.uz)")
        self.assertEqual(request.get_header("Authorization"), "Bearer " + token)
        self.assertEqual(request.get_header("Content-type"), "application/json")
        self.assertEqual(request.get_header("Accept"), "application/json")
        self.assertEqual(json.loads(request.data), {"schema": SCHEMA})
        self.assertEqual(build.return_value.open.call_args.kwargs, {"timeout": 15})
        self.assertEqual(build.return_value.open.call_count, 1)

    def test_control_redirects_still_refused_without_forwarding_bearer(self):
        api = ApiClient("https://gptbot.uz/api/lead-radar/crawler", "lrcr_" + "b" * 64)
        redirects = [handler for handler in api.opener.handlers if isinstance(handler, HTTPRedirectHandler)]
        self.assertEqual(len(redirects), 1)
        for status in (301, 302, 303, 307, 308):
            with self.subTest(status=status):
                def redirected(request, *, timeout):
                    self.assertEqual(timeout, 15)
                    return redirects[0].redirect_request(request, None, status, "Redirect", {}, "https://other.example/")

                with patch.object(api.opener, "open", side_effect=redirected) as opened:
                    with self.assertRaises(ApiError) as caught:
                        api.post("claim", {"schema": SCHEMA})
                    self.assertEqual(caught.exception.code, "api_redirect_refused")
                    self.assertEqual(caught.exception.status, status)
                    self.assertEqual(opened.call_count, 1)


if __name__ == "__main__":
    unittest.main()
