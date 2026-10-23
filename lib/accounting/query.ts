import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { exactCents } from "./money";
import { parseWithSchema } from "./validation";

export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a real calendar date.");

const queryMoney = z.string().regex(/^-?\d{1,16}(?:\.\d{1,2})?$/);
const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");
const integerQuery = (max: number, fallback: number) => z.coerce.number().int().min(1).max(max).default(fallback);

export const entryQuerySchema = z.object({
  page: integerQuery(1_000_000, 1),
  limit: integerQuery(250, 100),
  q: z.string().trim().max(200).optional(),
  type: z.string().trim().max(100).optional(),
  status: z.string().trim().max(100).optional(),
  dateFrom: calendarDate.optional(),
  dateTo: calendarDate.optional(),
  account: z.coerce.number().int().min(1000).max(9999).optional(),
  minAmount: queryMoney.optional(),
  maxAmount: queryMoney.optional(),
  missingReceipts: booleanQuery.optional(),
  updatedSince: z.string().datetime({ offset: true }).optional(),
}).superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "dateTo precedes dateFrom." });
  }
  if (value.minAmount && value.maxAmount && exactCents(value.minAmount) > exactCents(value.maxAmount)) {
    context.addIssue({ code: "custom", path: ["maxAmount"], message: "maxAmount is below minAmount." });
  }
});

export function entryQuery(params: URLSearchParams) {
  const input = parseWithSchema(entryQuerySchema, Object.fromEntries(params));
  const AND: Prisma.AccountingEntryWhereInput[] = [];
  if (input.q) AND.push({ OR: ["description", "source", "notes", "debitName", "creditName"].map((field) => ({
    [field]: { contains: input.q, mode: "insensitive" },
  })) });
  if (input.account) AND.push({ OR: [
    { debitAccount: input.account }, { creditAccount: input.account }, { vatAccount: input.account },
  ] });
  const storedDocument = { deletedAt: null, storageStatus: "stored", blobPathname: { not: null } };
  if (input.missingReceipts === true) AND.push({ receiptRequired: true, documents: { none: storedDocument } });
  if (input.missingReceipts === false) AND.push({ OR: [
    { receiptRequired: false }, { documents: { some: storedDocument } },
  ] });
  const where: Prisma.AccountingEntryWhereInput = {
    deletedAt: null, AND,
    ...(input.type ? { type: input.type } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...((input.dateFrom || input.dateTo) ? { date: {
      ...(input.dateFrom ? { gte: new Date(`${input.dateFrom}T00:00:00Z`) } : {}),
      ...(input.dateTo ? { lte: new Date(`${input.dateTo}T00:00:00Z`) } : {}),
    } } : {}),
    ...((input.minAmount || input.maxAmount) ? { amount: {
      ...(input.minAmount ? { gte: input.minAmount } : {}),
      ...(input.maxAmount ? { lte: input.maxAmount } : {}),
    } } : {}),
    ...(input.updatedSince ? { updatedAt: { gte: new Date(input.updatedSince) } } : {}),
  };
  return { ...input, where };
}

export const reportPeriodSchema = z.object({ dateFrom: calendarDate, dateTo: calendarDate })
  .refine((value) => value.dateFrom <= value.dateTo, { path: ["dateTo"], message: "dateTo precedes dateFrom." });

export function reportPeriod(params: URLSearchParams) {
  return parseWithSchema(reportPeriodSchema, Object.fromEntries(params));
}
