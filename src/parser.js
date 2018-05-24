class ParserState {
    constructor(syntax, lines) {
        this.syntax = syntax;
        this.lines = lines;
        this.scannerProvider = new ScannerProvider();

        this.contextStack = [];
        this.scopeStack = [ syntax.scope ];
        this.clearedStack = [];

        this.i = 0;
        this.row = 0;
        this.col = 0;
    }

    get line() { return this.lines[this.row]; }

    *advance(point) {
        if (point < this.col) {
            throw new Error(`Tried to advance backward from ${this.row}:${this.col} to ${this.row}:${point}.`);
        } else if (point === this.col) {
            // pass
        } else {
            const line = this.lines[this.row];

            let wasSpace = false;
            for (let i = this.col; i < point; i++) {
                if (line[i] === '\n') {
                    yield this._advance(i);
                }

                const isSpace = line[i] === ' ';
                if (wasSpace && ! isSpace) {
                    yield this._advance(i);
                }

                wasSpace = isSpace;
            }

            yield this._advance(point);
        }
    }

    _advance(point) {
        const d = point - this.col;
        this.col = point;
        this.i += d;
        return [
            [this.i-d, this.i],
            this.scopeStack.join(''),
        ];
    }

    *parseCapture(captureScopes, groups, tokenizeIfNoScope) {
        const matchEnd = groups[0].end;
        const captureStack = [];

        for (const capture of groups) {
            if (capture.length === 0) { continue; }

            let scopes = captureScopes[capture.index];

            if (!scopes) {
                if (tokenizeIfNoScope) { // Why does this matter???
                    scopes = [];
                } else {
                    continue;
                }
            }

            const nextPush = capture.start;
            if (nextPush < this.col) { continue; }
            if (nextPush >= matchEnd) { break; }

            while (captureStack.length) {
                const [ {end}, scopes ] = captureStack[captureStack.length - 1];
                const nextPop = Math.min(end, matchEnd);
                if (nextPop <= nextPush) {
                    yield* this.advance(Math.max(nextPop, this.col));
                    captureStack.pop();
                    this.popScopes(scopes.length);
                } else {
                    break;
                }
            }

            yield* this.advance(nextPush);

            captureStack.push([capture, scopes]);
            this.pushScopes(scopes);
        }

        while (captureStack.length) {
            const [ {end}, scopes ] = captureStack[captureStack.length - 1];
            const nextPop = Math.min(end, matchEnd);
            // if (nextPop <= nextPush) {
                yield* this.advance(Math.max(nextPop, this.col));
                captureStack.pop();
                this.popScopes(scopes.length);
            // } else {
                // break;
            // }
        }
    }

    *parseNextToken() {
        if (this.stackIsEmpty()) {
            this.pushContext(this.syntax.contexts[this.syntax.mainContext]);
            return;
        }

        const [top, scanner] = this.topContext();

        const match = scanner.findNextMatchSync(this.line, this.col);

        if (match) {
            const rule = top.rules[match.index];

            const pushed = (rule.push || rule.set || []).map(i => this.syntax.contexts[i]);
            // const pushed = (rule.push || rule.set || []);

            const matchStart = match.captureIndices[0].start;

            yield* this.advance(matchStart);

            if (rule.pop) {
                this.popScopes(top.meta_content_scope.length);
            }

            if (rule.push) {
                for (const ctx of pushed) {
                    if (ctx.clear_scopes) this.pushClear(ctx.clear_scopes);
                }
            }

            for (const ctx of pushed) {
                this.pushScopes(ctx.meta_scope);
            }

            yield* this.parseCapture(rule.captures, match.captureIndices, Boolean(rule.push || rule.pop || rule.set));

            for (let i=pushed.length-1; i>=0; i--) {
                this.popScopes(pushed[i].meta_scope.length);
            }

            if (rule.push) {
                for (let i=pushed.length-1; i>=0; i--) {
                    if (pushed[i].clear_scopes) this.popClear();
                }
            }

            if (rule.set) {
                this.popScopes(top.meta_content_scope.length);
            }

            if (rule.pop || rule.set) {
                this.popContext();
            }

            for (const ctx of pushed) {
                if (ctx.clear_scopes) this.pushClear(ctx.clear_scopes);

                this.pushContext(ctx, match.captureIndices);
            }
        } else {
            yield* this.advance(this.line.length);
        }
    }

    *parseLine() {
        const rowLen = this.line.length;
        while (this.col < rowLen) {
            yield* this.parseNextToken();
        }
        this.nextLine();
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

    pushContext(ctx, captures) {
        this.contextStack.push([
            ctx, this.scannerProvider.getScanner(ctx.patterns, captures, this.line),
        ]);
        this.pushScopes(ctx.meta_scope);
        this.pushScopes(ctx.meta_content_scope);
    }

    popContext() {
        const [top, _] = this.contextStack.pop();
        this.popScopes(top.meta_scope.length);
        if (top.clear_scopes) this.popClear();
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
    const lines = text.split(/^/gm);
    const lineCount = lines.length;

    const state = new ParserState(syntax, text.split(/^/gm));

    while (state.row < lineCount) {
        yield* state.parseLine();
    }
}

module.exports = { ParserState, parse };

