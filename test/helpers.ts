import {Project, Node, SourceFile} from "ts-morph";

export function parseExpr(src: string): Node {
    const project = new Project({useInMemoryFileSystem: true});
    const file = project.createSourceFile("scratch.ts", `${src};`);
    const stmt = file.getStatements()[0];
    if (!Node.isExpressionStatement(stmt)) {
        throw new Error(`expected expression statement, got: ${stmt.getKindName()}`);
    }
    return stmt.getExpression();
}

export function parseLastExpr(src: string): Node {
    const project = new Project({useInMemoryFileSystem: true});
    const file = project.createSourceFile("scratch.ts", src);
    const statements = file.getStatements();
    const stmt = statements[statements.length - 1];
    if (!Node.isExpressionStatement(stmt)) {
        throw new Error(`expected expression statement, got: ${stmt.getKindName()}`);
    }
    return stmt.getExpression();
}

export function parseStatement(src: string): Node {
    const project = new Project({useInMemoryFileSystem: true});
    const file = project.createSourceFile("scratch.ts", src);
    return file.getStatements()[0];
}

export function parseFile(src: string): SourceFile {
    const project = new Project({useInMemoryFileSystem: true});
    return project.createSourceFile("scratch.ts", src);
}