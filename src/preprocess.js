const { objMap, recMap, splitScopes } = require('./util.js');

const INCLUDE_SCOPE_EXPRESSION = /scope:([^#]*)(?:#(.*))?/;

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
            list.length > 0 &&
            typeof list[0] !== 'string' &&
            ! Array.isArray(list[0])
        )
    ) {
        list = [ list ];
    }

    return list;
}

function preprocess(syntax) {
    const variables = recMap(
        syntax.variables || {},
        (key, value, recurse) => replaceVariables(value)
    );

    const replaceVariables = (regexp) => regexp.replace(/\{\{(\w+)\}\}/g, (all, v) => variables(v));

    function simplifyContext(context, name) {
        const newContext = {
            name,
            rules: [],
        };

        let meta = true;

        function assertMeta() {
            if (!meta) throw new TypeError('Out of meta region.');
        }

        function resolveContext(contextRef, name) {
            if (Array.isArray(contextRef)) {
                return simplifyContext(contextRef, name);
            } else if (INCLUDE_SCOPE_EXPRESSION.test(contextRef)) {
                const match = INCLUDE_SCOPE_EXPRESSION.exec(contextRef);
                return {
                    scope: match[1],
                    context: match[2] || 'main',
                };
            } else {
                return contextRef;
            }
        }

        let i=0;
        for (const originalRule of context) {
            caseObjectShape(originalRule, {
                meta_scope: ({ meta_scope, ...rest }) => {
                    // assertNoExtras(rest);
                    assertMeta();
                    newContext.meta_scope = splitScopes(meta_scope);
                },

                meta_content_scope: ({ meta_content_scope, ...rest }) => {
                    // assertNoExtras(rest);
                    assertMeta();
                    newContext.meta_content_scope = splitScopes(meta_content_scope);
                },

                clear_scopes: ({ clear_scopes, ...rest }) => {
                    // assertNoExtras(rest);
                    assertMeta();
                    newContext.clear_scopes = clear_scopes;
                },

                meta_include_prototype: ({ meta_include_prototype, ...rest }) => {
                    // assertNoExtras(rest);
                    assertMeta();
                    newContext.meta_include_prototype = meta_include_prototype;
                },

                include: ({ include, ...rest }) => {
                    meta = false
                    assertNoExtras(rest);
                    newContext.rules.push({ include: resolveContext(include) });
                },

                match: ({ match, captures, scope, pop, push, set, with_prototype, embed, embed_scope, escape, escape_captures, ...rest }) => {
                    meta = false
                    assertNoExtras(rest);

                    if (set && (push || pop)) {
                        throw TypeError('Set is exclusive with Push and Pop.');
                    }
                    if (embed && (push || set)) {
                        throw TypeError('Embed is exclusive with Push and Set.');
                    }

                    const newRule = {
                        match: replaceVariables(match),
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

                    if (pop) newRule.pop = pop;

                    newRule.type = push ? 'push' : set ? 'set' : embed ? 'embed' : null;

                    newRule.next = normalizeContextList(push || set || embed || []).map( (c, j) =>
                        resolveContext(c, `${name}:${i},${j}`)
                    );

                    if (with_prototype) newRule.with_prototype = simplifyContext(with_prototype).rules;

                    if (embed) {
                        if (newRule.next.every(c => (!c.scope))) newRule.type = 'push';
                    }
                    
                    if (embed_scope) newRule.embed_scope = splitScopes(embed_scope);

                    if (escape) newRule.escape = replaceVariables(escape);
                    if (escape_captures) {
                        newRule.escape_captures = []
                        for (const [i, scope] of Object.entries(escape_captures)) {
                            newRule.escape_captures[i] = splitScopes(scope);
                        }
                    }

                    newContext.rules.push(newRule);
                }
            });
            i++;
        }

        return newContext;
    }

    const simplified = objMap(syntax.contexts, simplifyContext);

    const baseScopes = splitScopes(syntax.scope);

    return {
        ...syntax,
        scope: baseScopes,
        hidden: Boolean(syntax.hidden),
        contexts: simplified,

        prototype: simplified.hasOwnProperty('prototype') ? 'prototype' : undefined,

        main: {
            ...simplified.main,
            clear_scopes: undefined,
            meta_scope: [...baseScopes, ...(simplified.main.meta_scope||[])]
        },

        include: {
            ...simplified.main,
            meta_content_scope: baseScopes,
        },
    };
}

module.exports = { preprocess };
