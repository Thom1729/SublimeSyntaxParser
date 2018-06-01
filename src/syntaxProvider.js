const { Path } = require('../lib/pathlib');

const { loadYaml } = require('./load-yaml');
const { preprocess } = require('./preprocess');
const { process, pack } = require('./syntax');
const { objFromPairs } = require('./util');

class SyntaxDefinition {
    constructor(props, provider) {
        Object.assign(this, props);
        this.provider = provider;

        this.forInclusion = this.memoize(() => {
            const syntax = this.raw;
            return {
                ...syntax,
                contexts: {
                    ...syntax.contexts,
                    main: syntax.include,
                },
            };
        });
    }

    memoize(method) {
        const key = '_'+method;
        return () => {
            if (! this.hasOwnProperty(key)) {
                this[key] = method();
            }
            return this[key];
        }
    };

    compiled() {
        if (!this._compiled) {
            this._compiled = pack(process(this.raw, this.provider));
        }
        return this._compiled;
    }

    unpacked() {
        if (!this._unpacked) {
            this._unpacked = unpack(this.compiled());
        }
        return this._unpacked;
    }
}

async function loadSublimeSyntax(path) {
    const buffer = await path.readBinary();
    const data = loadYaml(buffer);

    return preprocess(data);
}

function unpack(syntax) {
    const scopeNames = (arr) => arr && arr.map(i => syntax.scopes[i]);
    const mapCaptures = (arr) => arr && arr.map(scopeNames);

    const ret = {
        ...syntax,
        scope: scopeNames(syntax.scope),
        contexts: syntax.contexts.map(ctx => ({
            ...ctx,
            meta_scope: scopeNames(ctx.meta_scope) || [],
            meta_content_scope: scopeNames(ctx.meta_content_scope) || [],
            rules: ctx.rules.map(rule => ({
                ...rule,
                next: rule.next || [],
                captures: mapCaptures(rule.captures) || [],
                escape_captures: mapCaptures(rule.escape_captures) || [],
            })),
            patterns: ctx.patterns.map(p => syntax.patterns[p]),
        })),
        names: objFromPairs(syntax.contexts.map((ctx, i) => [ctx.name, i])),
    };

    for (const ctx of ret.contexts) {
        for (const rule of ctx.rules) {
            rule.next = rule.next.map(i => {
                if (typeof i === 'object') {
                    return i;
                } else {
                    return ret.contexts[i];
                }
            });
        }
    }

    return ret;
}

class SyntaxProvider {
    constructor(scannerProvider) {
        this.syntaxes = [];
        this.scopes = {};
        this.extensions = {};

    }

    async addDirectory(directory) {
        const paths = await new Path(directory).glob('**/*.sublime-syntax');

        const self = this;
        const definitions = await Promise.all(
            paths.map(async function(path) {
                return new SyntaxDefinition({
                    path,
                    raw: await loadSublimeSyntax(path),
                }, self);
            })
        );

        for (const def of definitions) {
            this.addSyntax(def);
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

    getSyntaxForScope(scope) {
        return this.scopes[scope.trim()];
    }

    getSyntaxForExtension(extension) {
        extension = extension.trim();
        if (extension[0] === '.') extension = extension.slice(1);
        return this.extensions[extension];
    }
}

module.exports = { SyntaxProvider };
