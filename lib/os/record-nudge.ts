import { getAccountingDb } from "@/lib/accounting/db";
import { COMPANY } from "@/lib/os/company";
import { berlinHour, berlinYmd } from "@/lib/os/format";
import { osPath } from "@/lib/os/paths";
import {
  getAccountingAccessKey,
  getSiteOrigin,
  sendWebPush,
  type PushSendResult,
} from "@/lib/push";

export const RECORD_NUDGE_HOUR = 20;
export const RECORD_NUDGE_KIND = "record";
export const RECORD_NUDGE_TAG = "record-nudge";
export const RECORD_NUDGE_ID = "singleton";

export const RECORD_NUDGE_LINES = [
  { title: "Go record", body: "You want that car or no?" },
  { title: "Piano time", body: "Your piano won't play itself." },
  { title: "Go record", body: "The algorithm is waiting. The piano is not." },
  { title: "Piano time", body: "Sit down. Play the thing. Then you can scroll." },
  { title: "Go record", body: "Future you wants a video. Present you wants snacks. Be future you." },
  { title: "20:00", body: "This is the part where you stop negotiating with yourself." },
  { title: "Go record", body: "TikTok will not film your living room for you." },
  { title: "Piano time", body: "One take. Even a messy one. Especially a messy one." },
  { title: "Go record", body: "The keys miss you. That is scientifically unverified but still true." },
  { title: "Piano time", body: "If it is not on camera, it did not happen." },
  { title: "Go record", body: "You said you would. The phone heard you." },
  { title: "20:00", body: "Open the lid. Hit record. Argue later." },
  { title: "Go record", body: "That car does not buy itself either." },
  { title: "Piano time", body: "Fifteen minutes. Then you can be a civilian again." },
  { title: "Go record", body: "Nobody clapped for the day you almost recorded." },
] as const;

export type RecordNudgeLine = (typeof RECORD_NUDGE_LINES)[number];

export type RecordNudgeNotification = {
  kind: typeof RECORD_NUDGE_KIND;
  tag: typeof RECORD_NUDGE_TAG;
  title: string;
  body: string;
  url: string;
};

function isMissingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "42P01";
}

export function pickRecordNudgeLine(ymd: string): RecordNudgeLine {
  const stamp = ymd.replaceAll("-", "");
  const index = Number.parseInt(stamp, 10);
  if (!Number.isFinite(index)) {
    return RECORD_NUDGE_LINES[0];
  }
  return RECORD_NUDGE_LINES[index % RECORD_NUDGE_LINES.length];
}

export function shouldSendRecordNudge(now = new Date()) {
  return berlinHour(now) === RECORD_NUDGE_HOUR;
}

export function buildRecordNudgeNotification(
  accessKey: string,
  now = new Date(),
): RecordNudgeNotification {
  const ymd = berlinYmd(now) ?? "1970-01-01";
  const line = pickRecordNudgeLine(ymd);
  const origin = getSiteOrigin().replace(/\/+$/, "");
  return {
    kind: RECORD_NUDGE_KIND,
    tag: RECORD_NUDGE_TAG,
    title: line.title,
    body: line.body,
    url: `${origin}${osPath(accessKey, "tiktok")}`,
  };
}

export async function alreadySentRecordNudge(ymd: string) {
  const db = getAccountingDb();
  try {
    const row = await db.companyRecordNudge.findUnique({
      where: { id: RECORD_NUDGE_ID },
      select: { lastSentYmd: true },
    });
    return row?.lastSentYmd === ymd;
  } catch (error) {
    if (isMissingTable(error)) return false;
    throw error;
  }
}

export async function markRecordNudgeSent(ymd: string) {
  const db = getAccountingDb();
  try {
    await db.companyRecordNudge.upsert({
      where: { id: RECORD_NUDGE_ID },
      create: { id: RECORD_NUDGE_ID, lastSentYmd: ymd },
      update: { lastSentYmd: ymd },
    });
  } catch (error) {
    if (isMissingTable(error)) return;
    throw error;
  }
}

export async function dispatchRecordNudge(
  now = new Date(),
): Promise<
  | { ok: true; skipped: true; reason: string; ymd?: string }
  | { ok: true; skipped?: false; ymd: string; title: string; company: string; result: PushSendResult }
> {
  if (!shouldSendRecordNudge(now)) {
    return { ok: true, skipped: true, reason: "wrong_hour" };
  }

  const ymd = berlinYmd(now);
  if (!ymd) {
    return { ok: true, skipped: true, reason: "invalid_date" };
  }

  if (await alreadySentRecordNudge(ymd)) {
    return { ok: true, skipped: true, reason: "already_sent", ymd };
  }

  const accessKey = getAccountingAccessKey();
  if (!accessKey) {
    return { ok: true, skipped: true, reason: "no_access_key" };
  }

  const notification = buildRecordNudgeNotification(accessKey, now);
  const result = await sendWebPush(notification);
  if (result.sent === 0) {
    return {
      ok: true,
      skipped: true,
      reason: result.failed === 0 ? "no_subscribers" : "send_failed",
      ymd,
    };
  }

  await markRecordNudgeSent(ymd);
  return {
    ok: true,
    ymd,
    title: notification.title,
    company: COMPANY.name,
    result,
  };
}
