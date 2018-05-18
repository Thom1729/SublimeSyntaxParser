class ParserState {
    constructor() {
        this.contextStack = [];
        this.scopeStack = [];
        this.clearedStack = [];

        this.i = 0;
        this.row = 0;
        this.col = 0;
    }

    *advance(point) {
        if (point < this.col) {
            throw new Error(`Tried to advance backward from ${col} to ${point}.`);
        } else if (point === this.col) {
            // pass
        } else {
            const d = point - this.col;
            yield [
                [this.i, this.i+d],
                this.scopeStack.join(''),
            ];
            this.col = point;
            this.i += d;
        }
    }

    nextLine() {
        this.row++;
        this.col = 0;
    }

    stackIsEmpty() {
        return this.contextStack.length === 0;
    }

    topContext() {
        return this.contextStack[this.contextStack.length - 1];
    }

    pushContext(ctx) {
        this.contextStack.push(ctx);
    }

    popContext() {
        this.contextStack.pop();
    }

    pushScopes(scopes) {
        this.scopeStack.push(...scopes);
    }

    popScopes(n) {
        if (n === 0) return;
        return this.scopeStack.splice(-n);
    }

    pushClear(n) {
        this.clearedStack.push(this.scopeStack.splice(
            n === true ? 0 : -n
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

    while (state.row < lineCount) {
        const line = lines[state.row];
        const rowLen = line.length;
        while (state.col < rowLen) {
            if (state.stackIsEmpty()) {
                state.pushContext(contexts['main']);
                state.pushScopes(baseScope);
            }

            const top = state.topContext();

            const match = top.scanner.findNextMatchSync(line, state.col);

            if (match) {
                const rule = top.rules[match.index];

                const { start, end } = match.captureIndices[0];
                yield* state.advance(start);

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
                    const nextPop = (captureEndStack.length)
                        ? captureEndStack[captureEndStack.length - 1][0]
                        : Infinity;

                    const nextPush = (captureIndex < captureCount)
                        ? match.captureIndices[captureIndex].start
                        : Infinity;

                    if (nextPop === Infinity && nextPush === Infinity) {
                        break;
                    } else if (nextPop <= nextPush) {
                        yield* state.advance(nextPop);

                        const count = captureEndStack.pop()[1];
                        state.popScopes(count);
                    } else {
                        yield* state.advance(nextPush);

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
                yield* state.advance(rowLen);
            }
        }
        state.nextLine();
    }
}

module.exports = { parse };

