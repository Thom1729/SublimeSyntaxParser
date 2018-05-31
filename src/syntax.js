const { Interner } = require('./util.js');

// class Environment {
//     constructor(queue, syntax, withPrototype) {
//         this.queue = queue;
//         this.syntax = syntax;
//         this.withPrototype = withPrototype;
//         this.nameLookup = new Map();
//         this.protoRules = [];
//     }

//     enqueueContext(context) {
//         this.queue.push({ context, environment: this });
//         return this.queue.length - 1;
//     }

//     enqueueNamedContext(name) {
//         if (! this.nameLookup.has(name) && this.syntax.contexts[name]) {
//             this.nameLookup.set(name, this.enqueueContext(this.syntax.contexts[name]));
//         }
//         return this.nameLookup.get(name);
//     }
// }

const INCLUDE_SCOPE_EXPRESSION = /scope:([^#]*)(?:#(.*))?/;

function patchForeignSyntax(syntax) {
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
}

function process(syntax, provider) {
    const queue = [];
    const results = [];

    class Environment {
        constructor(syntax, withPrototype) {
            this.syntax = syntax;
            this.withPrototype = withPrototype;
            this.nameLookup = new Map();
            this.protoRules = [];

            if (syntax.contexts.hasOwnProperty('prototype')) {
                const protoIndex = this.enqueueNamedContext('prototype');
                for (let i = protoIndex; i < queue.length; i++) {
                    resolveContext(i);
                }
                this.protoRules = results[protoIndex].rules;
            }
        }

        enqueueContext(context) {
            queue.push({ context, environment: this });
            return queue.length - 1;
        }

        enqueueNamedContext(name) {
            if (! this.nameLookup.has(name) && this.syntax.contexts[name]) {
                this.nameLookup.set(name, this.enqueueContext(this.syntax.contexts[name]));
            }
            return this.nameLookup.get(name);
        }

        enqueue(contextRef) {
            if (typeof contextRef === 'object') {
                return this.enqueueContext(contextRef);
            } else if (INCLUDE_SCOPE_EXPRESSION.test(contextRef)) {
                const match = INCLUDE_SCOPE_EXPRESSION.exec(contextRef);

                // const includeEnvironment =
                //     this.withPrototype ? 
                
                const includeEnvironment = getForeignEnvironment(provider.getSyntaxForScope(match[1]).raw, this.withPrototype);

                return includeEnvironment.enqueueNamedContext(match[2] || 'main');
            } else {
                return this.enqueueNamedContext(contextRef);
            }
        }
    }

    const environmentCache = new Map();
    function getForeignEnvironment(syntax, withPrototype) {
        if (withPrototype) {
            return new Environment(patchForeignSyntax(syntax), withPrototype);
        } else {
            if (!environmentCache.has(syntax)) {
                environmentCache.set(syntax, new Environment(patchForeignSyntax(syntax)));
            }
            return environmentCache.get(syntax);
        }
    }

    function resolveContext(i) {
        if (results[i]) return;

        const { context, environment } = queue[i];

        const protoRules = (context.meta_include_prototype !== false) ? environment.protoRules : [];
        const withProtoRules = environment.withPrototype || [];

        results[i] = {
            protoRules: [ ...withProtoRules, ...protoRules ],
            ...context,
            rules: Array.from(function*(){
                for (const rule of context.rules) {
                    if (rule.hasOwnProperty('match')) {
                        let nextEnvironment = environment;
                        if (rule.with_prototype) {
                            nextEnvironment = new Environment(environment.syntax, rule.with_prototype);
                        }
                        yield {
                            ...rule,
                            next: rule.next.map(c => nextEnvironment.enqueue(c)),
                        };
                    } else if (rule.hasOwnProperty('include')) {
                        const j = environment.enqueue(rule.include);
                        resolveContext(j);
                        yield* results[j].rules;
                    } else {
                        throw new TypeError(rule.toString());
                    }
                }
            }()),
        };
    }

    const baseEnvironment = new Environment(syntax);
    for (const name of Object.keys(syntax.contexts)) {
        baseEnvironment.enqueueNamedContext(name);
    }
    for (let i = 0; i < queue.length; i++) resolveContext(i);

    for (const context of results) {
        context.rules = [...context.protoRules, ...context.rules];
        delete context.protoRules;
    }

    return {
        ...syntax,
        contexts: results,
        mainContext: baseEnvironment.nameLookup.get('main'),
    };
}

const compactArray = arr => (arr.length ? arr : undefined);

function pack(syntax) {
    const scopeInterner = new Interner();
    const patternInterner = new Interner();

    function internScopes(scopes) {
        return scopes && scopes.map(s => scopeInterner.get(s));
    }

    const newNewContexts = syntax.contexts.map(ctx => ({
        name: ctx.name,
        meta_scope: internScopes(ctx.meta_scope),
        meta_content_scope: internScopes(ctx.meta_content_scope),
        clear_scopes: ctx.clear_scopes,
        patterns: ctx.rules.map(rule => patternInterner.get(rule.match)),
        rules: ctx.rules.map(rule => ({
            push: rule.push,
            pop: rule.pop,
            set: rule.set,
            next: compactArray(rule.next),
            captures: compactArray(rule.captures.map(internScopes)),
        })),
    }));

    return {
        mainContext: syntax.mainContext,
        scope: internScopes(syntax.scope),
        scopes: scopeInterner.values,
        patterns: patternInterner.values,
        contexts: newNewContexts,
    };
}

module.exports = {
    process,
    pack,
};
