const { Path } = require('../lib/pathlib');

const { loadYaml } = require('./load-yaml');
const { preprocess } = require('./preprocess');
const { process, pack } = require('./syntax');

class SyntaxProvider {
    constructor(path) {
        this.path = new Path(path);

        this.syntaxes = this.path.globSync('**/*.sublime-syntax').map(path => ({
            path,
            raw: this.loadSublimeSyntax(path),
        }));

        this.scopes = {};
        this.extensions = {};

        for (const record of this.syntaxes) {
            const scope = record.raw.scope.join('').trim();
            this.scopes[scope] = record;

            if (record.raw.file_extensions) {
                for (const extension of record.raw.file_extensions) {
                    this.extensions[extension] = record;
                }
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

    loadPreprocessed(relpath) {
        const path = this.path.joinpath(relpath);
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

    getPacked(syntax) {
        return pack(process(syntax, this));
    }
}

module.exports = { SyntaxProvider };
