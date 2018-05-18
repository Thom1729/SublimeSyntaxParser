const { objMap, flatMap, recMap } = require('./util.js');

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

function splitScopes(scopes) { // TODO
    const ret = [];
    (scopes + ' ').replace(/\s*\S+\s*/g, part => { ret.push(part); });
    return ret;
}

function preprocess(syntax) {
    const newVariables = recMap(
        syntax.variables,
        (key, value, recurse) =>
            value.replace(/\{\{(\w+)\}\}/g, (all, v) => recurse(v))
    );

    const newContexts = recMap(syntax.contexts, (name, context, recurse) => {
        const newContext = {
            name,
            meta_scope: '',
            rules: [],

            meta: [],
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
                    newContext.meta_scope = meta_scope + ' ';
                    newContext.meta.push(...splitScopes(meta_scope));
                },

                meta_content_scope: ({ meta_content_scope, ...rest }) => {
                    assertNoExtras(rest);
                    assertMeta();
                    newContext.meta_content_scope = meta_content_scope + ' ';
                    newContext.meta.push(...splitScopes(meta_content_scope));
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
                        match,
                        match2: match.replace(/\{\{(\w+)\}\}/g, (all, v) => newVariables[v]),
                        captures: [],
                        pop: pop || Boolean(set) || false
                    };

                    push = push || set;

                    // if (scope) newRule.captures[0] = scope + ' ';
                    if (scope) newRule.captures[0] = scope + ' ';
                    if (captures) {
                        for (const [i, scope] of Object.entries(captures)) {
                            newRule.captures[i] = scope + ' ';
                        }
                    }

                    if (push) {
                        if (
                            typeof push === 'string' ||
                            (
                                Array.isArray(push) &&
                                typeof push[0] !== 'string' &&
                                ! Array.isArray(push[0])
                            )
                        ) {
                            push = [ push ];
                        }

                        newRule.push = push.map(nextRule => {
                            if (Array.isArray(nextRule)) {
                                const name = `${newContext.name}:${anonIndex}`;
                                anonIndex++;
                                recurse(name, nextRule);
                                return name;
                            } else {
                                return nextRule;
                            }
                        });
                    }

                    newContext.rules.push(newRule);
                }
            });
        }

        return newContext;
    });

    for (const ctx of Object.values(newContexts)) {
        for (const rule of ctx.rules) {
            if (rule.push) {
                for (const name of rule.push) {
                    const next = newContexts[name];
                    if (next.meta_scope) {
                        rule.captures[0] = next.meta_scope + rule.captures[0]
                    }
                }
            }
        }
    }

    for (const ctx of Object.values(newContexts)) {
        if (ctx.meta_content_scope) {
            ctx.meta_scope = (ctx.meta_scope || '') + ctx.meta_content_scope;
        }
    }

    const newNewContexts = recMap(newContexts, (name, context, recurse) => {
        return {
            ...context,
            rules: Array.from(flatMap(context.rules,
                rule =>
                    !rule.include ? [rule] :
                    rule.include.slice(0, 6) === 'scope:' ? [] :
                    recurse(rule.include).rules
            )),
        };
    });

    return {
        scope: syntax.scope + ' ',
        contexts: newNewContexts,
    };
}

module.exports = {
    preprocess,
};
