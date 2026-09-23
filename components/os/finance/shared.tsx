"use client";

import { CATEGORY_BY_ID, FINANCE_CATEGORIES } from "@/lib/finance/categories";
import type { FinanceSummary, FinanceTransactionView } from "@/lib/finance/store";
import { formatSekTile } from "@/lib/os/format";
import { cn } from "@/lib/utils";

export type { FinanceSummary, FinanceTransactionView };

export function financeApi(accessKey: string) {
  const base = `/api/os/${encodeURIComponent(accessKey)}/agent/v1/finance`;
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } | string; message?: string };
    if (!response.ok) {
      const message =
        data.message || (typeof data.error === "string" ? data.error : data.error?.message) || `Request failed (${response.status})`;
      throw new Error(message);
    }
    return data as T;
  }
  return {
    base,
    get: <T,>(path: string) => request<T>(path),
    send: <T,>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) =>
      request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
  };
}

export const SPENDING_CATEGORIES = FINANCE_CATEGORIES.filter((category) => !category.income && !category.neutral);

export function categoryMeta(id: string) {
  return CATEGORY_BY_ID.get(id) ?? { id, label: id, emoji: "❔", color: "oklch(0.6 0.02 260)" };
}

export function CategoryDot({ id, className }: { id: string; className?: string }) {
  const meta = categoryMeta(id);
  return (
    <span
      className={cn("inline-grid size-8 shrink-0 place-items-center rounded-lg text-base", className)}
      style={{ background: `color-mix(in oklch, ${meta.color} 22%, transparent)` }}
      aria-hidden
    >
      {meta.emoji}
    </span>
  );
}

export function kr(cents: number | null | undefined) {
  return formatSekTile(cents ?? null);
}

export function signedKr(cents: number) {
  const value = formatSekTile(Math.abs(cents));
  return cents > 0 ? `+${value}` : cents < 0 ? `−${value}` : value;
}

export function monthLabel(month: string, style: "long" | "short" = "long") {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, m! - 1, 15));
  return date.toLocaleDateString("en-GB", style === "long" ? { month: "long", year: "numeric" } : { month: "short" });
}

export function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, m! - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function relativeTime(iso: string | null | undefined) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function maskIban(iban: string) {
  if (!iban) return "";
  return `•••• ${iban.replace(/\s+/g, "").slice(-4)}`;
}

export function merchantTitle(row: { merchant: string; counterparty: string; description: string }) {
  const raw = row.counterparty || row.merchant || row.description || "Unknown";
  // Bank text is usually SHOUTING; show it in a calmer case.
  return raw.length > 3 && raw === raw.toUpperCase()
    ? raw.toLowerCase().replace(/(^|[\s&/-])(\p{L})/gu, (_, sep: string, char: string) => sep + char.toUpperCase())
    : raw;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex w-full gap-1 rounded-xl bg-muted/60 p-1 ring-1 ring-foreground/5 sm:w-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 flex-1 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors sm:flex-none",
            value === option.value && "bg-background text-foreground shadow-sm ring-1 ring-foreground/10",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export type FinanceApi = ReturnType<typeof financeApi>;
