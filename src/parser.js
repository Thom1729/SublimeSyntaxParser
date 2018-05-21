class ParserState {
    constructor(syntax, lines) {
        this.syntax = syntax;
        this.lines = lines;
        this.scannerProvider = new ScannerProvider();

        this.contextStack = [];
        this.scopeStack = [];
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

    *parseNextToken() {
        if (this.stackIsEmpty()) {
            this.pushContext(this.syntax.contexts['main']);
            this.pushScopes(this.syntax.scope);
        }

        const [top, scanner] = this.topContext();

        const match = scanner.findNextMatchSync(this.line, this.col);

        if (match) {
            const rule = top.rules[match.index];

            const pushed = (rule.push || []).map(name => this.syntax.contexts[name]);

            const { start: matchStart, end: matchEnd } = match.captureIndices[0];

            yield* this.advance(matchStart);

            if (rule.pop) {
                this.popScopes(top.meta_content_scope.length);
            }

            for (const ctx of pushed) {
                if (ctx.clear_scopes) this.pushClear(ctx.clear_scopes);
                this.pushScopes(ctx.meta_scope);
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

            for (const ctx of pushed) {
                this.popScopes(ctx.meta_scope.length);
                if (ctx.clear_scopes) this.popClear();
            }

            if (rule.pop) {
                this.popContext();
                this.popScopes(top.meta_scope.length);

                if (top.clear_scopes) this.popClear();
            }

            for (const ctx of pushed) {
                if (ctx.clear_scopes) this.pushClear(ctx.clear_scopes);

                this.pushContext(ctx, match.captureIndices);
                this.pushScopes(ctx.meta_scope);
                this.pushScopes(ctx.meta_content_scope);
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
    const lines = text.split(/^/gm);
    const lineCount = lines.length;

    const state = new ParserState(syntax, text.split(/^/gm));

    while (state.row < lineCount) {
        yield* state.parseLine();
    }
}

module.exports = { parse };

