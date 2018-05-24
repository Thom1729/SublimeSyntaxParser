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

function preprocess(syntax) {
    const newVariables = recMap(
        syntax.variables || {},
        (key, value, recurse) =>
            value.replace(/\{\{(\w+)\}\}/g, (all, v) => recurse(v))
    );

    const scopeInterner = new Interner();
    const patternInterner = new Interner();

    function splitScopes(scopes) {
        if (!scopes) return undefined;
        const ret = [];
        (scopes + ' ').replace(/\S+\s*|\s+/g, part => { ret.push(scopeInterner.get(part)); });
        return ret;
    }

    const newContexts = recMap(syntax.contexts, (name, context, recurse) => {

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

            return list.map(nextRule => {
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
                        match: patternInterner.get(match.replace(/\{\{(\w+)\}\}/g, (all, v) => newVariables[v])),
                        captures: [],
                        pop: pop,
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

                    if (push) {
                        newRule.push = normalizeContextList(push);
                    }

                    if (set) {
                        newRule.set = normalizeContextList(set);
                    }

                    newContext.rules.push(newRule);
                }
            });
        }

        return newContext;
    });

    const newNewContexts = recMap(newContexts, (name, context, recurse) => {
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

    if (newNewContexts['prototype']) {
        const prototypeTainted = new Set();

        function taint(name) {
            if (prototypeTainted.has(name)) {
                return;
            } else {
                prototypeTainted.add(name);
                for (const rule of newNewContexts[name].rules) {
                    for (const name of (rule.push || rule.set || [])) {
                        taint(name);
                    }
                }
            }
        }

        taint('prototype');

        for (const context of Object.values(newNewContexts)) {
            if (context.meta_include_prototype !== false && !prototypeTainted.has(context.name)) {
                context.rules = [
                    ...newNewContexts['prototype'].rules,
                    ...context.rules,
                ];
            }
        }
    }

    return {
        scope: splitScopes(syntax.scope),
        scopes: scopeInterner.values,
        patterns: patternInterner.values,
        contexts: newNewContexts,
    };
}

module.exports = {
    preprocess,
};
