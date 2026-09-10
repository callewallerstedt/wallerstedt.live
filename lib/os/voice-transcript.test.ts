import assert from "node:assert/strict";
import test from "node:test";
import { elonReadout, speechTranscript } from "./voice-transcript";

test("completed speech retains short replies in every language and numeric answers", () => {
  for (const junk of ["", " \n ", "..."]) assert.equal(speechTranscript(junk), "");
  for (const speech of ["你好", "はい", "نعم", "อ่า", "42", "Ja", "Nej", "No", "OK", "Åh", "Hej Elon!", "Send this to Elon."]) assert.equal(speechTranscript(` ${speech} `), speech);
});

test("Elon readout quotes text and announces images without captions", () => {
  assert.ok(elonReadout('Done. "Ship it"', 1).includes(JSON.stringify('Done. "Ship it"')));
  assert.match(elonReadout("", 1), /Elon sent an image/);
  assert.match(elonReadout("  ", 2), /Elon sent images/);
  assert.match(elonReadout("", 1), /Do not invent captions/);
});
