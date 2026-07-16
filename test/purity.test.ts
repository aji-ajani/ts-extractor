import test from "node:test";
import assert from "node:assert/strict"
import {isPure} from "../src/purity"
import {parseExpr, parseStatement} from "./helpers";

test("pure arithmetic expression", () => {
    assert.equal(isPure(parseExpr("x + 1")), true);
});

test("pure ternary expression", () => {
    assert.equal(isPure(parseExpr("x > 0 ? x : 0")), true);
});

test("console.log call is impure", () => {
    assert.equal(isPure(parseExpr("console.log(x)")), false);
});

test("console.error call is impure", () => {
    assert.equal(isPure(parseExpr("console.error(x)")), false);
});

test("array push call is impure", () => {
    assert.equal(isPure(parseExpr("xs.push(x)")), false);
});

test("array splice call is impure", () => {
    assert.equal(isPure(parseExpr("xs.splice(0, 1)")), false);
});

test("array forEach call is impure", () => {
    assert.equal(isPure(parseExpr("xs.forEach(x => x)")), false);
});

test("new expression is impure", () => {
    assert.equal(isPure(parseExpr("new Foo()")), false);
});

test("plain reassignment is impure", () => {
    assert.equal(isPure(parseStatement("x = 1;")), false);
});

test("property assignment is impure", () => {
    assert.equal(isPure(parseStatement("obj.prop = x;")), false);
});

test("throw statement is impure", () => {
    assert.equal(isPure(parseStatement("throw new Error('x');")), false);
});

test("await expression is impure", () => {
    assert.equal(isPure(parseStatement("async function f() { await g(); }")), false);
});

test("impurity nested inside a ternary branch is detected", () => {
    assert.equal(isPure(parseExpr("cond ? console.log(x) : y")), false);
});

test("push on a non-array receiver is still flagged (name-based heuristic, documented limitation)", () => {
    assert.equal(isPure(parseExpr("obj.push(x)")), false);
});