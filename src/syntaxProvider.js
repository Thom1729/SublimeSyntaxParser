const { Path } = require('../lib/pathlib');

const { loadYaml } = require('./load-yaml');
const { preprocess } = require('./syntax');
const { objMap } = require('./util');

class SyntaxProvider {
    constructor(path) {
        this.path = new Path(path);
    }

    unpack(syntax) {
        const scopeNames = (arr) => arr && arr.map(i => syntax.scopes[i]);

        return {
            ...syntax,
            scope: scopeNames(syntax.scope),
            contexts: objMap(syntax.contexts, ctx => ({
                ...ctx,
                meta_scope: scopeNames(ctx.meta_scope) || [],
                meta_content_scope: scopeNames(ctx.meta_content_scope) || [],
                rules: ctx.rules.map(rule => ({
                    ...rule,
                    captures: objMap(
                        rule.captures,
                        scopeNames
                    ),
                })),
                patterns: ctx.rules.map(r => syntax.patterns[r.match]),
            })),
        };
    }

    getPacked(relpath) {
        const path = this.path.joinpath(relpath);
        const buffer = path.readBinary();
        const data = loadYaml(buffer);
        const syntax = preprocess(data);

        return syntax;
    }

    load(relpath) {
        const path = this.path.joinpath(relpath);
        const buffer = path.readBinary();
        const data = loadYaml(buffer);
        const syntax = preprocess(data);

        return this.unpack(syntax);
    }
}

module.exports = { SyntaxProvider };
