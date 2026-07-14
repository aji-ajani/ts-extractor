import test from "node:test"
import assert from "node:assert/strict"
import { Project, Node } from "ts-morph"
import { convert } from "../src/extract"
import { Scope } from "../src/scope"

function parseExpr(src: string): Node {
    const project = new Project({useInMemoryFileSystem: true})
    const file = project.createSourceFile("scratch.ts", `${src};`)
    const stmt = file.getStatements()[0];
    if (!Node.isExpressionStatement(stmt)) {
        throw new Error(`expected expression statement, got: ${stmt.getKindName()}`);
    }
    return stmt.getExpression()
}

const noScope: Scope = [];

test("numeric addition", () => {
    assert.equal(
        convert(parseExpr("2 + 3"), noScope),
        "(num_add 2 3)"
    )
})

test("numeric subtraction", () => {
    assert.equal(
        convert(parseExpr("2 - 3"), noScope),
        "(num_sub 2 3)"
    );
});

test("numeric multiplication", () => {
    assert.equal(
        convert(parseExpr("2 * 3"), noScope),
        "(num_mul 2 3)"
    );
});

test("numeric division", () => {
    assert.equal(
        convert(parseExpr("2 / 3"), noScope),
        "(num_div 2 3)"
    );
});

test("free identifier in arithmetic", () => {
    assert.equal(
        convert(parseExpr("x + 1"), noScope),
        "(num_add x 1)"
    );
});

test("single-param arrow function with arithmetic body", () => {
    assert.equal(
        convert(parseExpr("(x) => x + 1"), noScope),
        "(lam (num_add $0 1))"
    );
});

test("multi-param arrow function with nested arithmetic", () => {
    assert.equal(
        convert(parseExpr("(x, y) => x + y * 2"), noScope),
        "(lam (num_add $0 (num_mul $1 2)))"
    );
});

test("unsupported node (ternary) returns null", () => {
    assert.equal(
        convert(parseExpr("cond ? 1 : 0"), noScope),
        null
    );
});