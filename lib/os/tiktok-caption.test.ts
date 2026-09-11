import assert from "node:assert/strict";
import test from "node:test";

import { AccountingError } from "../accounting/errors";

import {
  captionUserPrompt,
  generateTikTokCaption,
  localCaptionPreview,
  normalizeCaption,
  captionForStatusChange,
  safePracticingCaption,
  TIKTOK_CAPTION_MODEL,
} from "./tiktok-caption";

test("normalizeCaption keeps song, artist, and 3–4 hashtags", () => {
  assert.equal(
    normalizeCaption(
      '"River Flows In You - Yiruma #piano #coversong #tiktokpiano #relaxing"',
    ),
    "River Flows In You - Yiruma #piano #coversong #tiktokpiano #relaxing",
  );
});

test("normalizeCaption drops extra lines, wrapping fences, and a 5th hashtag", () => {
  assert.equal(
    normalizeCaption(
      "```\nClair de Lune - Debussy #piano #classical #coversong #tiktokpiano #mood\nHope this helps!\n```",
    ),
    "Clair de Lune - Debussy #piano #classical #coversong #tiktokpiano",
  );
});

test("normalizeCaption omits a dangling artist dash", () => {
  assert.equal(
    normalizeCaption("Midnight Hours -  #piano #coversong #tiktokpiano"),
    "Midnight Hours #piano #coversong #tiktokpiano",
  );
});

test("normalizeCaption pads fewer than 3 hashtags with piano-cover defaults", () => {
  assert.equal(
    normalizeCaption("River Flows In You - Yiruma"),
    "River Flows In You - Yiruma #piano #coversong #tiktokpiano",
  );
  assert.equal(
    normalizeCaption("Midnight Hours #piano"),
    "Midnight Hours #piano #coversong #tiktokpiano",
  );
  assert.equal(
    normalizeCaption("Soft Rain #piano #coversong"),
    "Soft Rain #piano #coversong #tiktokpiano",
  );
});

test("caption user prompt includes song fields and custom tips", () => {
  const prompt = captionUserPrompt(
    {
      title: "Night drive piano clip",
      song: "River Flows In You",
      notes: "Soft LED wash. Yiruma.",
    },
    "Keep hashtags lowercase. No emojis.",
  );
  assert.match(prompt, /Song: River Flows In You/);
  assert.match(prompt, /Title: Night drive piano clip/);
  assert.match(prompt, /Yiruma/);
  assert.match(prompt, /OWNER CAPTION TIPS/);
  assert.match(prompt, /Keep hashtags lowercase/);
});

test("localCaptionPreview uses song then title, with piano hashtags", () => {
  assert.equal(
    localCaptionPreview({ title: "Clip", song: "Soft Rain", notes: "" }),
    "Soft Rain #piano #coversong #tiktokpiano",
  );
  assert.equal(
    localCaptionPreview({
      title: "Hands-on keys",
      song: "",
      notes: "room tone",
    }),
    "Hands-on keys #piano #coversong #tiktokpiano",
  );
});

test("generateTikTokCaption normalizes the model line and reports gpt-5.6-luna", async () => {
  const result = await generateTikTokCaption(
    { title: "Night drive", song: "River Flows In You", notes: "Yiruma" },
    "Prefer #tiktokpiano",
    async ({ system, prompt, model }) => {
      assert.equal(model, TIKTOK_CAPTION_MODEL);
      assert.match(system, /\{song name\} - \{artist\}/);
      assert.match(prompt, /Prefer #tiktokpiano/);
      return '  "River Flows In You - Yiruma #piano #coversong #tiktokpiano #relaxing"  ';
    },
  );
  assert.equal(
    result.caption,
    "River Flows In You - Yiruma #piano #coversong #tiktokpiano #relaxing",
  );
  assert.equal(result.model, "gpt-5.6-luna");
});

test("generateTikTokCaption pads a short model caption to 3 hashtags", async () => {
  const result = await generateTikTokCaption(
    { title: "Night drive", song: "Midnight Hours", notes: "" },
    "",
    async () => "Midnight Hours - Wallerstedt #piano",
  );
  assert.equal(
    result.caption,
    "Midnight Hours - Wallerstedt #piano #coversong #tiktokpiano",
  );
});

test("captionForStatusChange runs only when a video idea enters practicing", async () => {
  const generate = async () => "River Flows In You - Yiruma #piano #coversong #tiktokpiano";
  const idea = { title: "Night drive", song: "River Flows In You", notes: "Yiruma" };

  const created = await captionForStatusChange(
    { list: "video", previousStatus: "open", nextStatus: "in_progress", idea, customPrompt: "lowercase" },
    generate,
  );
  assert.equal(created?.caption, "River Flows In You - Yiruma #piano #coversong #tiktokpiano");
  assert.equal(created?.captionError, "");

  assert.equal(
    await captionForStatusChange(
      { list: "video", previousStatus: "in_progress", nextStatus: "in_progress", idea, customPrompt: "" },
      generate,
    ),
    null,
  );
  assert.equal(
    await captionForStatusChange(
      { list: "task", previousStatus: "open", nextStatus: "in_progress", idea, customPrompt: "" },
      generate,
    ),
    null,
  );

  const failed = await captionForStatusChange(
    { list: "video", previousStatus: "open", nextStatus: "in_progress", idea, customPrompt: "" },
    async () => {
      throw new AccountingError("OpenAI is not configured.", 503, "caption_openai_not_configured");
    },
  );
  assert.equal(failed?.caption, "");
  assert.match(failed?.captionError ?? "", /OpenAI is not configured/);
});

test("safePracticingCaption stores a generated line and swallows failures", async () => {
  const ok = await safePracticingCaption(
    { title: "Night drive", song: "River Flows In You", notes: "Yiruma" },
    "",
    async () => "River Flows In You - Yiruma #piano #coversong #tiktokpiano",
  );
  assert.equal(ok.caption, "River Flows In You - Yiruma #piano #coversong #tiktokpiano");
  assert.equal(ok.captionError, "");

  const failed = await safePracticingCaption(
    { title: "x", song: "", notes: "" },
    "",
    async () => {
      throw new AccountingError("Could not generate a caption. Try again in a moment.", 502, "caption_generation_failed");
    },
  );
  assert.equal(failed.caption, "");
  assert.match(failed.captionError, /Could not generate a caption/);
});

test("generateTikTokCaption rejects an empty model reply", async () => {
  await assert.rejects(
    () =>
      generateTikTokCaption(
        { title: "x", song: "", notes: "" },
        "",
        async () => "   ",
      ),
    (error: unknown) => {
      assert.ok(error instanceof AccountingError);
      assert.equal(error.code, "caption_generation_failed");
      return true;
    },
  );
});
