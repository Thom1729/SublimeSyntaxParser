const { objMap, Interner } = require('./util.js');

function process(name, getSyntax) {
    const syntax = getSyntax(name);

    const nameLookup = new Map();
    const queue = [];
    const results = [];

    function enqueueContext(context) {
        queue.push({ context });
        return queue.length - 1;
    }

    function enqueueNamedContext(name) {
        if (! nameLookup.has(name)) {
            nameLookup.set(name, enqueueContext(syntax.contexts[name]));
        }
        return nameLookup.get(name);
    }

    function resolveContext(i) {
        if (results[i]) return;

        const { context } = queue[i];

        results[i] = {
            ...context,
            rules: Array.from(function*(){
                for (const rule of context.rules) {
                    if (rule.hasOwnProperty('match')) {
                        yield {
                            ...rule,
                            next: rule.next.map(
                                c => (typeof c === 'object') ? enqueueContext(c) : enqueueNamedContext(c)
                            ),
                        };
                    } else if (rule.hasOwnProperty('include')) {
                        if (rule.include.slice(0, 6) === 'scope:') {
                            // TODO
                        } else {
                            const j = enqueueNamedContext(rule.include);
                            resolveContext(j);
                            yield* results[j].rules;
                        }
                    } else {
                        throw new TypeError(rule.toString());
                    }
                }
            }()),
        };
    }

    let i = 0;
    let protoIndex = 0;

    if (syntax.contexts.hasOwnProperty('prototype')) {
        enqueueNamedContext('prototype');
        for (; i < queue.length; i++) resolveContext(i);
        protoIndex = i;
    }

    for (const name of Object.keys(syntax.contexts)) {
        enqueueNamedContext(name);
        for (; i < queue.length; i++) resolveContext(i);
    }

    if (syntax.contexts.hasOwnProperty('prototype')) {
        const protoRules = results[nameLookup.get('prototype')].rules;

        results.forEach((context, i) => {
            if (context.meta_include_prototype !== false && i >= protoIndex) {
                context.rules = [...protoRules, ...context.rules];
            }
        });
    }
    return {
        ...syntax,
        contexts: results,
        mainContext: nameLookup.get('main'),
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
