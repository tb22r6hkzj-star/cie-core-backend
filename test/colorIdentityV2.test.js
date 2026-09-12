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

test("light neutral pixels stay appearance-based without inventing metallic material", () => {
  assert.equal(getColorName("#C2BEC0"), "Light Gray");
  assert.doesNotMatch(getColorName("#C2BEC0"), /Chrome|Silver|Metal/i);
});

test("saturated pink measurements do not collapse into dusty or muted labels", () => {
  assert.equal(getColorName("#DB5A97"), "Vivid Pink");
  assert.equal(getColorName("#E1609E"), "Vivid Pink");
  assert.equal(getColorName("#B63768"), "Deep Rose");
});

test("existing vivid or clear forest green identity is preserved", () => {
  assert.match(getColorName("#284B35"), /Forest Green|Green|Sage/i);
});

test("warm earth brown measurements are never mislabeled as Brick Red", () => {
  assert.equal(getColorName("#763D25"), "Rich Brown");
  assert.equal(getColorName("#935234"), "Rich Brown");
});
