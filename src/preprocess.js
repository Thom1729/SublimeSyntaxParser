const { objMap, recMap2 } = require('./util.js');

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

function preprocess(syntax, loader) {
    const variables = recMap2(
        syntax.variables || {},
        (key, value, recurse) =>
            value.replace(/\{\{(\w+)\}\}/g, (all, v) => variables(v))
    );

    function simplifyContext(context, name) {
        const newContext = {
            name,
            rules: [],
        };

        let meta = true;

        function assertMeta() {
            if (!meta) throw new TypeError('Out of meta region.');
        }

        let i=0;
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
                        match: match.replace(/\{\{(\w+)\}\}/g, (all, v) => variables(v)),
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

                    function bar(c, j) {
                        return typeof c === 'object' ? simplifyContext(c, `${name}:${i},${j}`) : c;
                    }

                    if (push) newRule.push = normalizeContextList(push).map(bar);
                    if (set) newRule.set = normalizeContextList(set).map(bar);
                    if (pop) newRule.pop = pop;

                    newContext.rules.push(newRule);
                }
            });
            i++;
        }

        return newContext;
    }

    const simplified = objMap(syntax.contexts, simplifyContext);

    return {
        name: syntax.name,
        scope: splitScopes(syntax.scope),
        hidden: Boolean(syntax.hidden),
        contexts: simplified,
    };
}

module.exports = { preprocess };
