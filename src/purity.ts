import {Node} from "ts-morph";

const ASSIGNMENT_OPERATORS = new Set([
    "=", "+=", "-=", "*=", "/=", "%=", "**=", "&=", "|=", "^=", "<<=", ">>=", ">>>=", "&&=", "||=", "??=",
]);

const IMPURE_METHOD_NAMES = new Set([
    "push", "pop", "splice", "shift", "unshift", "sort", "reverse", "forEach",
]);

export function isPure(node: Node): boolean {
    let pure = true;

    function visit(n: Node): void {
        if (!pure) return;

        if (Node.isAwaitExpression(n) || Node.isThrowStatement(n) || Node.isNewExpression(n)) {
            pure = false;
            return;
        }

        if (Node.isBinaryExpression(n) && ASSIGNMENT_OPERATORS.has(n.getOperatorToken().getText())) {
            // This also catches PropertyAccessExpressions for free
            pure = false;
            return;
        }

        if (Node.isCallExpression(n)) {
            const callee = n.getExpression();
            if (Node.isPropertyAccessExpression(callee)) {
                const methodName = callee.getName();
                const receiverText = callee.getExpression().getText();
                const isConsoleCall = receiverText === "console" && (methodName === "log" || methodName === "error");
                if (isConsoleCall || IMPURE_METHOD_NAMES.has(methodName)) {
                    pure = false;
                    return;
                }
            }
        }

        n.forEachChild(visit);
    }

    visit(node);
    return pure;
}