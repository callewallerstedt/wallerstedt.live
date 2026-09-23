import { getAccountingDb } from "@/lib/accounting/db";
import { AccountingError, redactedErrorDiagnostic } from "@/lib/accounting/errors";

import { CATEGORY_BY_ID } from "./categories";
import { getFinanceSummary, type FinanceCoach } from "./store";

/** GPT-6 Sol. Override with FINANCE_AI_MODEL. */
export const FINANCE_COACH_MODEL = "gpt-6-sol";

const kr = (cents: number | null | undefined) =>
  cents == null ? "n/a" : `${Math.round(cents / 100).toLocaleString("sv-SE")} kr`;

/** A compact, numbers-only brief. No IBANs, names of people or raw bank lines. */
export function coachBrief(summary: Awaited<ReturnType<typeof getFinanceSummary>>) {
  const m = summary.month;
  const lines = [
    `Month: ${m.month}${m.isCurrent ? ` (day ${m.dayOfMonth} of ${m.daysInMonth})` : ""}`,
    `Bank balance total: ${kr(summary.totals.bankCents)}. Other assets (investments etc.): ${kr(summary.totals.assetsCents)}.`,
    `This month: income ${kr(m.incomeCents)}, spending ${kr(m.spendingCents)}, moved to savings/investing ${kr(m.savedCents)}. Projected month spending ${kr(m.projectedSpendingCents)}.`,
    `Normal month (avg of ${summary.averageMonths.length} months): income ${kr(m.avgIncomeCents)}, spending ${kr(m.avgSpendingCents)}.`,
    "",
    "Spending by category this month (spent / budget / normal month avg / purchases):",
    ...summary.categories.map((row) => {
      const label = CATEGORY_BY_ID.get(row.id)?.label ?? row.id;
      return `- ${label}: ${kr(row.spentCents)} / ${row.budgetCents == null ? "no budget" : kr(row.budgetCents)} / ${kr(row.avgCents)} / ${row.count}`;
    }),
    "",
    "Top places this month:",
    ...summary.merchants.slice(0, 10).map((row) => `- ${row.merchant}: ${kr(row.cents)} over ${row.count} purchases`),
    "",
    "Repeating payments (approx per month):",
    ...summary.recurring.slice(0, 15).map((row) => `- ${row.merchant} (${CATEGORY_BY_ID.get(row.category)?.label ?? row.category}): ${kr(row.monthlyCents)}`),
    "",
    "Last 12 months income / spending:",
    ...summary.history.filter((row) => row.hasData).map((row) => `- ${row.month}: ${kr(row.incomeCents)} / ${kr(row.spendingCents)}`),
    "",
    `Spending by weekday Mon..Sun: ${summary.weekday.map((cents) => kr(cents)).join(", ")}`,
  ];
  return lines.join("\n");
}

const SYSTEM = `You are a sharp, friendly personal finance coach for a young Swedish musician and company owner (Wallerstedt Productions AB, his own company; this data is his PRIVATE accounts only).
Give advice grounded ONLY in the numbers provided. No generic filler like "make a budget" unless the data shows why.
Write in English, casual and direct, like a smart friend. Use kr amounts. Swedish context: ISK, Avanza, index funds, Swish, autogiro, high-interest savings accounts.
Format: a one-line verdict on the month, then 5-7 numbered tips. Each tip: a bold short title, one or two sentences with the concrete action and the yearly kr it would save or earn. End with one line "Budget suggestion:" listing 3-5 category budgets in kr/month.
Never invent transactions. Never recommend specific individual stocks. Keep it under 300 words.`;

export async function runFinanceCoach(month?: string, question?: string): Promise<FinanceCoach> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AccountingError("OpenAI is not configured (OPENAI_API_KEY).", 503, "coach_not_configured");
  }
  const summary = await getFinanceSummary(month);
  if (!summary.accounts.length) {
    throw new AccountingError("Connect a bank first so there is something to coach on.", 400, "coach_no_data");
  }
  const model = process.env.FINANCE_AI_MODEL?.trim() || FINANCE_COACH_MODEL;
  const { generateText } = await import("ai");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const openai = createOpenAI({ apiKey });
  let text: string;
  try {
    const result = await generateText({
      model: openai(model),
      system: SYSTEM,
      prompt: `${coachBrief(summary)}${question?.trim() ? `\n\nHis question: ${question.trim().slice(0, 500)}` : ""}`,
    });
    text = result.text.trim();
  } catch (error) {
    console.error("Finance coach failed", redactedErrorDiagnostic(error));
    throw new AccountingError("The coach could not answer right now. Try again in a moment.", 502, "coach_failed");
  }
  const coach: FinanceCoach = { at: new Date().toISOString(), month: summary.month.month, model, text };
  if (!question?.trim()) {
    await getAccountingDb().financeMeta.upsert({
      where: { key: "coach" },
      create: { key: "coach", value: coach },
      update: { value: coach },
    });
  }
  return coach;
}
