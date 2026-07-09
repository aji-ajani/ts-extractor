import test from "node:test";
import assert from "node:assert/strict";
import { lookup } from "../src/scope";

test("single-param lambda: x is $0", () => {
  const scope = [{ params: ["x"] }];
  assert.equal(lookup("x", scope), "$0");
});

test("unbound identifier returns free symbol", () => {
  const scope = [{ params: ["x"] }];
  assert.equal(lookup("xs", scope), "xs");
});

test("multi-param lambda: (x, y) => x + y gives x=$0, y=$1", () => {
  const scope = [{ params: ["x", "y"] }];
  assert.equal(lookup("x", scope), "$0");
  assert.equal(lookup("y", scope), "$1");
});

test("nested single-param lambdas: innermost is $0, outer is $1", () => {
  // xs.map(x => xs.filter(y => y > x)) — converting "y > x" body
  const scope = [{ params: ["y"] }, { params: ["x"] }];
  assert.equal(lookup("y", scope), "$0");
  assert.equal(lookup("x", scope), "$1");
});

test("reduce callback: (acc, x) => acc + x gives acc=$0, x=$1", () => {
  const scope = [{ params: ["acc", "x"] }];
  assert.equal(lookup("acc", scope), "$0");
  assert.equal(lookup("x", scope), "$1");
});
