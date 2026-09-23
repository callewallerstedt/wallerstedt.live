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

/* ------------------------------------------------------------------------ */
/* The assistant that can change things                                      */
/* ------------------------------------------------------------------------ */

const ASSISTANT_SYSTEM = `${SYSTEM.split("\n")[0]}
You can also CHANGE the owner's finance setup with tools: recategorise transactions (one or every purchase at a merchant), create categories, set budgets, set fixed monthly costs, and sort the "Other" pile.
Categories that never count as spending: excluded (one-offs like a big tax bill), company (Företagsutlägg: paid privately for Wallerstedt Productions AB, to be paid back), loan (money borrowed from/paid back to family, e.g. his dad), transfer, savings.
When he asks for a change, look things up first if needed, make the change, then confirm in one or two short lines what you changed (with counts and kr). Answer in the language he writes in. Never invent transaction ids: get them from findTransactions.`;

export async function runFinanceAssistant(message: string, month?: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AccountingError("OpenAI is not configured (OPENAI_API_KEY).", 503, "coach_not_configured");
  const store = await import("./store");
  const { FINANCE_CATEGORIES } = await import("./categories");
  const { generateText, tool, stepCountIs } = await import("ai");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const { z } = await import("zod");
  const openai = createOpenAI({ apiKey });
  const model = process.env.FINANCE_AI_MODEL?.trim() || FINANCE_COACH_MODEL;
  const summary = await getFinanceSummary(month);
  const actions: string[] = [];
  const categoryList = () =>
    FINANCE_CATEGORIES.map((c) => `${c.id} (${c.label}${c.neutral ? ", not spending" : c.income ? ", income" : ""})`).join(", ");

  const tools = {
    findTransactions: tool({
      description: "Search transactions. Returns id, date, amountSek (negative = out), text, merchant, category.",
      inputSchema: z.object({
        q: z.string().optional().describe("Text to search for, e.g. Elgiganten"),
        category: z.string().optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      execute: async (input) => {
        const result = await store.listTransactions({ ...input, limit: input.limit ?? 50 });
        return {
          total: result.total,
          rows: result.transactions.map((row) => ({
            id: row.id,
            date: row.date,
            amountSek: row.amountCents / 100,
            text: row.counterparty || row.description,
            merchant: row.merchant,
            category: row.category,
          })),
        };
      },
    }),
    setCategory: tool({
      description:
        "Put transactions in a category. Give transactionIds, or a merchant key (from findTransactions) to move every purchase there and remember it for the future.",
      inputSchema: z.object({
        category: z.string(),
        transactionIds: z.array(z.string()).max(200).optional(),
        merchant: z.string().optional(),
      }),
      execute: async ({ category, transactionIds, merchant }) => {
        let changed = 0;
        for (const id of transactionIds ?? []) {
          await store.setTransactionCategory({ id, category });
          changed += 1;
        }
        if (merchant) changed += await store.setMerchantCategory(merchant, category);
        actions.push(`${changed} → ${category}`);
        return { changed };
      },
    }),
    createCategory: tool({
      description: "Create a new category. kind: spending (counts as spending), neutral (never counts), income.",
      inputSchema: z.object({ label: z.string().min(1).max(40), emoji: z.string().max(8).optional(), kind: z.enum(["spending", "neutral", "income"]).optional() }),
      execute: async (input) => {
        const row = await store.createCustomCategory(input);
        actions.push(`new category ${row.label}`);
        return { id: row.id, label: row.label };
      },
    }),
    setBudgets: tool({
      description: "Set monthly budgets in whole kronor per category id. 0 removes a budget.",
      inputSchema: z.object({ budgets: z.record(z.string(), z.number().min(0)) }),
      execute: async ({ budgets }) => {
        const saved = await store.setBudgets(
          Object.entries(budgets).map(([category, sek]) => ({ category, monthlyCents: Math.round(sek * 100) || null })),
        );
        actions.push("budgets updated");
        return { budgets: saved.map((row) => ({ category: row.category, sek: row.monthlyCents / 100 })) };
      },
    }),
    setFixedCost: tool({
      description: "Add or update a fixed monthly cost (matched by name). match = text that appears in the bank line.",
      inputSchema: z.object({
        name: z.string().min(1).max(60),
        amountSek: z.number().min(0),
        category: z.string().optional(),
        match: z.string().max(60).optional(),
        day: z.number().int().min(1).max(31).optional(),
        remove: z.boolean().optional(),
      }),
      execute: async ({ name, amountSek, category, match, day, remove }) => {
        const list = await store.listFixedCosts();
        const rest = list.filter((row) => row.name.toLowerCase() !== name.toLowerCase());
        const existing = list.find((row) => row.name.toLowerCase() === name.toLowerCase());
        const next = remove
          ? rest
          : [...rest, { id: existing?.id, name, amountCents: Math.round(amountSek * 100), category: category ?? existing?.category, match: match ?? existing?.match ?? name, day: day ?? existing?.day ?? null }];
        await store.saveFixedCosts(next);
        actions.push(remove ? `removed fixed cost ${name}` : `fixed cost ${name} ${amountSek} kr`);
        return { ok: true };
      },
    }),
    sortOther: tool({
      description: "Let AI sort every transaction still in 'other' into categories, saving a rule per merchant.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await aiSortOther();
        actions.push(`sorted ${result.transactions} transactions`);
        return result;
      },
    }),
  };

  const result = await generateText({
    model: openai(model),
    system: `${ASSISTANT_SYSTEM}\nCategory ids: ${categoryList()}.`,
    prompt: `${coachBrief(summary)}\n\nHim: ${message.slice(0, 1000)}`,
    tools,
    stopWhen: stepCountIs(8),
  });
  return { text: result.text.trim(), actions, model };
}

/**
 * Ask the model to sort the merchants still in "other". Each answer becomes a
 * merchant rule, so it also applies to future purchases.
 */
export async function aiSortOther() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AccountingError("OpenAI is not configured (OPENAI_API_KEY).", 503, "coach_not_configured");
  const store = await import("./store");
  const { FINANCE_CATEGORIES } = await import("./categories");
  const merchants = await store.otherMerchants(150);
  if (!merchants.length) return { merchants: 0, transactions: 0 };
  const { generateText } = await import("ai");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const openai = createOpenAI({ apiKey });
  const model = process.env.FINANCE_AI_MODEL?.trim() || FINANCE_COACH_MODEL;
  const ids = FINANCE_CATEGORIES.filter((c) => !["transfer", "income"].includes(c.id)).map((c) => `${c.id}: ${c.label}`);
  const result = await generateText({
    model: openai(model),
    system:
      "You sort Swedish and European bank card lines (often cut at 14 characters) into budget categories. Reply with JSON only: an object mapping each merchant key exactly as given to a category id, or to null if you really cannot tell. Use company, loan or excluded only when the text clearly says so.",
    prompt: `Categories:\n${ids.join("\n")}\n\nMerchants (key | example text | count | total kr):\n${merchants
      .map((m) => `${m.merchant} | ${m.example} | ${m.count} | ${Math.round(m.cents / 100)}`)
      .join("\n")}`,
  });
  const json = /\{[\s\S]*\}/.exec(result.text)?.[0] ?? "{}";
  let mapping: Record<string, string | null> = {};
  try {
    mapping = JSON.parse(json);
  } catch {
    mapping = {};
  }
  let transactions = 0;
  let applied = 0;
  for (const [merchant, category] of Object.entries(mapping)) {
    if (!category || category === "other") continue;
    if (!merchants.some((m) => m.merchant === merchant)) continue;
    const count = await store.setMerchantCategory(merchant, category).catch(() => 0);
    if (count) {
      applied += 1;
      transactions += count;
    }
  }
  return { merchants: applied, transactions };
}
