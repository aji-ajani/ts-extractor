import test from "node:test"
import assert from "node:assert/strict"
import {convert, convertProgram} from "../src/extract"
import {Scope} from "../src/scope"
import {parseExpr, parseLastExpr, parseFile} from "./helpers"

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

test("arrow function with impure body (console.log) returns null", () => {
    assert.equal(
        convert(parseExpr("(x) => console.log(x)"), noScope),
        null
    );
});

// Block-body arrow functions (define/seq)
test("block body with single const declaration and return", () => {
    assert.equal(
        convert(parseExpr("(x) => { const y = x * 2; return y + 1; }"), noScope),
        "(lam (define (num_mul $0 2) (num_add $0 1)))"
    );
});

test("block body with single let declaration and return (identical to const)", () => {
    assert.equal(
        convert(parseExpr("(x) => { let y = x * 2; return y + 1; }"), noScope),
        "(lam (define (num_mul $0 2) (num_add $0 1)))"
    );
});

test("block body with two chained const declarations", () => {
    assert.equal(
        convert(parseExpr("(x) => { const a = x + 1; const b = a * 2; return b; }"), noScope),
        "(lam (define (num_add $0 1) (define (num_mul $0 2) $0)))"
    );
});

test("block body with var declaration returns null", () => {
    assert.equal(
        convert(parseExpr("(x) => { var y = 1; return y; }"), noScope),
        null
    );
});

test("block body with destructured const returns null", () => {
    assert.equal(
        convert(parseExpr("(x) => { const {a} = x; return a; }"), noScope),
        null
    );
});

test("block body with multi-declarator const returns null", () => {
    assert.equal(
        convert(parseExpr("(x) => { const a = 1, b = 2; return a + b; }"), noScope),
        null
    );
});

test("empty block body encodes as done", () => {
    assert.equal(
        convert(parseExpr("() => {}"), noScope),
        "(lam done)"
    );
});

test("block body with no return statement encodes with done as the tail", () => {
    assert.equal(
        convert(parseExpr("(x) => { const a = x; }"), noScope),
        "(lam (define $0 done))"
    );
});

test("block body with bare return (no value) encodes as done", () => {
    assert.equal(
        convert(parseExpr("(x) => { const a = 1; return; }"), noScope),
        "(lam (define 1 done))"
    );
});

test("block body with a let that is later reassigned returns null (via existing purity gate)", () => {
    assert.equal(
        convert(parseExpr("(x) => { let y = 1; y = 2; return y; }"), noScope),
        null
    );
});

test("block body with impure statement (console.log) returns null", () => {
    assert.equal(
        convert(parseExpr("(x) => { console.log(x); return x; }"), noScope),
        null
    );
});

test("block body with a control-flow statement (if) returns null", () => {
    assert.equal(
        convert(parseExpr("(x) => { const a = 1; if (a > 0) {} return a; }"), noScope),
        null
    );
});

test("return statement followed by unreachable code drops the unreachable code", () => {
    assert.equal(
        convert(parseExpr("(x) => { return x; const a = 1; }"), noScope),
        "(lam $0)"
    );
});

test("return statement followed by impure unreachable code does not affect purity", () => {
    assert.equal(
        convert(parseExpr("(x) => { return x; console.log(\"dead\"); }"), noScope),
        "(lam $0)"
    );
});

test("block body with bare expression statement then return", () => {
    assert.equal(
        convert(parseExpr("(x) => { x > 0; return x + 1; }"), noScope),
        "(lam (seq (num_gt $0 0) (num_add $0 1)))"
    );
});

test("block body mixing define and seq", () => {
    assert.equal(
        convert(parseExpr("(x, y) => { const a = 1; y; return a + x; }"), noScope),
        "(lam (define 1 (seq $2 (num_add $0 $1))))"
    );
});

test("block body with bare expression statement and no return encodes with done", () => {
    assert.equal(
        convert(parseExpr("(x) => { x > 0; }"), noScope),
        "(lam (seq (num_gt $0 0) done))"
    );
});

test("block body with local interface and type declarations is skipped transparently", () => {
    assert.equal(
        convert(parseExpr("(x) => { interface Point { y: number } type Foo = number; return x; }"), noScope),
        "(lam $0)"
    );
});

test("block body with a local type declaration does not shift de Bruijn indices of surrounding statements", () => {
    assert.equal(
        convert(parseExpr("(x) => { type Foo = number; const a = x + 1; return a; }"), noScope),
        "(lam (define (num_add $0 1) $0))"
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

test("unary minus", () => {
    assert.equal(
        convert(parseExpr("-x"), noScope),
        "(num_neg x)"
    );
});

test("unary plus on declared number operand", () => {
    assert.equal(
        convert(parseLastExpr("declare const n: number;\n+n;"), noScope),
        "(num_pos n)"
    );
});

test("unary plus on untyped/any operand returns null", () => {
    assert.equal(
        convert(parseExpr("+x"), noScope),
        null
    );
});

test("unary plus on union-typed operand returns null", () => {
    assert.equal(
        convert(parseLastExpr("declare const u: string | number;\n+u;"), noScope),
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

// Array methods
test("array map", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.map(x => x * 2);"), noScope),
        "(array_map xs (lam (num_mul $0 2)))"
    );
});

test("array filter", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.filter(x => x > 0);"), noScope),
        "(array_filter xs (lam (num_gt $0 0)))"
    );
});

test("array flatMap", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.flatMap(x => x);"), noScope),
        "(array_flatMap xs (lam $0))"
    );
});

test("array find", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.find(x => x > 0);"), noScope),
        "(array_find xs (lam (num_gt $0 0)))"
    );
});

test("array some", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.some(x => x > 0);"), noScope),
        "(array_some xs (lam (num_gt $0 0)))"
    );
});

test("array every", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.every(x => x > 0);"), noScope),
        "(array_every xs (lam (num_gt $0 0)))"
    );
});

test("non-array receiver is not encoded as an array method", () => {
    assert.equal(
        convert(parseLastExpr("declare const obj: { map: (f: unknown) => unknown };\nobj.map(x => x);"), noScope),
        null
    );
});

test("unrecognized method name on array receiver returns null", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.join(',');"), noScope),
        null
    );
});

test("array method call with extra argument returns null", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.map(x => x, undefined);"), noScope),
        null
    );
});

test("array method chaining", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.map(x => x * 2).filter(x => x > 0);"), noScope),
        "(array_filter (array_map xs (lam (num_mul $0 2))) (lam (num_gt $0 0)))"
    );
});

test("array method callback as a free identifier (not an arrow function)", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\ndeclare const double: (x: number) => number;\nxs.map(double);"), noScope),
        "(array_map xs double)"
    );
});

test("array method callback that fails the purity check returns null", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.map(x => console.log(x));"), noScope),
        null
    );
});

test("array reduce with initial value", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.reduce((acc, x) => acc + x, 0);"), noScope),
        "(array_reduce xs (lam (num_add $0 $1)) 0)"
    );
});

test("array reduce without initial value returns null", () => {
    assert.equal(
        convert(parseLastExpr("declare const xs: number[];\nxs.reduce((acc, x) => acc + x);"), noScope),
        null
    );
});

// Unsupported node
test("unsupported node (call expression) returns null", () => {
    assert.equal(
        convert(parseExpr("f(x)"), noScope),
        null
    );
});

// Top-level (file-level) define/seq sequencing
test("file with const and expression statements encodes with no lam wrapper", () => {
    assert.equal(
        convertProgram(parseFile("const a = 1;\na + 2;")),
        "(define 1 (seq (num_add $0 2) done))"
    );
});

test("empty file encodes as bare done", () => {
    assert.equal(
        convertProgram(parseFile("")),
        "done"
    );
});

test("file with an impure top-level statement returns null", () => {
    assert.equal(
        convertProgram(parseFile('console.log(1);\nconst a = 1;')),
        null
    );
});

test("file with a top-level function declaration returns null", () => {
    assert.equal(
        convertProgram(parseFile("function foo() { return 1; }")),
        null
    );
});

test("file with a top-level class declaration returns null", () => {
    assert.equal(
        convertProgram(parseFile("class Foo {}")),
        null
    );
});

test("file with a top-level enum declaration returns null", () => {
    assert.equal(
        convertProgram(parseFile("enum Color { Red, Green }")),
        null
    );
});

test("export const is still recognized as a VariableStatement", () => {
    assert.equal(
        convertProgram(parseFile("export const x = 1;\nx + 1;")),
        "(define 1 (seq (num_add $0 1) done))"
    );
});

test("file with a leading import statement skips it transparently", () => {
    assert.equal(
        convertProgram(parseFile('import {foo} from "./foo";\nconst a = 1;\na + 2;')),
        "(define 1 (seq (num_add $0 2) done))"
    );
});

test("interleaved type and interface declarations are skipped transparently", () => {
    assert.equal(
        convertProgram(parseFile("type Foo = number;\nconst a: Foo = 1;\ninterface Bar { x: number }\na + 1;")),
        "(define 1 (seq (num_add $0 1) done))"
    );
});

test("export declaration (re-export) is skipped transparently", () => {
    assert.equal(
        convertProgram(parseFile('const a = 1;\nexport {a};\na + 1;')),
        "(define 1 (seq (num_add $0 1) done))"
    );
});

test("export default is encoded as seq, not terminal — later statements still convert", () => {
    assert.equal(
        convertProgram(parseFile("const a = 1;\nexport default a + 1;\na + 2;")),
        "(define 1 (seq (num_add $0 1) (seq (num_add $0 2) done)))"
    );
});