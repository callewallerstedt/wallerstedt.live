import { z } from "zod";
import { AccountingError } from "./errors";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();
const accountNumber = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return /^\d{4}$/.test(trimmed) ? Number(trimmed) : value;
}, z.number().int().min(1000).max(9999));
const nullableAccount = accountNumber.optional().nullable();
const nullableLegacyId = z
  .number()
  .int()
  .positive()
  .max(2_147_483_647)
  .optional()
  .nullable();
const moneyValue = z
  .union([z.string(), z.number().finite()])
  .transform((value) => String(value).trim().replace(",", "."))
  .refine(
    (value) => /^-?\d{1,16}(?:\.\d{1,2})?$/.test(value),
    "Money must have at most two decimal places.",
  );
const optionalMoney = moneyValue.optional().nullable();

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Date must be a real calendar date.")
  .optional()
  .nullable();

export const accountCreateSchema = z.object({
  legacyId: nullableLegacyId,
  account: accountNumber,
  name: z.string().trim().min(1).max(200),
  category: optionalText(100),
});

export const accountPatchSchema = z.object({
  version: z.number().int().positive(),
  account: accountNumber.optional(),
  name: z.string().trim().min(1).max(200).optional(),
  category: optionalText(100),
});

const entryFields = {
  legacyId: nullableLegacyId,
  date: dateOnly,
  description: optionalText(500),
  debitName: optionalText(200),
  debitAccount: nullableAccount,
  creditName: optionalText(200),
  creditAccount: nullableAccount,
  amountExVat: optionalMoney,
  beloppExMoms: optionalMoney,
  vatAmount: optionalMoney,
  moms: optionalMoney,
  vatAccount: nullableAccount,
  momsAccount: nullableAccount,
  amount: moneyValue.optional(),
  type: optionalText(100),
  source: optionalText(300),
  notes: optionalText(10_000),
  status: optionalText(100),
} as const;

export const entryCreateSchema = z
  .object(entryFields)
  .refine((value) => value.amount !== undefined && value.amount !== null, {
    message: "Amount is required.",
    path: ["amount"],
  });

export const entryPatchSchema = z.object({
  ...entryFields,
  version: z.number().int().positive(),
});

export const versionSchema = z.object({
  version: z.number().int().positive(),
});

export type AccountInput = z.output<typeof accountCreateSchema>;

type EntryFieldInput = {
  legacyId?: number | null;
  date?: string | null;
  description?: string | null;
  debitName?: string | null;
  debitAccount?: number | null;
  creditName?: string | null;
  creditAccount?: number | null;
  amountExVat?: string | null;
  beloppExMoms?: string | null;
  vatAmount?: string | null;
  moms?: string | null;
  vatAccount?: number | null;
  momsAccount?: number | null;
  amount?: string;
  type?: string | null;
  source?: string | null;
  notes?: string | null;
  status?: string | null;
};

export type NormalizedEntryInput = {
  legacyId?: number | null;
  date?: string | null;
  description?: string | null;
  debitName?: string | null;
  debitAccount?: number | null;
  creditName?: string | null;
  creditAccount?: number | null;
  amountExVat?: string | null;
  vatAmount?: string | null;
  vatAccount?: number | null;
  amount?: string;
  type?: string | null;
  source?: string | null;
  notes?: string | null;
  status?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export function canonicalEntryType(value: string | null | undefined) {
  if (value === null || value === undefined) return value;
  const key = value.trim().toLocaleLowerCase("sv");
  if (key === "expense") return "Utbetalning";
  if (key === "income") return "Inbetalning";
  if (key === "transfer") return "Överföring";
  if (key === "other") return "Övrigt";
  return value.trim();
}

export function normalizeEntryInput(
  input: EntryFieldInput,
): NormalizedEntryInput {
  return {
    legacyId: input.legacyId,
    date: input.date,
    description: input.description,
    debitName: input.debitName,
    debitAccount: input.debitAccount,
    creditName: input.creditName,
    creditAccount: input.creditAccount,
    amountExVat: input.amountExVat ?? input.beloppExMoms,
    vatAmount: input.vatAmount ?? input.moms,
    vatAccount: input.vatAccount ?? input.momsAccount,
    amount: input.amount,
    type: canonicalEntryType(input.type),
    source: input.source,
    notes: input.notes,
    status: input.status,
  };
}

export function parseWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AccountingError(
      "Invalid accounting data.",
      400,
      "validation_error",
      {
        fields: result.error.flatten().fieldErrors,
        form: result.error.flatten().formErrors,
      },
    );
  }
  return result.data as z.output<TSchema>;
}

export function parseOptionalDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parseUuid(value: unknown, code = "invalid_id") {
  const result = z.string().uuid().safeParse(value);
  if (!result.success) {
    throw new AccountingError("Invalid identifier.", 400, code);
  }
  return result.data;
}

export const aiEntrySchema = z.object({
  date: z.string().nullable().describe("YYYY-MM-DD, or null when unknown"),
  description: z.string().max(500),
  debitName: z.string().max(200).nullable(),
  debitAccount: z.number().int().min(1000).max(9999).nullable(),
  creditName: z.string().max(200).nullable(),
  creditAccount: z.number().int().min(1000).max(9999).nullable(),
  amountExVat: z.number().nullable(),
  vatAmount: z.number().nullable(),
  vatAccount: z.number().int().min(1000).max(9999).nullable(),
  amount: z.number().nullable(),
  type: z.string().max(100),
  source: z.string().max(300).nullable(),
  notes: z.string().max(2_000).nullable(),
  status: z.string().max(100),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(2_000),
  sourceDocumentIndexes: z.array(z.number().int().min(0)).max(10),
});

export const aiExtractionSchema = z.object({
  entries: z.array(aiEntrySchema).min(1).max(50),
  summary: z.string().max(2_000),
  warnings: z.array(z.string().max(500)).max(20),
});

export const aiRevisionRequestSchema = z.object({
  instruction: z.string().trim().min(2).max(4_000),
  entries: z.array(z.object({}).passthrough()).min(1).max(50),
});

export const draftApprovalSchema = z.object({
  entries: z.array(z.object(entryFields)).min(1).max(50),
});
