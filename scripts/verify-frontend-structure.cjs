const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../apps/frontend/src/app');
const components = [];
function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(target);
        } else if (target.endsWith('.component.ts')) {
            components.push(target);
        }
    }
}
walk(root);
for (const component of components) {
    const source = ts.createSourceFile(
        component,
        fs.readFileSync(component, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
    );
    const metadata = new Map();
    function visit(node) {
        if (ts.isPropertyAssignment(node)) {
            metadata.set(node.name.getText(source), node.initializer);
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    for (const forbidden of ['template', 'styles', 'styleUrls']) {
        if (metadata.has(forbidden)) {
            throw new Error(`${component}: inline or unsupported ${forbidden}`);
        }
    }
    for (const [property, extension] of [
        ['templateUrl', '.html'],
        ['styleUrl', '.scss'],
    ]) {
        const literal = metadata.get(property);
        const expected = './' + path.basename(component, '.ts') + extension;
        if (!literal || !ts.isStringLiteral(literal) || literal.text !== expected) {
            throw new Error(`${component}: expected ${property}: '${expected}'`);
        }
        const target = path.resolve(path.dirname(component), literal.text);
        if (!fs.existsSync(target) || !fs.readFileSync(target, 'utf8').trim()) {
            throw new Error(`Missing or empty resource: ${target}`);
        }
        if (
            extension === '.html' &&
            /<style\b|\sstyle\s*=|\[style[.\]]/i.test(fs.readFileSync(target, 'utf8'))
        ) {
            throw new Error(`Inline styles are forbidden: ${target}`);
        }
    }
}
process.stdout.write(`Verified ${components.length} component TypeScript/HTML/SCSS triplets.\n`);
