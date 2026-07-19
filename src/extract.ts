import {Node, SyntaxKind} from "ts-morph"
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
        if (Node.isBlock(body)) return null; // block bodies not supported yet
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