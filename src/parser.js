class ParserState {
    constructor() {
        this.stack = [];
        this.scopeStack = [];
        this.clearedStack = [];
    }

    topContext() {
        return this.stack[this.stack.length - 1];
    }

    pushContext(ctx) {
        this.stack.push(ctx);
    }

    popContext() {
        this.stack.pop();
    }

    pushScopes(scopes) {
        this.scopeStack.push(...scopes);
    }

    popScopes(n) {
        return this.scopeStack.splice(-n);
    }

    pushClear(n) {
        this.clearedStack.push(this.popScopes(
            n === true ? 0 : n
        ));
    }

    popClear() {
        this.pushScopes( this.clearedStack.pop() );
    }
}

function* parse(syntax, text) {

    const { contexts, scope:baseScope } = syntax;
    const lines = text.split(/^/gm);
    const lineCount = lines.length;

    const state = new ParserState();

    let row = 0, col = 0, i = 0;

    function* advance(point) {
        if (point < col) {
            throw new Error(`Tried to advance backward from ${col} to ${point}.`);
        } else if (point === col) {
            // pass
        } else {
            const d = point - col;
            yield [
                [i, i+d],
                state.scopeStack.join(''),
            ];
            col = point;
            i += d;
        }
    }

    while (row < lineCount) {
        const line = lines[row];
        const rowLen = line.length;
        while (col < rowLen) {
            if (state.stack.length === 0) {
                state.pushContext(contexts['main']);
                state.pushScopes(baseScope);
            }

            const top = state.topContext();

            const match = top.scanner.findNextMatchSync(line, col);

            if (match) {
                const rule = top.rules[match.index];

                const { start, end } = match.captureIndices[0];
                yield* advance(start);

                if (rule.pop) {
                    if (top.meta_content_scope.length) {
                        state.popScopes(top.meta_content_scope.length);
                    }
                }

                if (rule.push) {
                    for (const name of rule.push) {
                        const ctx = contexts[name];
                        if (ctx.clear_scopes) state.pushClear(ctx.clear_scopes);
                        state.pushScopes(ctx.meta_scope);
                    }
                }

                let captureIndex = 0;
                const captureCount = rule.captures.length;
                const captureEndStack = [];

                while (
                    (captureIndex < captureCount) && (! rule.captures[captureIndex])
                ) {captureIndex++;}

                while (true) {
                    let nextPop = Infinity;
                    if (captureEndStack.length) {
                        nextPop = captureEndStack[captureEndStack.length - 1][0];
                    }

                    let nextPush = Infinity;
                    if (captureIndex < captureCount) {
                        nextPush = match.captureIndices[captureIndex].start;
                    }

                    if (nextPop === Infinity && nextPush === Infinity) {
                        break;
                    }

                    else if (nextPop <= nextPush) {
                        yield* advance(nextPop);

                        const count = captureEndStack.pop()[1];
                        state.popScopes(count);
                    } else {
                        yield* advance(nextPush);

                        captureEndStack.push([
                            match.captureIndices[captureIndex].end,
                            rule.captures[captureIndex].length,
                        ]);
                        state.pushScopes(rule.captures[captureIndex]);

                        do { captureIndex++; } while (
                            (captureIndex < captureCount) && (! rule.captures[captureIndex])
                        );
                    }
                }

                if (rule.push) {
                    for (const name of rule.push) {
                        const ctx = contexts[name];
                        if (ctx.meta_scope.length) state.popScopes(ctx.meta_scope.length);
                        if (ctx.clear_scopes) state.popClear();
                    }
                }

                if (rule.pop) {
                    state.popContext();

                    if (top.meta_scope.length) {
                        state.popScopes(top.meta_scope.length);
                    }

                    if (top.clear_scopes) state.popClear();
                }

                if (rule.push) {
                    for (const name of rule.push) {
                        const ctx = contexts[name];

                        if (ctx.clear_scopes) state.pushClear(ctx.clear_scopes);

                        state.pushContext(ctx);
                        state.pushScopes(ctx.meta_scope);
                        state.pushScopes(ctx.meta_content_scope);
                    }
                }
            } else {
                yield* advance(rowLen);
            }
        }
        row++;
        col = 0;
    }
}

module.exports = { parse };

