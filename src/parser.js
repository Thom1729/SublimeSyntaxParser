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
            throw new Error(`Tried to advance backward from ${this.row}:${this.col} to ${this.row}:${point}.`);
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

const { ScannerProvider } = require('./scannerProvider');

function* parse(syntax, text) {
    const { contexts, scope:baseScope } = syntax;
    const lines = text.split(/^/gm);
    const lineCount = lines.length;

    const state = new ParserState();
    const scannerProvider = new ScannerProvider();

    function *advance(point) {
        const line = lines[state.row];
        let l = state.col;
        let wasSpace = false;

        for (let i = state.col; i < point; i++) {
            if (line[i] === '\n') {
                yield* state.advance(i);
            }

            const isSpace = line[i] === ' ';
            if (wasSpace && ! isSpace) {
                yield* state.advance(i);
            }

            wasSpace = isSpace;
        }

        yield *state.advance(point);
    }

    while (state.row < lineCount) {
        const line = lines[state.row];
        const rowLen = line.length;

        while (state.col < rowLen) {
            if (state.stackIsEmpty()) {
                const ctx = contexts['main'];
                state.pushContext([
                    ctx,
                    scannerProvider.getScanner(ctx.rules.map(r => r.match2)),
                ]);
                state.pushScopes(baseScope);
            }

            const [top, scanner] = state.topContext();

            const match = scanner.findNextMatchSync(line, state.col);

            if (match) {
                const rule = top.rules[match.index];

                const pushed = (rule.push || []).map(name => contexts[name]);

                const { start: matchStart, end: matchEnd } = match.captureIndices[0];

                yield* advance(matchStart);

                if (rule.pop) {
                    state.popScopes(top.meta_content_scope.length);
                }

                for (const ctx of pushed) {
                    if (ctx.clear_scopes) state.pushClear(ctx.clear_scopes);
                    state.pushScopes(ctx.meta_scope);
                }

                const captureStack = [];

                for (const capture of match.captureIndices) {
                    if (capture.length === 0) { continue; }

                    let scopes = rule.captures[capture.index];

                    if (!scopes) {
                        if (rule.push) { // Why does this matter???
                            scopes = [];
                        } else {
                            continue;
                        }
                    }

                    const nextPush = capture.start;
                    if (nextPush < state.col) { continue; }
                    if (nextPush >= matchEnd) { break; }

                    while (captureStack.length) {
                        const [ {end}, scopes ] = captureStack[captureStack.length - 1];
                        const nextPop = Math.min(end, matchEnd);
                        if (nextPop <= nextPush) {
                            yield* advance(Math.max(nextPop, state.col));
                            captureStack.pop();
                            state.popScopes(scopes.length);
                        } else {
                            break;
                        }
                    }

                    yield* advance(nextPush);

                    captureStack.push([capture, scopes]);
                    state.pushScopes(scopes);
                }

                while (captureStack.length) {
                    const [ {end}, scopes ] = captureStack[captureStack.length - 1];
                    const nextPop = Math.min(end, matchEnd);
                    // if (nextPop <= nextPush) {
                        yield* advance(Math.max(nextPop, state.col));
                        captureStack.pop();
                        state.popScopes(scopes.length);
                    // } else {
                        // break;
                    // }
                }

                for (const ctx of pushed) {
                    state.popScopes(ctx.meta_scope.length);
                    if (ctx.clear_scopes) state.popClear();
                }

                if (rule.pop) {
                    state.popContext();
                    state.popScopes(top.meta_scope.length);

                    if (top.clear_scopes) state.popClear();
                }

                for (const ctx of pushed) {
                    if (ctx.clear_scopes) state.pushClear(ctx.clear_scopes);

                    // state.pushContext(ctx);
                    state.pushContext([
                        ctx,
                        scannerProvider.getScanner(ctx.rules.map(r => r.match2), match.captureIndices, line),
                    ]);

                    state.pushScopes(ctx.meta_scope);
                    state.pushScopes(ctx.meta_content_scope);
                }
            } else {
                yield* advance(rowLen);
            }
        }
        state.nextLine();
    }
}

module.exports = { parse };

