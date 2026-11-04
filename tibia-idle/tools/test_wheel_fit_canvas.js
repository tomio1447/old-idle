"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const test = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../game/js/wheel-ui.js"), "utf8");
const start = source.indexOf("function wheelFitCanvas("), end = source.indexOf("\nfunction bindWheel(", start);
assert.ok(start >= 0 && end > start);

function fit(width, height, embedded, sideBySide = true) {
  const canvas = { style: {} };
  const right = { offsetTop: sideBySide ? 0 : 400, offsetWidth: 250 };
  const host = { clientWidth: width, clientHeight: height, querySelector: () => right };
  const wrap = { style: {}, parentElement: host, offsetTop: 0, closest: () => embedded,
    querySelector: () => canvas };
  const root = { querySelector: () => wrap, closest: () => embedded };
  const context = { window: { innerHeight: height + 300 }, getComputedStyle: () => ({
    paddingLeft: "6px", paddingRight: "6px", paddingTop: "6px", paddingBottom: "6px", columnGap: "10px",
  }) };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  context.wheelFitCanvas(root);
  return { width: parseFloat(wrap.style.width), height: parseFloat(wrap.style.height),
    scale: Number(canvas.style.transform.match(/scale\(([^)]+)\)/)[1]) };
}

test("embedded wheel fits the short screenshot-like modal without vertical clipping", () => {
  const result = fit(790, 290, true);
  assert.ok(result.scale * 522 <= 278);
  assert.equal(result.width, result.height);
  assert.equal(result.height, 278);
});

test("embedded wheel also respects available width beside the selection panel", () => {
  const result = fit(460, 700, true);
  assert.ok(result.scale * 522 <= 188);
  assert.equal(result.width, result.height);
});

test("small available heights can shrink below the old 45 percent minimum", () => {
  const result = fit(790, 150, true);
  assert.ok(result.scale < 0.45);
  assert.ok(result.height <= 138);
  assert.equal(result.width, result.height);
});

test("stacked selection panel does not reduce the wheel's available width", () => {
  const result = fit(400, 600, true, false);
  assert.equal(result.width, 388);
  assert.equal(result.width, result.height);
});

test("standalone wheel remains fully visible in short windows", () => {
  const result = fit(790, 160, false);
  assert.ok(result.scale * 522 <= 160);
  assert.equal(result.width, result.height);
});

test("missing root is harmless", () => {
  const context = {};
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  assert.doesNotThrow(() => context.wheelFitCanvas(null));
});
