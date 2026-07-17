import Image from "next/image";

export default function AccountingVaultLoading() {
  return (
    <main className="accounting-app ac-gate ac-loading-gate" aria-busy="true">
      <span className="ac-gate-logo" aria-hidden="true">
        <Image alt="" height={56} priority src="/accounting-logo.png" width={56} />
      </span>
      <div className="ac-loader" aria-hidden="true" />
      <p>Öppnar din bokföring…</p>
    </main>
  );
}
