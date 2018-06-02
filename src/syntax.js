const { Interner, splitScopes } = require('./util.js');

function process(syntax, provider) {
    const queue = [];
    const results = [];

    const foreignEnvironmentCache = new Map();
    function getForeignEnvironment(syntax, withPrototype) {
        if (withPrototype.length) {
            return new Environment(syntax.forInclusion(), withPrototype);
        } else {
            if (!foreignEnvironmentCache.has(syntax)) {
                foreignEnvironmentCache.set(syntax, new Environment(syntax.forInclusion()));
            }
            return foreignEnvironmentCache.get(syntax);
        }
    }

    class Environment {
        constructor(syntax, withPrototype = []) {
            this.syntax = syntax;
            this.withPrototype = withPrototype;
            this.nameLookup = new Map();
            this.protoRules = [];

            if (syntax.prototype) {
                const protoIndex = this.enqueue(syntax.prototype);
                for (let i = protoIndex; i < queue.length; i++) {
                    resolveIndex(i);
                }
                this.protoRules = results[protoIndex].rules;
            }
        }

        enqueueContext(context) {
            queue.push({ context, environment: this });
            return queue.length - 1;
        }

        enqueueNamedContext(name) {
            if (! this.nameLookup.has(name)) {
                this.nameLookup.set(name, this.enqueueContext(this.syntax.contexts[name]));
            }
            return this.nameLookup.get(name);
        }

        enqueue(contextRef) {
            if (typeof contextRef === 'object') {
                if (contextRef.scope) {
                    const includedSyntax = provider.getSyntaxForScope(contextRef.scope);
                    return getForeignEnvironment(includedSyntax, this.withPrototype).enqueueNamedContext(contextRef.context);
                } else {
                    return this.enqueueContext(contextRef);
                }
            } else {
                return this.enqueueNamedContext(contextRef);
            }
        }
    }

    function resolveIndex(i) {
        if (!results[i]) results[i] = resolveContext(queue[i]);
        return results[i];
    }

    const nullEnvironment = new Environment({contexts:{}});

    function resolveContext({ context, environment }) {
        const protoRules = (context.meta_include_prototype !== false) ? environment.protoRules : [];

        return {
            ...context,
            protoRules: [ ...environment.withPrototype, ...protoRules ],
            rules: Array.from(function*(){
                for (const rule of context.rules) {
                    if (rule.hasOwnProperty('match')) {
                        const nextEnvironment = rule.with_prototype
                            ? new Environment(environment.syntax, [ ...environment.withPrototype, ...rule.with_prototype ])
                            : environment;

                        let next;

                        if (rule.type === 'embed') {
                            // next = rule.next.map(c => c.scope ? c : nextEnvironment.enqueue(c));

                            next = Array.from(function*(){
                                for (const c of rule.next) {
                                    if (c.scope) {
                                        yield (
                                            nullEnvironment.enqueueContext({
                                                meta_content_scope: splitScopes(c.scope),
                                                meta_include_prototype: false,
                                                rules: [],
                                            })
                                        );
                                        yield c;
                                    } else {
                                        yield nextEnvironment.enqueue(c)
                                    }
                                }
                            }());
                        } else {
                            next = rule.next.map(c => nextEnvironment.enqueue(c));
                        }

                        if (rule.embed_scope) {
                            next.unshift(
                                nullEnvironment.enqueueContext({
                                    meta_content_scope: rule.embed_scope,
                                    meta_include_prototype: false,
                                    rules: [],
                                })
                            );
                        }

                        yield {
                            ...rule,
                            next,
                        };
                    } else if (rule.hasOwnProperty('include')) {
                        yield* resolveIndex(environment.enqueue(rule.include)).rules;
                    } else {
                        throw new TypeError(rule.toString());
                    }
                }
            }()),
        };
    }

    const baseEnvironment = new Environment(syntax);
    const mainContext = baseEnvironment.enqueue(syntax.main);

    const names = {};

    for (const name of Object.keys(syntax.contexts)) {
        names[name] = baseEnvironment.enqueueNamedContext(name);
    }

    for (let i = 0; i < queue.length; i++) resolveIndex(i);

    for (const context of results) {
        context.rules = [...context.protoRules, ...context.rules];
        delete context.protoRules;
    }

    return {
        ...syntax,
        contexts: results,
        mainContext,
        names,
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
            type: rule.type,
            pop: rule.pop,
            next: compactArray(rule.next),
            captures: compactArray(rule.captures.map(internScopes)),
            escape: rule.hasOwnProperty('escape') ? rule.escape : undefined,
            escape_captures: compactArray((rule.escape_captures||[]).map(internScopes)),
        })),
    }));

    return {
        mainContext: syntax.mainContext,
        scopes: scopeInterner.values,
        patterns: patternInterner.values,
        contexts: newNewContexts,
        names: syntax.names,
    };
}

module.exports = {
    process,
    pack,
};
