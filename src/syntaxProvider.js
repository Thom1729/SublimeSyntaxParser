const { Path } = require('../lib/pathlib');

const { loadYaml } = require('./load-yaml');
const { preprocess } = require('./preprocess');
const { process, pack } = require('./syntax');

class SyntaxProvider {
    constructor(path) {
        this.path = new Path(path);

        this.syntaxes = this.path.glob('**/*.sublime-syntax').map(path => ({
            path,
            raw: this.loadSublimeSyntax(path),
        }));

        this.scopes = {};
        for (const record of this.syntaxes) {
            const scope = record.raw.scope.join('').trim();
            this.scopes[scope] = record;
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
                    captures: rule.captures.map(scopeNames),
                })),
                patterns: ctx.rules.map(r => syntax.patterns[r.match]),
            })),
        };
    }

    loadSublimeSyntax(path) {
        const buffer = path.readBinary();
        const data = loadYaml(buffer);

        return preprocess(data);
    }

    loadPreprocessed(relpath) {
        const path = this.path.joinpath(relpath);
        const buffer = path.readBinary();
        const data = loadYaml(buffer);

        return preprocess(data);
    }

    loadRawByScope(scope) {
        return this.scopes[scope.trim()].raw;
    }

    getPacked(relpath) {
        return pack(process(relpath, this));
    }
}

module.exports = { SyntaxProvider };
