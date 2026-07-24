import {Node, SyntaxKind, Statement, VariableDeclarationKind, SourceFile, IfStatement} from "ts-morph"
import {Scope, lookup} from "./scope"
import {isPure} from "./purity"

const ARRAY_OPS: Record<string, string> = {
    map: "array_map",
    filter: "array_filter",
    flatMap: "array_flatMap",
    find: "array_find",
    some: "array_some",
    every: "array_every",
    // reduce is handled separately
};

function reachableStatements(statements: Statement[]): Statement[] {
    const returnIndex = statements.findIndex((s) => Node.isReturnStatement(s));
    return returnIndex === -1 ? statements : statements.slice(0, returnIndex + 1);
}

function isBlockPure(statements: Statement[]): boolean {
    return reachableStatements(statements).every(isStatementPure);
}

function isStatementPure(stmt: Statement): boolean {
    if (!Node.isIfStatement(stmt)) return isPure(stmt);

    if (!isPure(stmt.getExpression())) return false;

    const thenStmt = stmt.getThenStatement();
    if (!Node.isBlock(thenStmt)) return isPure(stmt); // braceless then — conversion rejects it anyway

    if (!isBlockPure(thenStmt.getStatements())) return false;

    const elseStmt = stmt.getElseStatement();
    if (elseStmt === undefined) return true;
    if (Node.isIfStatement(elseStmt)) return isStatementPure(elseStmt);
    if (Node.isBlock(elseStmt)) return isBlockPure(elseStmt.getStatements());
    return isPure(elseStmt); // braceless else — conversion rejects it anyway
}

function convertElseBranch(stmt: Statement | undefined, scope: Scope): string | null {
    if (stmt === undefined) return "done"; // no else clause

    if (Node.isIfStatement(stmt)) return convertIfStatement(stmt, scope); // else if

    if (Node.isBlock(stmt)) return convertBlockStatements(stmt.getStatements(), 0, scope);

    return null; // braceless else (e.g. `else foo();`) not supported
}

function convertIfStatement(stmt: IfStatement, scope: Scope): string | null {
    const condNode = stmt.getExpression();
    const condType = condNode.getType();
    if (!condType.isBoolean() && !condType.isBooleanLiteral()) return null; // non-boolean (incl. unions) — don't guess a truthiness coercion

    const cond = convert(condNode, scope);
    if (cond === null) return null;

    const thenStmt = stmt.getThenStatement();
    if (!Node.isBlock(thenStmt)) return null; // braceless then (e.g. `if (c) foo();`) not supported

    const thenChain = convertBlockStatements(thenStmt.getStatements(), 0, scope);
    if (thenChain === null) return null;

    const elseChain = convertElseBranch(stmt.getElseStatement(), scope);
    if (elseChain === null) return null;

    return `(if ${cond} ${thenChain} ${elseChain})`;
}

function convertBlockStatements(statements: Statement[], index: number, scope: Scope): string | null {
    if (index === statements.length) return "done"; // ran out of statements — no explicit return

    const stmt = statements[index];

    if (Node.isReturnStatement(stmt)) {
        // Terminal unconditionally: the only other source of control transfer is `if`, whose
        // branches recurse through this same function — so anything textually after a `return`
        // is provably unreachable, dropped here rather than converted, regardless of what (if
        // anything) follows in `statements`.
        const returnExpr = stmt.getExpression();
        if (returnExpr === undefined) return "(return done)"; // bare `return;`

        const value = convert(returnExpr, scope);
        if (value === null) return null;
        return `(return ${value})`;
    }

    if (Node.isVariableStatement(stmt)) {
        if (stmt.getDeclarationKind() === VariableDeclarationKind.Var) return null; // var not supported

        const declarations = stmt.getDeclarations();
        if (declarations.length !== 1) return null; // multi-declarator statements not supported

        const nameNode = declarations[0].getNameNode();
        if (!Node.isIdentifier(nameNode)) return null; // destructuring not supported

        const initializer = declarations[0].getInitializer();
        if (initializer === undefined) return null; // no value to bind

        const value = convert(initializer, scope);
        if (value === null) return null;

        const rest = convertBlockStatements(statements, index + 1, [{params: [nameNode.getText()]}, ...scope]);
        if (rest === null) return null;
        return `(define ${value} ${rest})`;
    }

    if (Node.isExpressionStatement(stmt)) {
        const value = convert(stmt.getExpression(), scope);
        if (value === null) return null;

        const rest = convertBlockStatements(statements, index + 1, scope);
        if (rest === null) return null;
        return `(seq ${value} ${rest})`;
    }

    if (Node.isIfStatement(stmt)) {
        const ifTerm = convertIfStatement(stmt, scope);
        if (ifTerm === null) return null;

        if (index + 1 === statements.length) return ifTerm; // last statement — no seq wrapper, mirrors a terminal return's value

        const rest = convertBlockStatements(statements, index + 1, scope);
        if (rest === null) return null;
        return `(seq ${ifTerm} ${rest})`;
    }

    if (
        Node.isImportDeclaration(stmt) ||
        Node.isImportEqualsDeclaration(stmt) ||
        Node.isExportDeclaration(stmt) ||
        Node.isTypeAliasDeclaration(stmt) ||
        Node.isInterfaceDeclaration(stmt)
    ) {
        // Erased at compile time (or, for imports, no DSL concept of module loading) — no
        // runtime value to encode, so skip silently rather than rejecting the whole file.
        return convertBlockStatements(statements, index + 1, scope);
    }

    if (Node.isExportAssignment(stmt)) {
        // Not terminal like return: export default/export = does not stop module evaluation,
        // so statements after it still execute and must still be converted, not dropped.
        const value = convert(stmt.getExpression(), scope);
        if (value === null) return null;

        const rest = convertBlockStatements(statements, index + 1, scope);
        if (rest === null) return null;
        return `(seq ${value} ${rest})`;
    }

    return null; // unsupported statement kind (for/while/throw/try/function/class/enum/namespace, ...)
}

export function convertProgram(sourceFile: SourceFile): string | null {
    const statements = sourceFile.getStatements();
    if (!isBlockPure(statements)) return null;
    return convertBlockStatements(statements, 0, []);
}

export function convert(node: Node, scope: Scope): string | null {
    if (Node.isNumericLiteral(node)) {
        return node.getText();
    }

    if (Node.isStringLiteral(node)) {
        return JSON.stringify(node.getLiteralValue());
    }

    if (Node.isIdentifier(node)) {
        return lookup(node.getText(), scope);
    }

    if (Node.isTrueLiteral(node) || Node.isFalseLiteral(node)) {
        return node.getText(); // "true" / "false"
    }

    if (Node.isPrefixUnaryExpression(node)) {
        const operatorToken = node.getOperatorToken();
        const operand = convert(node.getOperand(), scope);
        if (operand === null) return null;

        switch (operatorToken) {
            case SyntaxKind.ExclamationToken:
                return `(bool_not ${operand})`;
            case SyntaxKind.MinusToken:
                return `(num_neg ${operand})`;
            case SyntaxKind.PlusToken: {
                const operandType = node.getOperand().getType();
                if (operandType.isUnion()) return null; // ambiguous - don't guess
                if (!operandType.isNumber() && !operandType.isNumberLiteral()) return null;
                return `(num_pos ${operand})`;
            }
            default:
                return null; // other prefix unary operators not supported yet
        }
    }

    if (Node.isConditionalExpression(node)) {
        const cond = convert(node.getCondition(), scope);
        const whenTrue = convert(node.getWhenTrue(), scope);
        const whenFalse = convert(node.getWhenFalse(), scope);
        if (cond === null || whenTrue === null || whenFalse === null) return null;
        return `(ternary ${cond} ${whenTrue} ${whenFalse})`;
    }

    if (Node.isBinaryExpression(node)) {
        const left = convert(node.getLeft(), scope);
        const right = convert(node.getRight(), scope);

        if (left === null || right === null) return null; // propagate parse failures upwards

        switch (node.getOperatorToken().getText()) {
            case "+": {
                const leftType = node.getLeft().getType();
                if (leftType.isUnion()) return null; // ambiguous num_add/str_concat - don't guess
                if (leftType.isString() || leftType.isStringLiteral()) return `(str_concat ${left} ${right})`;
                return `(num_add ${left} ${right})`;
            }
            case "-":
                return `(num_sub ${left} ${right})`;
            case "*":
                return `(num_mul ${left} ${right})`;
            case "/":
                return `(num_div ${left} ${right})`;
            case ">":
                return `(num_gt ${left} ${right})`;
            case "<":
                return `(num_lt ${left} ${right})`;
            case ">=":
                return `(num_gte ${left} ${right})`;
            case "<=":
                return `(num_lte ${left} ${right})`;
            case "===": {
                const leftType = node.getLeft().getType();
                const rightType = node.getRight().getType();
                if (leftType.isUnion() || rightType.isUnion()) return null; // ambiguous - don't guess
                if ((leftType.isNumber() || leftType.isNumberLiteral()) && (rightType.isNumber() || rightType.isNumberLiteral())) return `(num_eq ${left} ${right})`;
                if ((leftType.isString() || leftType.isStringLiteral()) && (rightType.isString() || rightType.isStringLiteral())) return `(str_eq ${left} ${right})`;
                return null; // mismatched or otherwise untyped operands
            }
            case "&&":
                return `(bool_and ${left} ${right})`;
            case "||":
                return `(bool_or ${left} ${right})`;
            default:
                return null; // other binary expressions not supported yet
        }
    }

    if (Node.isArrowFunction(node)) {
        const params = node.getParameters().map((p) => p.getName());
        const body: Node = node.getBody();

        if (Node.isBlock(body)) {
            const statements = reachableStatements(body.getStatements());
            if (!isBlockPure(statements)) return null; // impure closures are not DSR-eligible; dead code after `return` (including inside if-branches) is excluded
            const inner = convertBlockStatements(statements, 0, [{params}, ...scope]);
            if (inner === null) return null;
            return `(lam ${inner})`;
        }

        if (!isPure(body)) return null; // impure closures are not DSR-eligible
        const inner = convert(body, [{params}, ...scope]);
        if (inner === null) return null; // propagate body parse failure upwards
        return `(lam ${inner})`
    }

    if (Node.isCallExpression(node)) {
        const callee = node.getExpression();
        if (!Node.isPropertyAccessExpression(callee)) return null; // only method calls are supported

        const receiverNode = callee.getExpression();
        if (!receiverNode.getType().isArray()) return null; // only Array.* methods are encoded

        const methodName = callee.getName();
        const args = node.getArguments();
        const receiver = convert(receiverNode, scope);
        if (receiver === null) return null;

        if (methodName in ARRAY_OPS && args.length === 1) {
            const callback = convert(args[0], scope);
            if (callback === null) return null;
            return `(${ARRAY_OPS[methodName]} ${receiver} ${callback})`;
        }

        if (methodName === "reduce" && args.length === 2) {
            const callback = convert(args[0], scope);
            const init = convert(args[1], scope);
            if (callback === null || init === null) return null;
            return `(array_reduce ${receiver} ${callback} ${init})`;
        }
    }

    return null;
}