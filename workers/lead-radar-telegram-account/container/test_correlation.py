import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from correlation import SendCorrelation


class SendCorrelationTests(unittest.TestCase):
    def test_success_after_waiter_registration(self) -> None:
        correlation = SendCorrelation()
        early, waiter = correlation.register(-101)
        self.assertIsNone(early)
        event = {"@type": "updateMessageSendSucceeded", "old_message_id": -101}
        correlation.complete(-101, event)
        self.assertEqual(waiter.get_nowait(), event)

    def test_failure_before_registration_closes_race(self) -> None:
        correlation = SendCorrelation()
        event = {"@type": "updateMessageSendFailed", "old_message_id": -202}
        correlation.complete(-202, event)
        early, _waiter = correlation.register(-202)
        self.assertEqual(early, event)

    def test_early_results_are_bounded_and_cleanup_is_idempotent(self) -> None:
        correlation = SendCorrelation(maximum_early_results=2)
        correlation.complete(-1, {"old_message_id": -1})
        correlation.complete(-2, {"old_message_id": -2})
        correlation.complete(-3, {"old_message_id": -3})
        self.assertEqual(correlation.early_count, 2)
        first, _waiter = correlation.register(-1)
        self.assertIsNone(first)
        correlation.cleanup(-1)
        correlation.cleanup(-1)


if __name__ == "__main__":
    unittest.main()
