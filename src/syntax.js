const { objMap, flatMap, recMap, Interner } = require('./util.js');

// const metaProperties = new Set([
//     'meta_scope',
//     'meta_content_scope',
//     'meta_include_prototype',
//     'clear_scopes',
// ]);

function caseObjectShape(obj, cases) {
    for (const [ required, callback ] of Object.entries(cases)) {
        if (obj.hasOwnProperty(required)) {
            return callback(obj);
        }
    }
    assertNoExtras(obj);
}

function assertNoExtras(obj) {
    const extras = Object.keys(obj);
    if (extras.length) {
        throw new TypeError(`Unexpected keys ${extras.join(', ')}`);
    }
}

function normalizeContextList(list) {
    if (
        typeof list === 'string' ||
        (
            Array.isArray(list) &&
            typeof list[0] !== 'string' &&
            ! Array.isArray(list[0])
        )
    ) {
        list = [ list ];
    }

    return list;
}

function splitScopes(scopes) {
    if (!scopes) return undefined;
    const ret = [];
    (scopes + ' ').replace(/\S+\s*|\s+/g, part => { ret.push(part); });
    return ret;
}

function preprocess(syntax) {
    const variables = recMap(
        syntax.variables || {},
        (key, value, recurse) =>
            value.replace(/\{\{(\w+)\}\}/g, (all, v) => recurse(v))
    );

    const newContexts = recMap(syntax.contexts, (name, context, recurse) => {

        function getNamedContexts(list) {
            return normalizeContextList(list)
                .map(nextRule => {
                    if (Array.isArray(nextRule)) {
                        const name = `${newContext.name}:${anonIndex}`;
                        anonIndex++;
                        return recurse(name, nextRule).name;
                    } else {
                        return nextRule;
                    }
                });
        }

        const newContext = {
            name,
            rules: [],
        };

        let anonIndex = 0;
        let meta = true;

        function assertMeta() {
            if (!meta) throw new TypeError('Out of meta region.');
        }

        for (const originalRule of context) {
            caseObjectShape(originalRule, {
                meta_scope: ({ meta_scope, ...rest }) => {
                    assertNoExtras(rest);
                    assertMeta();
                    newContext.meta_scope = splitScopes(meta_scope);
                },

                meta_content_scope: ({ meta_content_scope, ...rest }) => {
                    assertNoExtras(rest);
                    assertMeta();
                    newContext.meta_content_scope = splitScopes(meta_content_scope);
                },

                clear_scopes: ({ clear_scopes, ...rest }) => {
                    assertNoExtras(rest);
                    assertMeta();
                    newContext.clear_scopes = clear_scopes;
                },

                meta_include_prototype: ({ meta_include_prototype, ...rest }) => {
                    assertNoExtras(rest);
                    assertMeta();
                    newContext.meta_include_prototype = meta_include_prototype;
                },

                include: ({ include, ...rest }) => {
                    meta = false
                    assertNoExtras(rest);
                    newContext.rules.push({ include });
                },

                match: ({ match, captures, scope, pop, push, set, ...rest }) => {
                    meta = false
                    assertNoExtras(rest);

                    if (set && (push || pop)) {
                        throw TypeError('Set is exclusive with Push and Pop.');
                    }

                    const newRule = {
                        match: match.replace(/\{\{(\w+)\}\}/g, (all, v) => variables[v]),
                        captures: [],
                    };

                    if (captures) {
                        for (const [i, scope] of Object.entries(captures)) {
                            newRule.captures[i] = splitScopes(scope);
                        }
                    }

                    if (scope) {
                        if (newRule.captures[0]) {
                            newRule.captures[0].unshift(...splitScopes(scope));
                        } else {
                            newRule.captures[0] = splitScopes(scope);
                        }
                    }

                    if (push) newRule.push = getNamedContexts(push);
                    if (set) newRule.set = getNamedContexts(set);
                    if (pop) newRule.pop = pop;

                    newContext.rules.push(newRule);
                }
            });
        }

        return newContext;
    });

    return {
        name: syntax.name,
        scope: splitScopes(syntax.scope),
        hidden: Boolean(syntax.hidden),
        contexts: newContexts,
    };
}

function process(syntax) {
    syntax = preprocess(syntax);

    const newContexts = recMap(syntax.contexts, (name, context, recurse) => {
        const rules = Array.from(flatMap(context.rules,
            rule =>
                !rule.include ? [rule] :
                rule.include.slice(0, 6) === 'scope:' ? [] :
                recurse(rule.include).rules
        ));

        return {
            ...context,
            rules,
        };
    });

    if (newContexts['prototype']) {
        const prototypeTainted = new Set();

        function taint(name) {
            if (prototypeTainted.has(name)) {
                return;
            } else {
                prototypeTainted.add(name);
                for (const rule of newContexts[name].rules) {
                    for (const name of (rule.push || rule.set || [])) {
                        taint(name);
                    }
                }
            }
        }

        taint('prototype');

        for (const context of Object.values(newContexts)) {
            if (context.meta_include_prototype !== false && !prototypeTainted.has(context.name)) {
                context.rules = [
                    ...newContexts['prototype'].rules,
                    ...context.rules,
                ];
            }
        }
    }

    return pack({
        ...syntax,
        contexts: newContexts,
    });
}

function pack(syntax) {
    const scopeInterner = new Interner();
    const patternInterner = new Interner();
    const contextInterner = new Interner();

    function internScopes(scopes) {
        return scopes && scopes.map(s => scopeInterner.get(s));
    }

    function internContexts(contexts) {
        return contexts && contexts.map(s => contextInterner.get(s));
    }

    const newNewContexts = objMap(syntax.contexts, ctx => ({
        ...ctx,
        meta_scope: internScopes(ctx.meta_scope),
        meta_content_scope: internScopes(ctx.meta_content_scope),
        rules: ctx.rules.map(rule => ({
            ...rule,
            push: internContexts(rule.push),
            'set': internContexts(rule.set),
            match: patternInterner.get(rule.match),
            captures: rule.captures.map(internScopes),
        })),
    }));

    return {
        mainContext: contextInterner.get('main'),
        scope: internScopes(syntax.scope),
        scopes: scopeInterner.values,
        patterns: patternInterner.values,
        contexts: contextInterner.values.map(name => newNewContexts[name] || null),
    };
}

module.exports = {
    preprocess,
    process,
};
