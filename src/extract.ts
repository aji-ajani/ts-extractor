import {Node, SyntaxKind} from "ts-morph"
import {Scope, lookup} from "./scope"

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
        if (node.getOperatorToken() !== SyntaxKind.ExclamationToken) return null; // only ! is currently supported
        const operand = convert(node.getOperand(), scope);
        if (operand === null) return null;
        return `(bool_not ${operand})`;
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
        const inner = convert(body, [{params}, ...scope]);
        if (inner === null) return null; // propagate body parse failure upwards
        return `(lam ${inner})`
    }
    return null;
}