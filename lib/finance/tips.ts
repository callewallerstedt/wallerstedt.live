import { CATEGORY_BY_ID } from "./categories";

/**
 * Concrete, number-backed ways to keep more money. Every tip is computed from
 * the owner's own history and carries an estimated yearly saving, so the list
 * can be ranked by what is actually worth doing.
 */

export type SavingsTip = {
  id: string;
  title: string;
  detail: string;
  /** Rough yearly effect in öre, when there is one to estimate. */
  yearlyCents: number | null;
  category?: string;
  tone: "save" | "grow" | "watch";
};

export type TipsInput = {
  bankCents: number;
  month: {
    isCurrent: boolean;
    incomeCents: number;
    spendingCents: number;
    savedCents: number;
    avgSpendingCents: number | null;
    avgIncomeCents: number | null;
    savingsRate: number | null;
  };
  categories: Array<{ id: string; spentCents: number; avgCents: number | null; budgetCents: number | null; count: number }>;
  recurring: Array<{ merchant: string; category: string; monthlyCents: number; steady: boolean }>;
  weekday: number[];
  smallPurchases: { count: number; cents: number; months: number };
  categoryCounts: Record<string, { count: number; cents: number; months: number }>;
};

function sek(cents: number) {
  return `${Math.round(cents / 100).toLocaleString("sv-SE")} kr`;
}

function label(id: string) {
  return CATEGORY_BY_ID.get(id)?.label.toLowerCase() ?? id;
}

export function buildSavingsTips(input: TipsInput): SavingsTip[] {
  const tips: SavingsTip[] = [];
  const monthlySpend = input.month.avgSpendingCents ?? input.month.spendingCents;
  const monthlyIncome = input.month.avgIncomeCents ?? input.month.incomeCents;

  // 1. Subscriptions: small each, big together.
  const subs = input.recurring.filter((row) => row.category === "subscriptions" && row.steady);
  const subsMonthly = subs.reduce((sum, row) => sum + row.monthlyCents, 0);
  if (subs.length >= 2 && subsMonthly > 10_000) {
    const cheapestTwo = [...subs].sort((a, b) => a.monthlyCents - b.monthlyCents).slice(0, 2);
    tips.push({
      id: "subscriptions",
      tone: "save",
      category: "subscriptions",
      title: `${subs.length} subscriptions cost ${sek(subsMonthly * 12)} a year`,
      detail: `${subs.map((row) => `${row.merchant} ${sek(row.monthlyCents)}`).join(", ")}. Go through them once: dropping even ${cheapestTwo
        .map((row) => row.merchant)
        .join(" and ")} saves ${sek(cheapestTwo.reduce((sum, row) => sum + row.monthlyCents, 0) * 12)}/year. Rotate streaming services instead of paying for all at once.`,
      yearlyCents: Math.round(subsMonthly * 12 * 0.3),
    });
  }

  // 2. Fast food and takeaway: frequency is the lever.
  const fast = input.categoryCounts.fastfood;
  if (fast && fast.months > 0 && fast.cents / fast.months > 50_000) {
    const perMonth = Math.round(fast.cents / fast.months);
    const visits = Math.round(fast.count / fast.months);
    const perVisit = Math.round(fast.cents / Math.max(fast.count, 1));
    tips.push({
      id: "fastfood",
      tone: "save",
      category: "fastfood",
      title: `Fast food is about ${sek(perMonth)} a month`,
      detail: `Around ${visits} orders a month at ${sek(perVisit)} each. Swapping a third of them for food from home saves roughly ${sek(Math.round(perMonth / 3) * 12)} a year. Delivery apps usually add 30–40% over walking in.`,
      yearlyCents: Math.round((perMonth / 3) * 12),
    });
  }

  // 3. Restaurants/cafés.
  const eat = input.categoryCounts.restaurants;
  if (eat && eat.months > 0 && eat.cents / eat.months > 80_000) {
    const perMonth = Math.round(eat.cents / eat.months);
    tips.push({
      id: "restaurants",
      tone: "save",
      category: "restaurants",
      title: `Eating out averages ${sek(perMonth)} a month`,
      detail: `Set a budget about 20% under that (${sek(Math.round((perMonth * 0.8) / 10_000) * 10_000)}) and let the progress bar do the work.`,
      yearlyCents: Math.round(perMonth * 0.2 * 12),
    });
  }

  // 4. Small purchases add up.
  if (input.smallPurchases.months > 0) {
    const perMonth = Math.round(input.smallPurchases.cents / input.smallPurchases.months);
    const count = Math.round(input.smallPurchases.count / input.smallPurchases.months);
    if (count >= 20 && perMonth > 100_000) {
      tips.push({
        id: "small",
        tone: "watch",
        title: `${count} small purchases a month add up to ${sek(perMonth)}`,
        detail: `Card taps under 100 kr: snacks, coffee, Pressbyrån. Each one feels like nothing; a 25% cut is ${sek(Math.round(perMonth * 0.25 * 12))} a year.`,
        yearlyCents: Math.round(perMonth * 0.25 * 12),
      });
    }
  }

  // 5. The category that grew the most versus the usual.
  const grown = input.categories
    .filter((row) => row.avgCents && row.avgCents > 30_000 && row.spentCents > row.avgCents * 1.25 && CATEGORY_BY_ID.get(row.id) && !CATEGORY_BY_ID.get(row.id)!.neutral)
    .sort((a, b) => b.spentCents - b.avgCents! - (a.spentCents - a.avgCents!))[0];
  if (grown && input.month.isCurrent) {
    tips.push({
      id: `grown-${grown.id}`,
      tone: "watch",
      category: grown.id,
      title: `More than usual on ${label(grown.id)} this month`,
      detail: `${sek(grown.spentCents)} so far against a normal ${sek(grown.avgCents!)} for a whole month.${grown.budgetCents ? "" : " A budget here would flag it earlier next time."}`,
      yearlyCents: null,
    });
  }

  // 6. Pay yourself first.
  if (monthlyIncome > 0) {
    const rate = input.month.savingsRate;
    const target = Math.round((monthlyIncome * 0.1) / 10_000) * 10_000;
    if ((rate == null || rate < 0.1) && target > 0) {
      tips.push({
        id: "autosave",
        tone: "grow",
        title: "Save automatically on payday",
        detail: `A standing transfer of ${sek(target)} (10% of a normal month's income) the day money lands means you never see it. In a global index fund at ~7%/year that becomes about ${sek(Math.round(target * 12 * 14.4))} in 10 years.`,
        yearlyCents: target * 12,
      });
    }
  }

  // 7. Cash sitting idle on a transaction account.
  if (monthlySpend > 0 && input.bankCents > monthlySpend * 3) {
    const buffer = monthlySpend * 3;
    const idle = input.bankCents - buffer;
    if (idle > 1_000_000) {
      tips.push({
        id: "idle-cash",
        tone: "grow",
        title: `${sek(idle)} is more than a safety buffer`,
        detail: `Three months of spending (${sek(buffer)}) is a solid buffer. The rest earns ~0% on a transaction account; a high-interest savings account (~2.5%) pays about ${sek(Math.round(idle * 0.025))} a year, and an ISK in index funds has historically done far better over the long run.`,
        yearlyCents: Math.round(idle * 0.025),
      });
    }
  } else if (monthlySpend > 0 && input.bankCents < monthlySpend) {
    tips.push({
      id: "buffer",
      tone: "watch",
      title: "Build a buffer first",
      detail: `The accounts hold less than one normal month of spending (${sek(monthlySpend)}). Aim for three months before investing, so a surprise bill never becomes a loan.`,
      yearlyCents: null,
    });
  }

  // 8. Fees and interest are pure waste.
  const fees = input.categoryCounts.fees;
  if (fees && fees.months > 0) {
    const perMonth = Math.round(fees.cents / fees.months);
    if (perMonth > 20_000) {
      tips.push({
        id: "fees",
        tone: "save",
        category: "fees",
        title: `Fees, insurance and interest: ${sek(perMonth)} a month`,
        detail: "Compare insurance once a year (Compricer, Insplanet) and move anything with interest or late fees to autogiro so it never costs more than it should.",
        yearlyCents: Math.round(perMonth * 12 * 0.15),
      });
    }
  }

  // 9. Weekends.
  const week = input.weekday.reduce((sum, value) => sum + value, 0);
  if (week > 0) {
    const weekend = (input.weekday[4] ?? 0) + (input.weekday[5] ?? 0);
    if (weekend / week > 0.45) {
      tips.push({
        id: "weekend",
        tone: "watch",
        title: `${Math.round((weekend / week) * 100)}% of spending happens Friday–Saturday`,
        detail: "Decide a weekend amount on Friday morning and Swish it to a separate card or account. When it's gone, it's gone.",
        yearlyCents: null,
      });
    }
  }

  // 10. Car.
  const car = input.categoryCounts.car;
  if (car && car.months > 0 && car.cents / car.months > 150_000) {
    const perMonth = Math.round(car.cents / car.months);
    tips.push({
      id: "car",
      tone: "watch",
      category: "car",
      title: `The car costs about ${sek(perMonth)} a month`,
      detail: "Charge or fuel at the cheapest times, check parking apps against monthly permits, and re-quote the car insurance at renewal. Worth a budget of its own.",
      yearlyCents: Math.round(perMonth * 12 * 0.1),
    });
  }

  return tips.sort((a, b) => (b.yearlyCents ?? 0) - (a.yearlyCents ?? 0));
}

/** Budgets a little under what the owner normally spends, rounded to 100 kr. */
export function suggestBudgets(
  categories: Array<{ id: string; avgCents: number | null; budgetCents: number | null }>,
) {
  return categories
    .filter((row) => row.budgetCents == null && row.avgCents != null && row.avgCents >= 20_000)
    .filter((row) => {
      const category = CATEGORY_BY_ID.get(row.id);
      return category && !category.income && !category.neutral;
    })
    .map((row) => ({
      category: row.id,
      avgCents: row.avgCents!,
      suggestedCents: Math.max(10_000, Math.round((row.avgCents! * 0.9) / 10_000) * 10_000),
    }))
    .sort((a, b) => b.avgCents - a.avgCents)
    .slice(0, 8);
}
