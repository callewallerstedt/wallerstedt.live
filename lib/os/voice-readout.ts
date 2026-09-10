import { elonReadout } from "./voice-transcript";

export function nextVoiceAction(state: {
  open: boolean; replies: number; responding: boolean; speaking: boolean;
  pendingInput: number; toolContinuation: boolean;
}): "elon" | "tool" | "wait" {
  if (!state.open) return "wait";
  if (state.replies) return "elon";
  return state.toolContinuation && !state.responding && !state.speaking && !state.pendingInput ? "tool" : "wait";
}

export function elonResponse(replies: { text: string; images: string[] }[]) {
  return {
    type: "response.create",
    response: {
      instructions: replies.map((reply) => elonReadout(reply.text, reply.images.length)).join("\n\n"),
      output_modalities: ["audio"],
      tools: [],
      tool_choice: "none",
    },
  };
}
