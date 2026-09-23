import { z } from "zod";

export const assetSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  kind: z.enum(["investment", "savings", "crypto", "property", "vehicle", "debt", "other"]).optional(),
  /** Whole kronor. Debts are stored negative whatever sign is sent. */
  valueSek: z.number().min(-1_000_000_000).max(1_000_000_000).optional(),
  note: z.string().max(500).optional(),
});

export function assetInput(input: z.infer<typeof assetSchema>) {
  return {
    name: input.name,
    kind: input.kind,
    note: input.note,
    valueCents: input.valueSek === undefined ? undefined : Math.round(input.valueSek * 100),
  };
}
