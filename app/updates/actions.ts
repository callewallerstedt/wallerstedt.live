"use server";

import { addSubscriber } from "@/lib/subscribers";

export interface SubscribeState {
  status: "idle" | "success" | "error";
  message: string;
}

export async function subscribeAction(_previousState: SubscribeState, formData: FormData): Promise<SubscribeState> {
  const email = String(formData.get("email") ?? "");
  const result = await addSubscriber(email);

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  return {
    status: "success",
    message: result.message,
  };
}
