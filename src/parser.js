class ParserState {
    constructor(syntax, lines, syntaxProvider) {
        this.syntax = syntax;
        this.lines = lines;
        this.syntaxProvider = syntaxProvider;
        this.scannerProvider = new ScannerProvider();

        this.contextStack = [];
        this.scopeStack = [ syntax.scope ];
        this.clearedStack = [];
        this.escapeStack = [];

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

    *parseNextToken(line, level=0) {
        while (true) {
            if (this.stackIsEmpty()) {
                this.pushContext(this.syntax.contexts[this.syntax.mainContext]);
            }

            let nextEscape;
            for (let j=level; j < this.escapeStack.length; j++) {
                const [contextLevel, escapeScanner, scopes] = this.escapeStack[j];
                const match = escapeScanner.findNextMatchSync(line, this.col);
                if (match) {
                    nextEscape = match.captureIndices[0].start;

                    yield* this.parseNextToken(line.slice(0, nextEscape), j+1);

                    yield* this.advance(nextEscape);

                    while (this.contextStack.length > contextLevel) {
                        this.popContext();
                    }

                    yield* this.parseCapture(scopes, match.captureIndices, true);

                    break
                }
            }

            const [top, scanner] = this.topContext();

            const matchLine = (nextEscape !== undefined) ? line.slice(0, nextEscape) : line;

            const match = scanner.findNextMatchSync(matchLine, this.col);

            if (!match) return;

            const rule = top.rules[match.index];

            const pushed = rule.next.map(i => this.syntax.contexts[i]);

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
                if (this.escapeStack.length < level) return;
            }

            if (rule.escape) {
                this.escapeStack.push([
                    this.scopeStack.length,
                    this.scannerProvider.getScanner([rule.escape], match.captureIndices, line),
                    rule.escape_captures,
                ]);
            }

            if (rule.embed) {
                const ctx = pushed[0];
                if (ctx.clear_scopes) this.pushClear(ctx.clear_scopes);

                this.pushContext(ctx, match.captureIndices);
            } else {
                for (const ctx of pushed) {
                    if (ctx.clear_scopes) this.pushClear(ctx.clear_scopes);

                    this.pushContext(ctx, match.captureIndices);
                }
            }
        }
    }

    *parseLine() {
        const rowLen = this.line.length;

        yield* this.parseNextToken(this.line);

        yield* this.advance(rowLen);

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
            ctx,
            this.scannerProvider.getScanner(ctx.patterns, captures, this.line),
        ]);
        this.pushScopes(ctx.meta_scope);
        this.pushScopes(ctx.meta_content_scope);
    }

    popContext() {
        const [top, _] = this.contextStack.pop();
        this.popScopes(top.meta_scope.length);
        if (top.clear_scopes) this.popClear();

        if (this.escapeStack.length && this.escapeStack[this.escapeStack.length-1][0] >= this.contextStack.length) {
            this.escapeStack.pop();
        }
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

function* parse(syntax, text, syntaxProvider) {
    const lines = text.split(/^/gm);
    const lineCount = lines.length;

    const state = new ParserState(syntax, text.split(/^/gm, syntaxProvider));

    while (state.row < lineCount) {
        yield* state.parseLine();
    }
}

module.exports = { ParserState, parse };

