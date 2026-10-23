"use client";
import { useCallback, useEffect, useState } from "react";

type Connection = { id: string; bank: string; status: string; validUntil: string; accounts: Array<{ uid: string; name?: string; currency?: string }> };
type BankState = { configured: boolean; callbackUrl: string; connections: Connection[]; available?: Array<{ name: string; country: string }> };
export function AgentBank({ base }: { base: string }) {
  const [state, setState] = useState<BankState | null>(null);
  const [bank, setBank] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [consentUrl, setConsentUrl] = useState("");
  const [balances, setBalances] = useState<Record<string, { fetchedAt: string; balances: Array<{ balance_type?: string; balance_amount: { amount: string; currency: string }; reference_date?: string }> }>>({});
  const read = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${base}${path}`, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error([data.message || "Bankfel", data.details?.bankCode].filter(Boolean).join(" · "));
    return data;
  }, [base]);
  const refresh = useCallback(async () => {
    try { setState(await read("/bank")); } catch (error) { setError(error instanceof Error ? error.message : "Bankfel"); }
  }, [read]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function action(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : "Bankfel"); }
    finally { setBusy(false); }
  }
  return <section className="agent-report-card">
    <div className="agent-section-title"><span>04</span><h2>Företagsbank · Handelsbanken</h2></div>
    <p>Separat företagsmedgivande via Enable Banking. Saldon och transaktioner läses från banken. BankID signeras av behörig företrädare.</p>
    {error && <p role="alert" className="agent-error">{error}</p>}
    {state && !state.configured && <p>Enable Banking saknar konfiguration i denna miljö.</p>}
    <button disabled={busy} onClick={() => void action(async () => { await refresh(); })} type="button">Uppdatera bankstatus</button>{" "}
    <button disabled={busy || !state?.configured} onClick={() => void action(async () => {
      const next: BankState = await read("/bank?banks=true"); setState(next);
      setBank(next.available?.find((item) => /handels/i.test(item.name))?.name ?? next.available?.[0]?.name ?? "");
    })} type="button">Hämta tillgängliga företagsbanker</button>
    {state?.available && <div className="agent-report-form">
      <select aria-label="Företagsbank" value={bank} onChange={(event) => setBank(event.target.value)}>{state.available.map((item) => <option key={`${item.country}:${item.name}`} value={item.name}>{item.name}</option>)}</select>
      <button disabled={busy || !bank} onClick={() => void action(async () => {
        setConsentUrl(""); const selected = state.available?.find((item) => item.name === bank);
        const result = await read("/bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank, country: selected?.country ?? "SE" }) });
        const target = new URL(result.url); if (target.protocol !== "https:") throw new Error("Ogiltig banklänk.");
        setConsentUrl(target.href);
      })} type="button">Förbered BankID-anslutning</button>
      {!state.available.length && <p>Inga företagsbanker tillgängliga för denna provider-app. Kontrollera behörighet hos Enable Banking.</p>}
    </div>}
    {consentUrl && <p><a href={consentUrl} target="_blank" rel="noreferrer">Öppna bankens medgivande och signera med BankID</a></p>}
    {state?.connections.map((connection) => <div key={connection.id}>
      <h3>{connection.bank} · {connection.status}</h3><p>Medgivande till {connection.validUntil.slice(0, 10)}</p>
      {connection.accounts.map((account) => <div key={account.uid}><p>{account.name || account.uid} · {account.currency}</p><button disabled={busy || connection.status !== "active"} type="button" onClick={() => void action(async () => {
        const result = await read(`/bank/accounts/${encodeURIComponent(account.uid)}/balances`); setBalances((current) => ({ ...current, [account.uid]: result }));
      })}>Hämta banksaldo</button>
        {balances[account.uid] && <><p>Hämtat {new Date(balances[account.uid].fetchedAt).toLocaleString("sv-SE")}</p><ul>{balances[account.uid].balances.map((balance, index) => <li key={index}>{balance.balance_type || "Okänd saldotyp"}: {balance.balance_amount.amount} {balance.balance_amount.currency} · {balance.reference_date || "Bankdatum saknas"}</li>)}</ul></>}
      </div>)}
    </div>)}
    <p>Tillgängligt saldo kan skilja sig från bokfört saldo. Bankens uppdateringstid och åtkomstgränser gäller. Privatkonton och företagskonton hålls isär.</p>
  </section>;
}
