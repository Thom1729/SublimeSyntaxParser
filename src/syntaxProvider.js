const { Path } = require('../lib/pathlib');

const { loadYaml } = require('./load-yaml');
const { preprocess } = require('./preprocess');
const { process, pack } = require('./syntax');

class SyntaxDefinition {
    constructor(props) {
        Object.assign(this, props);
    }
}

class SyntaxProvider {
    constructor() {
        this.syntaxes = [];
        this.scopes = {};
        this.extensions = {};
    }

    addDirectory(directory) {
        for (const path of new Path(directory).globSync('**/*.sublime-syntax')) {
            this.addSyntax(new SyntaxDefinition({
                path,
                raw: this.loadSublimeSyntax(path),
            }));
        }
    }

    addSyntax(record) {
        this.syntaxes.push(record);

        const scope = record.raw.scope.join('').trim();
        this.scopes[scope] = record;

        if (record.raw.file_extensions) {
            for (const extension of record.raw.file_extensions) {
                this.extensions[extension] = record;
            }
        }
    }

    unpack(syntax) {
        const scopeNames = (arr) => arr && arr.map(i => syntax.scopes[i]);

        return {
            ...syntax,
            scope: scopeNames(syntax.scope),
            contexts: syntax.contexts.map(ctx => ({
                ...ctx,
                meta_scope: scopeNames(ctx.meta_scope) || [],
                meta_content_scope: scopeNames(ctx.meta_content_scope) || [],
                rules: ctx.rules.map(rule => ({
                    ...rule,
                    next: rule.next || [],
                    captures: rule.captures ? rule.captures.map(scopeNames) : [],
                })),
                patterns: ctx.patterns.map(p => syntax.patterns[p]),
            })),
        };
    }

    loadSublimeSyntax(path) {
        const buffer = path.readBinarySync();
        const data = loadYaml(buffer);

        return preprocess(data);
    }

    getSyntaxForScope(scope) {
        return this.scopes[scope.trim()];
    }

    getSyntaxForExtension(extension) {
        extension = extension.trim();
        if (extension[0] === '.') extension = extension.slice(1);
        return this.extensions[extension];
    }

    compile(syntax) {
        return pack(process(syntax, this));
    }
}

module.exports = { SyntaxProvider };
