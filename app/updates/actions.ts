"use server";

import { addSubscriber } from "@/lib/subscribers";

export interface SubscribeState {
  status: "idle" | "success" | "error";
  message: string;
}

export async function subscribeAction(_previousState: SubscribeState, formData: FormData): Promise<SubscribeState> {
  // Hidden field real people never fill in.
  if (String(formData.get("website") ?? "")) {
    return { status: "success", message: "You're in. Thanks!" };
  }

  const email = String(formData.get("email") ?? "");
  const source = String(formData.get("source") ?? "");
  const result = await addSubscriber(email, source);

  return {
    status: result.ok ? "success" : "error",
    message: result.message,
  };
}
