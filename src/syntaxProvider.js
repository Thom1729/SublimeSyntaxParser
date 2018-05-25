const { Path } = require('../lib/pathlib');

const { loadYaml } = require('./load-yaml');
const { preprocess, process } = require('./syntax');
const { objMap } = require('./util');

class SyntaxProvider {
    constructor(path, scopes) {
        this.path = new Path(path);
        this.scopes = scopes;
    }

    unpack(syntax) {
        const scopeNames = (arr) => arr && arr.map(i => syntax.scopes[i]);
        // const contexts = (arr) => arr && arr.map(i => syntax.contexts);

        return {
            ...syntax,
            scope: scopeNames(syntax.scope),
            contexts: syntax.contexts.map(ctx => ({
                ...ctx,
                meta_scope: scopeNames(ctx.meta_scope) || [],
                meta_content_scope: scopeNames(ctx.meta_content_scope) || [],
                rules: ctx.rules.map(rule => ({
                    ...rule,
                    // push: contexts(rule.push),
                    // 'set': contexts(rule.set),
                    captures: rule.captures.map(scopeNames),
                })),
                patterns: ctx.rules.map(r => syntax.patterns[r.match]),
            })),
        };
    }

    loadUnlinked(relpath) {
        if (this.scopes.hasOwnProperty(relpath)) relpath = this.scopes[relpath];

        const path = this.path.joinpath(relpath);
        const buffer = path.readBinary();
        const data = loadYaml(buffer);

        return preprocess(data);
    }

    getPacked(relpath) {
        return process(this.loadUnlinked(relpath), this.loadUnlinked.bind(this));
    }

    // load(relpath) {
    //     const path = this.path.joinpath(relpath);
    //     const buffer = path.readBinary();
    //     const data = loadYaml(buffer);
    //     const syntax = process(preprocess(data));

    //     return this.unpack(syntax);
    // }
}

module.exports = { SyntaxProvider };
