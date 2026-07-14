import test from "node:test"
import assert from "node:assert/strict"
import {Project, Node} from "ts-morph"
import {convert} from "../src/extract"
import {Scope} from "../src/scope"

// Helpers
function parseExpr(src: string): Node {
    const project = new Project({useInMemoryFileSystem: true})
    const file = project.createSourceFile("scratch.ts", `${src};`)
    const stmt = file.getStatements()[0];
    if (!Node.isExpressionStatement(stmt)) {
        throw new Error(`expected expression statement, got: ${stmt.getKindName()}`);
    }
    return stmt.getExpression()
}

function parseLastExpr(src: string): Node {
    const project = new Project({useInMemoryFileSystem: true})
    const file = project.createSourceFile("scratch.ts", src)
    const statements = file.getStatements();
    const stmt = statements[statements.length - 1];
    if (!Node.isExpressionStatement(stmt)) {
        throw new Error(`expected expression statement, got: ${stmt.getKindName()}`);
    }
    return stmt.getExpression()
}

const noScope: Scope = [];

// Binary numeric operations
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

// Arrow functions
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

// String concatenation
test("string literal encodes as JSON-quoted string", () => {
    assert.equal(
        convert(parseExpr('"hello"'), noScope),
        '"hello"'
    );
});

test("string concatenation via + dispatches on left operand type", () => {
    assert.equal(
        convert(parseExpr('"a" + "b"'), noScope),
        '(str_concat "a" "b")'
    );
});

test("union-typed left operand in + returns null (ambiguous num_add/str_concat)", () => {
    assert.equal(
        convert(parseLastExpr("declare const u: string | number;\nu + 1;"), noScope),
        null
    );
});

// Numeric comparisons
test("greater than", () => {
    assert.equal(
        convert(parseExpr("2 > 3"), noScope),
        "(num_gt 2 3)"
    );
});

test("less than", () => {
    assert.equal(
        convert(parseExpr("2 < 3"), noScope),
        "(num_lt 2 3)"
    );
});

test("greater than or equal", () => {
    assert.equal(
        convert(parseExpr("2 >= 3"), noScope),
        "(num_gte 2 3)"
    );
});

test("less than or equal", () => {
    assert.equal(
        convert(parseExpr("2 <= 3"), noScope),
        "(num_lte 2 3)"
    );
});

test("comparison on free (untyped) identifiers still maps to num_gt", () => {
    assert.equal(
        convert(parseExpr("x > 0"), noScope),
        "(num_gt x 0)"
    );
});

// Equality
test("numeric equality", () => {
    assert.equal(
        convert(parseExpr("2 === 3"), noScope),
        "(num_eq 2 3)"
    );
});

test("string equality", () => {
    assert.equal(
        convert(parseExpr('"a" === "b"'), noScope),
        '(str_eq "a" "b")'
    );
});

test("mismatched-type equality returns null", () => {
    assert.equal(
        convert(parseExpr('2 === "a"'), noScope),
        null
    );
});

test("union-typed operand in === returns null (ambiguous num_eq/str_eq)", () => {
    assert.equal(
        convert(parseLastExpr("declare const u: string | number;\nu === 1;"), noScope),
        null
    );
});

// Boolean logic
test("logical and", () => {
    assert.equal(
        convert(parseExpr("x && y"), noScope),
        "(bool_and x y)"
    );
});

test("logical or", () => {
    assert.equal(
        convert(parseExpr("x || y"), noScope),
        "(bool_or x y)"
    );
});

test("logical and numeric comparisons", () => {
    assert.equal(
        convert(parseExpr("x > 0 && y < 10"), noScope),
        "(bool_and (num_gt x 0) (num_lt y 10))"
    );
});

// Unary operators
test("logical not", () => {
    assert.equal(
        convert(parseExpr("!x"), noScope),
        "(bool_not x)"
    );
});

test("double negation nests", () => {
    assert.equal(
        convert(parseExpr("!!x"), noScope),
        "(bool_not (bool_not x))"
    );
});

test("unsupported prefix unary operator (unary minus) returns null", () => {
    assert.equal(
        convert(parseExpr("-x"), noScope),
        null
    );
});

// Ternary
test("ternary", () => {
    assert.equal(
        convert(parseExpr("cond ? 1 : 0"), noScope),
        "(ternary cond 1 0)"
    );
});

test("ternary over a comparison condition", () => {
    assert.equal(
        convert(parseExpr("x > 0 ? x : 0"), noScope),
        "(ternary (num_gt x 0) x 0)"
    );
});

// Unsupported node
test("unsupported node (call expression) returns null", () => {
    assert.equal(
        convert(parseExpr("f(x)"), noScope),
        null
    );
});