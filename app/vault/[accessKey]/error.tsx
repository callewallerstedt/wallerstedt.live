"use client";

export default function AccountingVaultError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="accounting-app ac-gate">
      <section className="ac-login-card ac-connection-card">
        <span className="ac-gate-logo ac-gate-logo--warning" aria-hidden="true">!</span>
        <p className="ac-eyebrow">Något gick fel</p>
        <h1>Sidan kunde inte öppnas</h1>
        <p>Inga bokföringsuppgifter har ändrats. Försök att ladda om den privata sidan.</p>
        <button className="ac-button ac-button--primary ac-button--full" type="button" onClick={reset}>Försök igen</button>
      </section>
    </main>
  );
}
