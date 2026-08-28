import test from "node:test";
import assert from "node:assert/strict";
import { resolveMaskStrengthV1, resolveOpaqueMaskStrengthV1 } from "../src/intelligence/maskStrengthV1.js";

test("opaque black mask background stays off", () => {
  assert.equal(resolveMaskStrengthV1(0, 0, 0, 255), 0);
});

test("opaque white mask foreground stays on", () => {
  assert.equal(resolveMaskStrengthV1(255, 255, 255, 255), 255);
});

test("transparent alpha masks use alpha membership", () => {
  assert.equal(resolveMaskStrengthV1(255, 255, 255, 0), 0);
  assert.equal(resolveMaskStrengthV1(0, 0, 0, 128), 128);
});

test("opaque masks support both black and white backgrounds", () => {
  assert.equal(resolveOpaqueMaskStrengthV1(0, 0, 0, 255), 255);
  assert.equal(resolveOpaqueMaskStrengthV1(255, 255, 255, 255), 0);
  assert.equal(resolveOpaqueMaskStrengthV1(255, 255, 255, 0), 255);
  assert.equal(resolveOpaqueMaskStrengthV1(0, 0, 0, 0), 0);
});
