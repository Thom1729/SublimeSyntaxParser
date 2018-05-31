const { Interner } = require('./util.js');

const INCLUDE_SCOPE_EXPRESSION = /scope:([^#]*)(?:#(.*))?/;

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

            if (syntax.contexts.hasOwnProperty('prototype')) {
                const protoIndex = this.enqueueNamedContext('prototype');
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
                return this.enqueueContext(contextRef);
            } else if (INCLUDE_SCOPE_EXPRESSION.test(contextRef)) {
                const match = INCLUDE_SCOPE_EXPRESSION.exec(contextRef);

                const includedSyntax = provider.getSyntaxForScope(match[1]);
                const includeEnvironment = getForeignEnvironment(includedSyntax, this.withPrototype);

                return includeEnvironment.enqueueNamedContext(match[2] || 'main');
            } else {
                return this.enqueueNamedContext(contextRef);
            }
        }
    }

    function resolveIndex(i) {
        if (!results[i]) results[i] = resolveContext(queue[i]);
        return results[i];
    }

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

                        yield {
                            ...rule,
                            next: rule.next.map(c => nextEnvironment.enqueue(c)),
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
    for (const name of Object.keys(syntax.contexts)) {
        baseEnvironment.enqueueNamedContext(name);
    }
    for (let i = 0; i < queue.length; i++) resolveIndex(i);

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
