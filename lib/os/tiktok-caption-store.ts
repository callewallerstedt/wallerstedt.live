import { getAccountingDb } from "@/lib/accounting/db";
import { AccountingError } from "@/lib/accounting/errors";

import { CAPTION_PROMPT_ID, CAPTION_PROMPT_MAX } from "./tiktok-caption";

function isMissingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "42P01";
}

function promptUnavailable() {
  return new AccountingError(
    "Caption tips need a database migration.",
    503,
    "caption_prompt_unavailable",
  );
}

export async function getCaptionPrompt(): Promise<string> {
  try {
    const row = await getAccountingDb().companyTikTokCaptionPrompt.findUnique({
      where: { id: CAPTION_PROMPT_ID },
      select: { prompt: true },
    });
    return row?.prompt ?? "";
  } catch (error) {
    if (isMissingTable(error)) return "";
    throw error;
  }
}

export async function saveCaptionPrompt(prompt: string): Promise<string> {
  const value = prompt.slice(0, CAPTION_PROMPT_MAX);
  try {
    const row = await getAccountingDb().companyTikTokCaptionPrompt.upsert({
      where: { id: CAPTION_PROMPT_ID },
      create: { id: CAPTION_PROMPT_ID, prompt: value },
      update: { prompt: value },
    });
    return row.prompt;
  } catch (error) {
    if (isMissingTable(error)) throw promptUnavailable();
    throw error;
  }
}
