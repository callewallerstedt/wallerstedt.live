"""Dependency-free accounting API client and standalone report exporter.

Set GROKBOT_ACCOUNTING_BASE and GROKBOT_ACCOUNTING_TOKEN in the bot's secret store.
Example: python grokbot_accounting.py --from 2026-01-01 --to 2026-10-23 --out reports
"""
import argparse
from decimal import Decimal
import hashlib
import html
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request


class AccountingError(RuntimeError):
    def __init__(self, status, payload):
        self.status = status
        self.payload = payload
        super().__init__(f"Accounting API HTTP {status}: {payload.get('error', 'request_failed')}")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward the bearer token to a redirect target.


class AccountingClient:
    def __init__(self, base=None, token=None):
        self.base = (base or os.environ["GROKBOT_ACCOUNTING_BASE"]).strip().rstrip("/")
        self.token = (token or os.environ["GROKBOT_ACCOUNTING_TOKEN"]).strip()
        parsed = urllib.parse.urlsplit(self.base)
        if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment or parsed.username:
            raise ValueError("Use an HTTPS API base without credentials, query or fragment")
        if not self.token:
            raise ValueError("Missing accounting API token")
        self.opener = urllib.request.build_opener(_NoRedirect())

    def request(self, method, path, body=None, query=None, raw=False):
        """Generic access to every documented tool. No automatic mutation retries."""
        if not path.startswith("/") or path.startswith("//") or ".." in path.split("/") or "?" in path:
            raise ValueError("Use a relative API path, with query parameters supplied separately")
        target = self.base + path
        if query:
            target += "?" + urllib.parse.urlencode({k: str(v).lower() if isinstance(v, bool) else v for k, v in query.items() if v is not None})
        headers = {"Authorization": "Bearer " + self.token, "Accept": "application/json"}
        data = None
        if body is not None:
            data = json.dumps(body, default=lambda value: str(value) if isinstance(value, Decimal) else _unsupported(value)).encode("utf-8")
            headers["Content-Type"] = "application/json"
        try:
            with self.opener.open(urllib.request.Request(target, data=data, headers=headers, method=method), timeout=120) as response:
                content = response.read()
                return content if raw else json.loads(content, parse_float=Decimal)
        except urllib.error.HTTPError as error:
            try:
                payload = json.loads(error.read())
            except (ValueError, UnicodeDecodeError):
                payload = {"error": "non_json_response"}
            raise AccountingError(error.code, payload) from None
        except urllib.error.URLError:
            raise RuntimeError("Accounting API network failure; read current state before retrying a mutation") from None

    def entries(self, **filters):
        """Browse every page. Use a report for a transactionally consistent snapshot."""
        filters = {**filters, "limit": 250}
        page = 1
        while True:
            result = self.request("GET", "/entries", query={**filters, "page": page})
            yield from result["entries"]
            if not result["hasMore"]:
                return
            page += 1

    def report(self, date_from, date_to, include_journal=False):
        return self.request("GET", "/reports", query={"dateFrom": date_from, "dateTo": date_to, "includeJournal": include_journal})

    def download_receipt(self, document_id, destination, sha256):
        identifier = urllib.parse.quote(document_id, safe="")
        content = self.request("GET", f"/attachments/{identifier}/download", raw=True)
        if hashlib.sha256(content).hexdigest().lower() != sha256.lower():
            raise ValueError("Downloaded receipt checksum mismatch; destination was not written")
        Path(destination).write_bytes(content)


def _unsupported(value):
    raise TypeError(f"Unsupported JSON value type: {type(value).__name__}")


def render_report(report):
    """Self-contained, script-free HTML: no credentials, API URLs or remote assets."""
    esc = lambda value: html.escape(str(value), quote=True)
    money = lambda value: esc(f"{Decimal(value):,.2f}") + " SEK"
    monthly = report["monthly"]
    values = [float(row[key]) for row in monthly for key in ("revenue", "expenses")]
    low, high = min([0] + values), max([1] + values)
    y = lambda value: 170 - (float(value) - low) / (high - low) * 140
    zero = y(0)
    width = max(600, len(monthly) * 80)
    bars = [f'<line x1="0" x2="{width}" y1="{zero}" y2="{zero}" stroke="#7a8798"/>']
    for index, row in enumerate(monthly):
        for offset, key, colour in [(10, "revenue", "#299c79"), (38, "expenses", "#df8b36")]:
            top, height = min(zero, y(row[key])), abs(zero - y(row[key]))
            bars.append(f'<rect x="{index*80+offset}" y="{top:.3f}" width="24" height="{height:.3f}" fill="{colour}"><title>{esc(row["month"])} {key}: {money(row[key])}</title></rect>')
        bars.append(f'<text x="{index*80+35}" y="200" text-anchor="middle" font-size="11">{esc(row["month"])}</text>')
    rows = "".join("<tr><td>" + esc(row["month"]) + "</td>" + "".join("<td>" + money(row[key]) + "</td>" for key in ("revenue", "expenses", "result", "bankMovement")) + "</tr>" for row in monthly)
    issues = "".join(f'<li><code>{esc(row["code"])}</code>: {esc(row["message"])} <small>{esc(row.get("entryId") or "")}</small></li>' for row in report["readiness"]["findings"])
    totals = "".join(f'<article>{label}<strong>{money(report["profitAndLoss"][key])}</strong></article>' for key, label in [("revenue", "Revenue"), ("expenses", "Expenses / net class 4–8 movements"), ("result", "Result")])
    return f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"><title>Wallerstedt company report</title>
<style>body{{font:16px system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:24px;color:#223044;background:#f5f7fa}}h1{{font-size:32px}}.totals{{display:flex;flex-wrap:wrap;gap:20px}}article{{background:white;padding:24px;border-radius:12px;flex:1}}strong{{display:block;font-size:24px;margin-top:12px}}figure{{margin:24px 0;overflow:auto}}table{{width:100%;border-collapse:collapse}}th,td{{padding:12px;text-align:right;border-bottom:1px solid #ccd3dd}}th:first-child,td:first-child{{text-align:left}}small{{overflow-wrap:anywhere}}li{{margin:12px 0}}@media print{{body{{background:white;margin:0}}}}</style>
<h1>Wallerstedt Productions AB</h1><p>{esc(report["period"]["dateFrom"])} — {esc(report["period"]["dateTo"])} · generated {esc(report["generatedAt"])}</p>
<div class="totals">{totals}</div><p>{esc(report["basis"])}</p>
<figure><figcaption>Monthly revenue (green) and expenses (orange) · SEK</figcaption><svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="210" role="img" aria-label="Monthly revenue and expenses; exact amounts in the table below">{"".join(bars)}</svg></figure>
<table><thead><tr><th>Month</th><th>Revenue</th><th>Expenses</th><th>Result</th><th>1930 movement</th></tr></thead><tbody>{rows}</tbody></table>
<h2>Review required</h2><p>{report["readiness"]["errorCount"]} errors, {report["readiness"]["warningCount"]} warnings. Trial balance difference: {money(report["trialBalance"]["difference"])}. Declaration and annual-report submission are not completed by this report.</p><ul>{issues}</ul><p>Company financial information. This report contains no API credentials.</p></html>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="date_from", required=True)
    parser.add_argument("--to", dest="date_to", required=True)
    parser.add_argument("--out", default="reports")
    args = parser.parse_args()
    report = AccountingClient().report(args.date_from, args.date_to, include_journal=True)
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    stem = f'accounting-{report["period"]["dateFrom"]}-{report["period"]["dateTo"]}'
    (output / f"{stem}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    (output / f"{stem}.html").write_text(render_report(report), encoding="utf-8")
    print(f"Wrote report HTML and JSON to {output.resolve()}")


if __name__ == "__main__":
    main()
