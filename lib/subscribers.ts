import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const subscribersPath = path.join(process.cwd(), "data", "subscribers.json");

export interface Subscriber {
  email: string;
  createdAt: string;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export async function getSubscribers() {
  try {
    const raw = await readFile(subscribersPath, "utf8");
    return JSON.parse(raw) as Subscriber[];
  } catch {
    return [];
  }
}

export async function addSubscriber(emailInput: string) {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email)) {
    return { ok: false as const, message: "Enter a valid email address." };
  }

  const subscribers = await getSubscribers();
  if (subscribers.some((subscriber) => subscriber.email === email)) {
    return { ok: true as const, message: "You're already on the list." };
  }

  subscribers.push({
    email,
    createdAt: new Date().toISOString(),
  });

  await mkdir(path.dirname(subscribersPath), { recursive: true });
  await writeFile(subscribersPath, `${JSON.stringify(subscribers, null, 2)}\n`, "utf8");

  return { ok: true as const, message: "You're on the list." };
}
