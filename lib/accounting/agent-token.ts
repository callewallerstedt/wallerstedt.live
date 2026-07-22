import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AccountingError } from "./errors";

export const agentProposedEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  description: z.string().trim().min(1).max(500),
  debitName: z.string().trim().max(200).nullable(),
  debitAccount: z.number().int().min(1000).max(9999).nullable(),
  creditName: z.string().trim().max(200).nullable(),
  creditAccount: z.number().int().min(1000).max(9999).nullable(),
  amountExVat: z.number().finite().nullable(),
  vatAmount: z.number().finite().nullable(),
  vatAccount: z.number().int().min(1000).max(9999).nullable(),
  amount: z.number().finite(),
  type: z.string().trim().min(1).max(100),
  source: z.string().trim().max(300).nullable(),
  notes: z.string().trim().max(10_000).nullable(),
  status: z.string().trim().min(1).max(100),
  receiptRequired: z.boolean(),
});

const agentProposalEditSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  proposed: agentProposedEntrySchema,
  explanation: z.string().trim().min(1).max(1_000),
});

const agentProposalDeleteSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  explanation: z.string().trim().min(1).max(1_000),
});

export const agentProposalPayloadSchema = z
  .object({
    v: z.literal(1),
    exp: z.number().int().positive(),
    edits: z.array(agentProposalEditSchema).max(50),
    deletes: z.array(agentProposalDeleteSchema).max(50),
  })
  .superRefine((value, context) => {
    const editIds = value.edits.map((item) => item.id);
    const deleteIds = value.deletes.map((item) => item.id);
    if (new Set(editIds).size !== editIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate edit." });
    }
    if (new Set(deleteIds).size !== deleteIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate deletion." });
    }
    if (deleteIds.some((id) => editIds.includes(id))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An entry cannot be edited and deleted in the same proposal.",
      });
    }
  });

export type AgentProposalPayload = z.output<typeof agentProposalPayloadSchema>;

function signingSecret() {
  const secret = process.env.ACCOUNTING_AGENT_SIGNING_SECRET?.trim()
    || process.env.ACCOUNTING_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new AccountingError(
      "The accounting agent approval system is not configured.",
      503,
      "agent_signing_not_configured",
    );
  }
  return secret;
}

function signature(value: string) {
  return createHmac("sha256", signingSecret()).update(value).digest();
}

export function signAgentProposal(
  value: Omit<AgentProposalPayload, "v" | "exp">,
  ttlSeconds = 30 * 60,
) {
  const payload = agentProposalPayloadSchema.parse({
    ...value,
    v: 1,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    token: `${encoded}.${signature(encoded).toString("base64url")}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    payload,
  };
}

export function verifyAgentProposal(token: string) {
  const [encoded, encodedSignature, ...rest] = token.split(".");
  if (!encoded || !encodedSignature || rest.length) {
    throw new AccountingError(
      "The AI approval has expired or is invalid. Ask AI to prepare it again.",
      400,
      "invalid_agent_proposal",
    );
  }
  let providedSignature: Buffer;
  let parsed: unknown;
  try {
    providedSignature = Buffer.from(encodedSignature, "base64url");
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new AccountingError(
      "The AI approval has expired or is invalid. Ask AI to prepare it again.",
      400,
      "invalid_agent_proposal",
    );
  }
  const expectedSignature = signature(encoded);
  if (
    providedSignature.byteLength !== expectedSignature.byteLength
    || !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    throw new AccountingError(
      "The AI approval has expired or is invalid. Ask AI to prepare it again.",
      400,
      "invalid_agent_proposal",
    );
  }
  const result = agentProposalPayloadSchema.safeParse(parsed);
  if (!result.success || result.data.exp < Math.floor(Date.now() / 1000)) {
    throw new AccountingError(
      "The AI approval has expired. Ask AI to prepare it again.",
      409,
      "expired_agent_proposal",
    );
  }
  return result.data;
}
