import { AccountingError, redactedErrorDiagnostic } from "@/lib/accounting/errors";

/** OpenAI API id for GPT-Luna in the GPT-5.6 family. */
export const TIKTOK_CAPTION_MODEL = "gpt-5.6-luna";

export const CAPTION_PROMPT_MAX = 4000;
export const CAPTION_PROMPT_ID = "singleton";
export const CAPTION_PROMPT_STORAGE_KEY = "wallerstedt.os.tiktok-caption-prompt";
export const DEFAULT_CAPTION_TAGS = ["#piano", "#coversong", "#tiktokpiano"] as const;
export const MIN_CAPTION_TAGS = 3;
export const MAX_CAPTION_TAGS = 4;

export type CaptionIdea = {
  title: string;
  song: string;
  notes: string;
};

export function captionSystemPrompt() {
  return `You write TikTok captions for piano-cover clips.

Return ONLY the caption as a single line. No quotes, no preamble, no explanation.

Required shape:
{song name} - {artist} #tag1 #tag2 #tag3
or, when the artist is unknown:
{song name} #tag1 #tag2 #tag3

Rules:
- Use 3 or 4 hashtags, never 2, never 5+.
- Prefer the song title and original artist from the video-idea fields (song, title, notes).
- If the artist is not given, infer only when it is obvious (a well-known piece, or named in the notes). Otherwise omit the artist — never invent a guess like "Unknown Artist" or a random name.
- Do not put a trailing dash when the artist is omitted.
- Hashtags should fit a piano-cover TikTok (for example #piano #coversong #tiktokpiano) unless the owner's custom tips say otherwise.
- Do not add extra commentary, URLs, or emoji unless the custom tips explicitly ask for emoji.`;
}

export function captionUserPrompt(
  idea: CaptionIdea,
  customPrompt: string,
) {
  const custom = customPrompt.trim().slice(0, CAPTION_PROMPT_MAX);
  return [
    "VIDEO IDEA",
    `Title: ${idea.title.trim() || "(none)"}`,
    `Song: ${idea.song.trim() || "(none)"}`,
    `Notes: ${idea.notes.trim() || "(none)"}`,
    "",
    custom
      ? `OWNER CAPTION TIPS (follow when they do not break the required shape):\n${custom}`
      : "OWNER CAPTION TIPS: (none)",
  ].join("\n");
}

function padCaptionTags(tags: string[]) {
  const padded = tags.slice(0, MAX_CAPTION_TAGS);
  const seen = new Set(padded.map((tag) => tag.toLowerCase()));
  for (const fallback of DEFAULT_CAPTION_TAGS) {
    if (padded.length >= MIN_CAPTION_TAGS) break;
    if (seen.has(fallback.toLowerCase())) continue;
    padded.push(fallback);
    seen.add(fallback.toLowerCase());
  }
  return padded.slice(0, MAX_CAPTION_TAGS);
}

/**
 * Collapse model output into `{song} - {artist} #tag #tag #tag`.
 * Drops wrapping quotes, extra lines, and a 5th+ hashtag.
 * Pads to at least 3 piano-cover hashtags when the model returns too few.
 */
export function normalizeCaption(raw: string) {
  let text = raw.trim();
  text = text.replace(/^```(?:\w+)?\s*/u, "").replace(/\s*```$/u, "").trim();
  text =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  text = text.replace(/^["'«»“”‘’]+|["'«»“”‘’]+$/gu, "").trim();
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "";

  const hashIndex = text.search(/#/u);
  let head = (hashIndex >= 0 ? text.slice(0, hashIndex) : text).trim();
  const tagsPart = hashIndex >= 0 ? text.slice(hashIndex) : "";
  head = head.replace(/\s*[-–—]\s*$/u, "").trim();

  const tags = padCaptionTags(
    [...tagsPart.matchAll(/#([^\s#]+)/gu)]
      .map((match) => match[1].replace(/[^\p{L}\p{N}_]+/gu, ""))
      .filter(Boolean)
      .map((tag) => `#${tag}`),
  );

  if (!head && !tags.length) return "";
  return [head, tags.join(" ")].filter(Boolean).join(" ");
}

/** Offline stand-in for the mock dash — same shape, no model. */
export function localCaptionPreview(idea: CaptionIdea) {
  const song = idea.song.trim() || idea.title.trim() || "Piano cover";
  return normalizeCaption(`${song} #piano #coversong #tiktokpiano`);
}

export type CaptionGenerateFn = (input: {
  system: string;
  prompt: string;
  model: string;
}) => Promise<string>;

export async function defaultCaptionGenerate(input: {
  system: string;
  prompt: string;
  model: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AccountingError(
      "OpenAI is not configured. Add OPENAI_API_KEY to generate captions.",
      503,
      "caption_openai_not_configured",
    );
  }

  const { generateText } = await import("ai");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const openai = createOpenAI({ apiKey });

  try {
    const result = await generateText({
      model: openai(input.model),
      system: input.system,
      prompt: input.prompt,
    });
    return result.text;
  } catch (error) {
    console.error("TikTok caption generation failed", redactedErrorDiagnostic(error));
    throw new AccountingError(
      "Could not generate a caption. Try again in a moment.",
      502,
      "caption_generation_failed",
    );
  }
}

export async function generateTikTokCaption(
  idea: CaptionIdea,
  customPrompt: string,
  generate: CaptionGenerateFn = defaultCaptionGenerate,
  model = TIKTOK_CAPTION_MODEL,
) {
  const raw = await generate({
    system: captionSystemPrompt(),
    prompt: captionUserPrompt(idea, customPrompt),
    model,
  });
  const caption = normalizeCaption(raw);
  if (!caption) {
    throw new AccountingError(
      "The model returned an empty caption. Try again.",
      502,
      "caption_generation_failed",
    );
  }
  return { caption, model };
}
