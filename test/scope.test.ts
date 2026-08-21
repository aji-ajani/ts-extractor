import test from "node:test";
import assert from "node:assert/strict";
import {lookup, pushParams, Scope} from "../src/scope";

test("single-param lambda: x is $0", () => {
  const scope = [{ params: ["x"] }];
  assert.equal(lookup("x", scope), "$0");
});

test("unbound identifier returns free symbol", () => {
  const scope = [{ params: ["x"] }];
  assert.equal(lookup("xs", scope), "xs");
});

test("multi-param lambda: (x, y) => x + y gives y=$0, x=$1", () => {
  // Source order is ["x", "y"]; pushParams reverses it, so the level holds ["y", "x"].
  const scope = pushParams(["x", "y"], []);
  assert.equal(lookup("y", scope), "$0");
  assert.equal(lookup("x", scope), "$1");
});

test("nested single-param lambdas: innermost is $0, outer is $1", () => {
  // xs.map(x => xs.filter(y => y > x)) — converting "y > x" body
  const scope = pushParams(["y"], pushParams(["x"], []));
  assert.equal(lookup("y", scope), "$0");
  assert.equal(lookup("x", scope), "$1");
});

test("reduce callback: (acc, x) => acc + x gives x=$0, acc=$1", () => {
  const scope = pushParams(["acc", "x"], []);
  assert.equal(lookup("x", scope), "$0");
  assert.equal(lookup("acc", scope), "$1");
});

test("pushParams reverses the level so the last parameter is $0", () => {
  const scope = pushParams(["x", "lo", "hi"], []);
  assert.equal(lookup("hi", scope), "$0");
  assert.equal(lookup("lo", scope), "$1");
  assert.equal(lookup("x", scope), "$2");
});

test("pushParams does not mutate its arguments", () => {
  const params = ["x", "y"];
  const outer: Scope = [{ params: ["z"] }];
  pushParams(params, outer);
  assert.deepEqual(params, ["x", "y"]);
  assert.deepEqual(outer, [{ params: ["z"] }]);
});

test("pushParams on a single name is a no-op reversal (the define case)", () => {
  const scope = pushParams(["s"], pushParams(["x", "y"], []));
  assert.equal(lookup("s", scope), "$0");
  assert.equal(lookup("y", scope), "$1");
  assert.equal(lookup("x", scope), "$2");
});

test("pushParams with zero params still adds a level that shifts nothing", () => {
  // lam0 binds nothing, so an outer param keeps its index.
  const scope = pushParams([], pushParams(["x"], []));
  assert.equal(lookup("x", scope), "$0");
});
