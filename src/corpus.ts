import {Project} from "ts-morph";
import * as fs from "fs";
import * as path from "path";
import {convertProgram} from "./extract";

// Rough AST-size proxy: every operator and every leaf is one whitespace/paren-
// delimited token, so counting tokens approximates counting term nodes
// without needing a separate s-expression parser on the TS side.
function astSize(sexpr: string): number {
    const tokens = sexpr.match(/[^\s()]+/g);
    return tokens === null ? 0 : tokens.length;
}

function collectTsFiles(inputPath: string): string[] {
    if (fs.statSync(inputPath).isDirectory()) {
        return fs.readdirSync(inputPath)
            .filter((name) => name.endsWith(".ts"))
            .map((name) => path.join(inputPath, name));
    }
    return [inputPath];
}

export function buildCorpus(inputPaths: string[], minAstSize = 3): string[] {
    const project = new Project();
    const seen = new Set<string>();
    const corpus: string[] = [];

    for (const filePath of inputPaths.flatMap(collectTsFiles)) {
        const file = project.addSourceFileAtPath(filePath);

        const term = convertProgram(file);
        if (term === null) continue;
        if (astSize(term) < minAstSize) continue;
        if (seen.has(term)) continue;

        seen.add(term);
        corpus.push(term);
    }

    return corpus;
}

function main() {
    const inputs = process.argv.length > 2 ? process.argv.slice(2, -1) : ["experiments/sanity_corpus"];
    const outputPath = process.argv.length > 3 ? process.argv[process.argv.length - 1] : "experiments/data/ts-corpus.json";

    const corpus = buildCorpus(inputs);

    fs.mkdirSync(path.dirname(outputPath), {recursive: true});
    fs.writeFileSync(outputPath, JSON.stringify(corpus, null, 4));

    console.log(`Wrote ${corpus.length} programs to ${outputPath}`);
    for (const entry of corpus) console.log(`  ${entry}`);
}

if (require.main === module) main();
