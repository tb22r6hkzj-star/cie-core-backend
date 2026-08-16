import test from "node:test";
import assert from "node:assert/strict";
import { getColorName } from "../src/engines/labelMapper/index.js";

test("muted green with stable directional evidence does not collapse into gray", () => {
  assert.equal(getColorName("#4E604F"), "Muted Forest Green");
});

test("near-neutral gray remains gray when green direction is too weak", () => {
  const name = getColorName("#5D625F");
  assert.match(name, /Gray|Graphite|Neutral|Charcoal|Slate/i);
  assert.doesNotMatch(name, /Green|Sage|Olive/i);
});

test("true neutral gray remains neutral", () => {
  const name = getColorName("#595959");
  assert.match(name, /Gray|Graphite|Neutral|Charcoal|Slate/i);
});

test("existing vivid or clear forest green identity is preserved", () => {
  assert.match(getColorName("#284B35"), /Forest Green|Green|Sage/i);
});
