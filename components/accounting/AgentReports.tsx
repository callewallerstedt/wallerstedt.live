"use client";

import { useState, type FormEvent } from "react";
import type { accountingReport } from "@/lib/accounting/reports";

type Report = Awaited<ReturnType<typeof accountingReport>>;
const sek = (value: string) => {
  const [whole, fraction] = value.split(".");
  return `${whole.startsWith("-") && BigInt(whole) === 0n ? "−" : ""}${BigInt(whole).toLocaleString("sv-SE")},${fraction ?? "00"} kr`;
};

export function AgentReports({ base, accessKey }: { base: string; accessKey: string }) {
  const year = new Intl.DateTimeFormat("sv-SE", { year: "numeric", timeZone: "Europe/Stockholm" }).format(new Date());
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date()));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setReport(null);
    try {
      const response = await fetch(`${base}/reports?${new URLSearchParams({ dateFrom: from, dateTo: to })}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Rapporten kunde inte läsas.");
      setReport(data);
    } catch (error) { setError(error instanceof Error ? error.message : "Rapportfel."); }
    finally { setBusy(false); }
  }
  const values = report?.monthly.flatMap((row) => [Number(row.revenue), Number(row.expenses)]) ?? [];
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const y = (value: number) => 170 - ((value - min) / (max - min)) * 140;
  const zero = y(0);
  const query = report ? new URLSearchParams(report.period) : null;
  return <section className="agent-report-card">
    <div className="agent-section-title"><span>03</span><h2>Rapporter och kontroll</h2></div>
    <p>Välj period. Kontrollera bolagets registrerade räkenskapsår inför bokslut.</p>
    <form className="agent-report-form" onSubmit={load}>
      <label>Från<input required type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Till<input required type="date" min={from} value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button disabled={busy} type="submit">{busy ? "Läser…" : "Skapa rapport"}</button>
    </form>
    {error && <p role="alert" className="agent-error">{error}</p>}
    {report && <>
      <div className="agent-report-totals">
        <p>Intäkter<strong>{sek(report.profitAndLoss.revenue)}</strong></p>
        <p>Kostnader<strong>{sek(report.profitAndLoss.expenses)}</strong></p>
        <p>Resultat<strong>{sek(report.profitAndLoss.result)}</strong></p>
      </div>
      <p>Kontobaserat resultat inkl. bokslutsposter, exkl. separat bokförd moms. Alla aktiva poster ingår oavsett status.</p>
      <figure>
        <figcaption>Intäkter och kostnader per månad · SEK</figcaption>
        <svg viewBox={`0 0 ${Math.max(500, report.monthly.length * 80)} 210`} role="img" aria-label="Gröna staplar visar intäkter, orange staplar kostnader. Exakta belopp finns i tabellen nedan.">
          <line x1="0" x2="100%" y1={zero} y2={zero} stroke="currentColor" opacity=".4" />
          {report.monthly.map((row, index) => <g key={row.month}>
            <rect x={index * 80 + 10} y={Math.min(zero, y(Number(row.revenue)))} width="24" height={Math.abs(zero - y(Number(row.revenue)))} fill="#58c99d"><title>{row.month} intäkter: {sek(row.revenue)}</title></rect>
            <rect x={index * 80 + 37} y={Math.min(zero, y(Number(row.expenses)))} width="24" height={Math.abs(zero - y(Number(row.expenses)))} fill="#f5a15b"><title>{row.month} kostnader: {sek(row.expenses)}</title></rect>
            <text x={index * 80 + 35} y="200" textAnchor="middle" fill="currentColor" fontSize="11">{row.month}</text>
          </g>)}
        </svg>
      </figure>
      <details><summary>Exakta månadsbelopp och bankrörelser</summary><div className="agent-table-scroll"><table><thead><tr><th>Månad</th><th>Intäkter</th><th>Kostnader</th><th>Resultat</th><th>Rörelse 1930</th></tr></thead><tbody>{report.monthly.map((row) => <tr key={row.month}><td>{row.month}</td><td>{sek(row.revenue)}</td><td>{sek(row.expenses)}</td><td>{sek(row.result)}</td><td>{sek(row.bankMovement)}</td></tr>)}</tbody></table></div></details>
      <p><a href={`${base}/reports?${query}&format=csv`}>Hämta huvudbok CSV</a> · <a href={`${base}/reports?${query}&includeJournal=true`}>Full rapport JSON</a></p>
      <p role="status"><strong>Kräver granskning:</strong> {report.readiness.errorCount} fel, {report.readiness.warningCount} varningar. Differens debet/kredit: {sek(report.trialBalance.difference)}. {report.pendingDrafts} väntande AI-utkast.</p>
      <p>Rapporten är ett arbetsunderlag. Deklaration och årsredovisning är inte klara eller inlämnade.</p>
      <details><summary>Kontrollpunkter och poster</summary><ul>{report.readiness.findings.map((finding, index) => <li key={index}><code>{finding.code}</code>: {finding.message} {finding.entryId && <a href={`/vault/${encodeURIComponent(accessKey)}?post=${finding.entryId}`}>Öppna post</a>}</li>)}</ul>{report.readiness.findingsTruncated && <p>Listan är begränsad. API-svaret innehåller fullständiga antal per feltyp.</p>}<ul>{report.readiness.externalChecklist.map((item) => <li key={item}>{item}</li>)}</ul></details>
      <details><summary>Saldobalans per konto</summary><p>Ingående saldo bygger på registrerad historik. Kontrollera mot föregående bokslut.</p><div className="agent-table-scroll"><table><thead><tr><th>Konto</th><th>IB</th><th>Debet</th><th>Kredit</th><th>UB</th></tr></thead><tbody>{report.trialBalance.accounts.map((row) => <tr key={row.account}><td>{row.account} {row.name}</td><td>{sek(row.opening)}</td><td>{sek(row.debit)}</td><td>{sek(row.credit)}</td><td>{sek(row.closing)}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
