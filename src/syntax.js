const { Interner } = require('./util.js');

class Environment {
    constructor(queue, syntax) {
        this.queue = queue;
        this.syntax = syntax;
        this.nameLookup = new Map();
    }

    enqueueContext(context) {
        this.queue.push({ context, environment: this });
        return this.queue.length - 1;
    }

    enqueueNamedContext(name) {
        if (! this.nameLookup.has(name) && this.syntax.contexts[name]) {
            this.nameLookup.set(name, this.enqueueContext(this.syntax.contexts[name]));
        }
        return this.nameLookup.get(name);
    }
}

INCLUDE_SCOPE_EXPRESSION = /scope:([^#]*)(?:#(.*))?/;

function process(syntax, provider) {
    const queue = [];
    const results = [];

    function createEnvironment(syntax) {
        const environment = new Environment(queue, syntax);
        environment.protoRules = [];
        if (syntax.contexts.hasOwnProperty('prototype')) {
            const protoIndex = environment.enqueueNamedContext('prototype');
            for (let i = protoIndex; i < queue.length; i++) {
                resolveContext(i);
            }
            environment.protoRules = results[protoIndex].rules;
        }
        return environment;
    }

    function resolveContext(i) {
        if (results[i]) return;

        const { context, environment } = queue[i];

        const protoRules = (
            context.meta_include_prototype !== false &&
            (environment.syntax === syntax || context.name !== 'main')
        ) ? environment.protoRules : [];

        results[i] = {
            protoRules,
            ...context,
            rules: Array.from(function*(){
                for (const rule of context.rules) {
                    if (rule.hasOwnProperty('match')) {
                        yield {
                            ...rule,
                            next: rule.next.map(
                                c => (typeof c === 'object')
                                    ? environment.enqueueContext(c)
                                    : environment.enqueueNamedContext(c)
                            ),
                        };
                    } else if (rule.hasOwnProperty('include')) {
                        let includeEnvironment,
                            contextName;

                        if (INCLUDE_SCOPE_EXPRESSION.test(rule.include)) {
                            const match = INCLUDE_SCOPE_EXPRESSION.exec(rule.include);
                            const included = provider.getSyntaxForScope(match[1]).raw;
                            
                            includeEnvironment = createEnvironment(included);

                            contextName = match[2] || 'main';
                        } else {
                            includeEnvironment = environment;
                            contextName = rule.include;
                        }
                        const j = includeEnvironment.enqueueNamedContext(contextName);
                        resolveContext(j);
                        yield* results[j].rules;
                    } else {
                        throw new TypeError(rule.toString());
                    }
                }
            }()),
        };
    }

    const baseEnvironment = createEnvironment(syntax);
    for (const name of Object.keys(syntax.contexts)) {
        baseEnvironment.enqueueNamedContext(name);
    }
    for (let i = 0; i < queue.length; i++) resolveContext(i);

    for (const context of results) {
        context.rules = [...context.protoRules, ...context.rules];
    }

    return {
        ...syntax,
        contexts: results,
        mainContext: baseEnvironment.nameLookup.get('main'),
    };
}

function pack(syntax) {
    const scopeInterner = new Interner();
    const patternInterner = new Interner();

    function internScopes(scopes) {
        return scopes && scopes.map(s => scopeInterner.get(s));
    }

    const newNewContexts = syntax.contexts.map(ctx => ({
        ...ctx,
        meta_scope: internScopes(ctx.meta_scope),
        meta_content_scope: internScopes(ctx.meta_content_scope),
        rules: ctx.rules.map(rule => ({
            ...rule,
            match: patternInterner.get(rule.match),
            captures: rule.captures.map(internScopes),
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
