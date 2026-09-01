import { getTradingBook, getTradingCharts } from "@/lib/trading-server";
import { formatBerlinDateTime } from "@/lib/trading";

import { TradingDesk } from "./TradingDesk";

export const revalidate = 60;

export default async function TradingPage() {
  const book = await getTradingBook();
  const charts = await getTradingCharts(book);
  const updatedLabel = book.updatedAt ? formatBerlinDateTime(book.updatedAt, book.timezone) : "just now";

  return (
    <main className="trading-page">
      <section className="trading-hero">
        <div className="container">
          <p className="trading-kicker">{book.experiment.title}</p>
          <h1>Trading</h1>
          <p className="trading-dek">
            {book.experiment.operator}&apos;s live book. Long-only swing, {book.experiment.capitalSek.toLocaleString("en-GB")}{" "}
            SEK cap. Public marks only — no broker accounts.
          </p>
          <p className="trading-updated">Last update {updatedLabel}</p>
        </div>
      </section>
      <div className="container">
        <TradingDesk initialBook={book} initialCharts={charts} />
      </div>
    </main>
  );
}
