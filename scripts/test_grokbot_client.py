"""Offline checks of the shareable client's report escaping and credential handling."""
import importlib.util
from pathlib import Path
import unittest

module_path = Path(__file__).resolve().parents[1] / "public" / "grokbot_accounting.py"
spec = importlib.util.spec_from_file_location("grokbot_accounting", module_path)
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


class GrokbotClientTests(unittest.TestCase):
    def test_report_is_self_contained_escaped_and_exact(self):
        report = {
            "monthly": [{"month": "2026-10", "revenue": "100.00", "expenses": "25.25", "result": "74.75", "bankMovement": "-0.01"}],
            "profitAndLoss": {"revenue": "100.00", "expenses": "25.25", "result": "74.75"},
            "period": {"dateFrom": "2026-10-01", "dateTo": "2026-10-23"},
            "generatedAt": "2026-10-23T00:00:00Z", "basis": "Recorded journal",
            "trialBalance": {"difference": "0.00"},
            "readiness": {"errorCount": 1, "warningCount": 0, "findings": [{"code": "missing_receipt", "message": '<script>alert("bad")</script>', "entryId": "entry"}]},
        }
        rendered = client.render_report(report)
        self.assertIn("74.75 SEK", rendered)
        self.assertIn("-0.01 SEK", rendered)
        self.assertIn("&lt;script&gt;", rendered)
        self.assertNotIn("<script>", rendered)
        self.assertNotIn("Authorization", rendered)
        self.assertNotIn("/api/accounting/", rendered)

    def test_client_cannot_send_bearer_to_redirect_or_arbitrary_path(self):
        connection = client.AccountingClient("https://example.test/api/accounting/private/agent/v1", "secret")
        self.assertIsNone(client._NoRedirect().redirect_request(None, None, 302, None, None, "https://other.test"))
        for path in ["https://other.test", "//other.test", "/../secret", "/entries?override=1"]:
            with self.assertRaises(ValueError):
                connection.request("GET", path)
        with self.assertRaises(ValueError):
            client.AccountingClient("http://example.test", "secret")


if __name__ == "__main__":
    unittest.main()
