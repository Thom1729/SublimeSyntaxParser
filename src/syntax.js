const { objMap, Interner } = require('./util.js');

function process(name, getSyntax) {
    const syntax = getSyntax(name);

    const contextInterner = new Interner();
    for (const name of Object.keys(syntax.contexts)) contextInterner.get(name);

    const queue = [];
    const results = [];

    function doStuff(i) {
        if (results[i]) return results[i];
        const { context, suppressPrototype } = queue[i];

        function getNamedContext(nextRule) {
            if (typeof nextRule === 'object') {
                queue.push({
                    context: nextRule,
                    suppressPrototype: suppressPrototype || nextRule.name === 'prototype',
                });
                return queue.length - 1;

                return enqueue(nextRule);
            } else {
                return contextInterner.get(nextRule);
            }
        }

        results[i] = {
            ...context,
            rules: Array.from(function*(){
                for (const rule of context.rules) {
                    if (rule.hasOwnProperty('match')) {
                        yield {
                            ...rule,
                            next: rule.next.map(getNamedContext),
                        };
                    } else if (rule.hasOwnProperty('include')) {
                        if (rule.include.slice(0, 6) === 'scope:') {
                            // TODO
                        } else {
                            const j = contextInterner.get(rule.include);
                            doStuff(j);
                            yield* results[j].rules;
                        }
                    } else {
                        throw new TypeError(rule.toString());
                    }
                }
            }()),
        };
    }

    queue.push(...contextInterner.values.map(name => ({ context: syntax.contexts[name] })));

    for (i=0; i < queue.length; i++) doStuff(i);

    if (syntax.contexts.hasOwnProperty('prototype')) {
        const protoRules = results[contextInterner.get('prototype')].rules;

        const prototypeTainted = new Set();

        function taint(i) {
            if (!prototypeTainted.has(i)) {
                prototypeTainted.add(i);
                for (const rule of results[i].rules) {
                    for (const i of (rule.next || [])) {
                        taint(i);
                    }
                }
            }
        }

        taint(contextInterner.get('prototype'));

        results.forEach((context, i) => {
            if (context.meta_include_prototype !== false && !prototypeTainted.has(i)) {
                context.rules = [
                    ...protoRules,
                    ...context.rules,
                ];
            }
        });
    }
    return {
        ...syntax,
        contexts: results,
        mainContext: contextInterner.get('main'),
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
