import { daysUntil } from "./format";
import type { UpcomingRow } from "./types";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function quarterlyVatDeadlines(year: number): Array<{ period: string; date: string }> {
  return [
    { period: `VAT Q4 ${year - 1}`, date: `${year}-02-12` },
    { period: `VAT Q1 ${year}`, date: `${year}-05-12` },
    { period: `VAT Q2 ${year}`, date: `${year}-08-12` },
    { period: `VAT Q3 ${year}`, date: `${year}-11-12` },
    { period: `VAT Q4 ${year}`, date: `${year + 1}-02-12` },
  ];
}

export function nextMonthlyTaxDate(fromYmd: string) {
  const year = Number(fromYmd.slice(0, 4));
  const month = Number(fromYmd.slice(5, 7));
  const day = Number(fromYmd.slice(8, 10));
  if (day < 12) return `${year}-${pad(month)}-12`;
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return `${next.year}-${pad(next.month)}-12`;
}

export function taxUpcoming(nowYmd: string): UpcomingRow[] {
  const year = Number(nowYmd.slice(0, 4));
  const vat = quarterlyVatDeadlines(year)
    .filter((item) => item.date >= nowYmd)
    .slice(0, 2)
    .map((item) => ({
      id: `vat-${item.date}`,
      title: item.period,
      date: item.date,
      kind: "tax" as const,
      detail: "Standard quarterly VAT calendar — not confirmed from Skatteverket",
    }));

  const prelim = nextMonthlyTaxDate(nowYmd);
  return [
    ...vat,
    {
      id: `prelim-${prelim}`,
      title: "F-skatt / preliminärskatt",
      date: prelim,
      kind: "tax",
      detail: "Typical 12th-of-month payment date",
    },
  ];
}

export function vatDeadlineAlert(nowYmd: string) {
  const year = Number(nowYmd.slice(0, 4));
  const next = quarterlyVatDeadlines(year).find((item) => item.date >= nowYmd);
  if (!next) return null;
  const days = daysUntil(nowYmd, next.date);
  if (days == null || days > 21) return null;
  return {
    id: `vat-soon-${next.date}`,
    title: "VAT deadline approaching",
    detail: `${next.period} on ${next.date}`,
    tone: "warn" as const,
  };
}
