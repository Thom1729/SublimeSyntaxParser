const { Path } = require('../lib/pathlib');

const { loadYaml } = require('./load-yaml');
const { preprocess } = require('./preprocess');
const { process, pack } = require('./syntax');

class SyntaxDefinition {
    constructor(props) {
        Object.assign(this, props);

        this.forInclusion = this.memoize(() => {
            const syntax = this.raw;
            return {
                ...syntax,
                contexts: {
                    ...syntax.contexts,
                    main: {
                        ...syntax.contexts.main,
                        meta_content_scope: [ ...(syntax.scope), ...(syntax.contexts.main.meta_content_scope || []) ],
                    },
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
}

async function loadSublimeSyntax(path) {
    const buffer = await path.readBinary();
    const data = loadYaml(buffer);

    return preprocess(data);
}

class SyntaxProvider {
    constructor(scannerProvider) {
        this.syntaxes = [];
        this.scopes = {};
        this.extensions = {};

        this.compiled = new Map();
    }

    async addDirectory(directory) {
        const paths = await new Path(directory).glob('**/*.sublime-syntax');

        const definitions = await Promise.all(
            paths.map(async function(path) {
                return new SyntaxDefinition({
                    path,
                    raw: await loadSublimeSyntax(path),
                });
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

    unpack(syntax) {
        const scopeNames = (arr) => arr && arr.map(i => syntax.scopes[i]);
        const mapCaptures = (arr) => arr && arr.map(scopeNames);

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
                    captures: mapCaptures(rule.captures) || [],
                    escape_captures: mapCaptures(rule.escape_captures) || [],
                })),
                patterns: ctx.patterns.map(p => syntax.patterns[p]),
            })),
        };
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
