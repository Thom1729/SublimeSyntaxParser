const CLASS_SPACE = 0;
const CLASS_WORD = 1;
const CLASS_PUNCTUATION = 2;
const CLASS_NEWLINE = 3;
const CLASS_OTHER = 4;

function classify(code) {
    if (code === 0x20) {
        return CLASS_SPACE;
    } else if (code === 0x0a) {
        return CLASS_NEWLINE;
    } else if (
        code === 0x28 || // (
        code === 0x29 || // )
        code === 0x2f || // /
        code === 0x3c || // <
        code === 0x3e || // >
        code === 0x5b || // [
        code === 0x5d    // ]
    ) {
        return CLASS_PUNCTUATION;
    } else if (
        (0x41 <= code && code <= 0x5a) || // Uppercase
        (0x61 <= code && code <= 0x7a) || // Lowercase
        code === 0x5f // _
    ) {
        return CLASS_WORD;
    } else {
        return CLASS_OTHER;
    }
}

class ParserState {
    constructor(syntax, lines) {
        this.lines = lines;
        this.scannerProvider = new ScannerProvider();

        this.initialContext = syntax.contexts[syntax.mainContext];

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

            let lastCharClass;
            for (let i = this.col; i < point; i++) {
                const currentCharClass = classify(line.charCodeAt(i));

                if (lastCharClass !== CLASS_PUNCTUATION && currentCharClass === CLASS_PUNCTUATION) {
                    const nextCharClass = classify(line.charCodeAt(i+1));
                    if (nextCharClass === CLASS_WORD) {
                        yield this._advance(i++);
                        yield this._advance(i);
                    } else if (lastCharClass === CLASS_SPACE) {
                        yield this._advance(i);
                    }
                } else if (currentCharClass === CLASS_NEWLINE || (currentCharClass !== CLASS_SPACE && lastCharClass === CLASS_SPACE)) {
                    yield this._advance(i);
                }

                lastCharClass = currentCharClass;
            }

            yield this._advance(point);
        }
    }

    location() {
        return [this.i, this.row, this.col];
    }

    _advance(point) {
        const begin = this.location();
        const d = point - this.col;
        this.col = point;
        this.i += d;
        const end = this.location();
        return [
            [begin, end],
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

    findNextEscape(line, level) {
        for (let j=level; j < this.contextStack.length; j++) {
            const escape = this.contextStack[j].escape;
            if (!escape) continue;

            const match = escape.scanner.findNextMatchSync(line, this.col);
            if (match) {
                return [j, match.captureIndices, escape.captures];
            }
        }
        return null;
    }

    *parseNextToken(line, level=0) {
        while (true) {
            if (this.stackIsEmpty()) {
                this.pushContext(this.initialContext);
            }

            const escapeInfo = this.findNextEscape(line, level);
            if (escapeInfo) {
                const [ escapeLevel, captureIndices, captureScopes ] = escapeInfo;

                const nextEscape = captureIndices[0].start;

                yield* this.parseNextToken(line.slice(0, nextEscape), escapeLevel+1);

                yield* this.advance(nextEscape);

                while (this.contextStack.length > escapeLevel) {
                    this.popScopes(this.topContext().context.meta_content_scope.length);
                    const top = this.popContext();
                }

                yield* this.parseCapture(captureScopes, captureIndices, true);
            } else {
                const { context: top, scanner } = this.topContext();

                const match = scanner.findNextMatchSync(line, this.col);

                if (!match) return;

                const rule = top.rules[match.index];

                yield* this.advance(match.captureIndices[0].start);

                // Capture

                if (rule.pop) {
                    this.popScopes(top.meta_content_scope.length);
                }

                if (rule.type === 'push' || rule.type === 'embed') {
                    for (const ctx of rule.next) {
                        if (ctx.clear_scopes) this.pushClear(ctx.clear_scopes);
                    }
                }

                if (rule.type === 'push' || rule.type === 'set') {
                    for (const ctx of rule.next) {
                        this.pushScopes(ctx.meta_scope);
                    }
                }

                yield* this.parseCapture(rule.captures, match.captureIndices, Boolean(rule.type || rule.pop));

                if (rule.type === 'push' || rule.type === 'set') {
                    for (let i=rule.next.length-1; i>=0; i--) {
                        this.popScopes(rule.next[i].meta_scope.length);
                    }
                }

                if (rule.type === 'push' || rule.type === 'embed') {
                    for (let i=rule.next.length-1; i>=0; i--) {
                        if (rule.next[i].clear_scopes) this.popClear();
                    }
                }

                if (rule.type === 'set') {
                    this.popScopes(top.meta_content_scope.length);
                }

                // Pop/Push

                if (rule.pop || rule.type === 'set') {
                    this.popContext();
                    if (this.contextStack.length < level) return;
                }

                if (rule.next.length) {
                    let i = 0;
                    if (rule.escape) {
                        const ctx = rule.next[i++];
                        this.pushContext(ctx, match.captureIndices, {
                            scanner: this.scannerProvider.getScanner([rule.escape], match.captureIndices, line),
                            captures: rule.escape_captures,
                        });
                    }
                    for (;i < rule.next.length; i++) {
                        this.pushContext(rule.next[i], match.captureIndices);
                    }
                }
            }
        }
    }

    *parseLine() {
        const rowLen = this.line.length;

        yield* this.parseNextToken(this.line);

        yield* this.advance(rowLen);

        this.row++;
        this.col = 0;
    }

    stackIsEmpty() {
        return this.contextStack.length === 0;
    }

    topContext() {
        return this.contextStack[this.contextStack.length - 1];
    }

    pushContext(context, captures, escape) {
        if (context.clear_scopes) this.pushClear(context.clear_scopes);
        this.contextStack.push({
            context,
            scanner: this.scannerProvider.getScanner(context.patterns, captures, this.line),
            escape,
        });
        this.pushScopes(context.meta_scope);
        this.pushScopes(context.meta_content_scope);
    }

    popContext() {
        const { context: top } = this.contextStack.pop();
        this.popScopes(top.meta_scope.length);
        if (top.clear_scopes) this.popClear();

        return top;
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

    try {
        while (state.row < lineCount) {
            yield* state.parseLine();
        }
    } catch (e) {
        console.log(state.row, state.col, state.contextStack);
        throw e;
    }
}

module.exports = { ParserState, parse };

