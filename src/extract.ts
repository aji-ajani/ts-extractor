import { Node } from "ts-morph"
import { Scope, lookup } from "./scope"

export function convert(node: Node, scope: Scope): string | null {
    if (Node.isNumericLiteral(node)) {
        return node.getText();
    }

    if (Node.isIdentifier(node)) {
        return lookup(node.getText(), scope);
    }

    if (Node.isBinaryExpression(node)) {
        const left = convert(node.getLeft(), scope);
        const right = convert(node.getRight(), scope);

        if (left === null || right === null) return null; // propagate parse failures upwards

        switch (node.getOperatorToken().getText()) {
            case "+":
                return `(num_add ${left} ${right})`;
            case "-":
                return `(num_sub ${left} ${right})`;
            case "*":
                return `(num_mul ${left} ${right})`;
            case "/":
                return `(num_div ${left} ${right})`;
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