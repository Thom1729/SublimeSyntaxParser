const CLASS_SPACE = 0;
const CLASS_WORD = 1;
const CLASS_PUNCTUATION = 2;
const CLASS_NEWLINE = 3;
const CLASS_OTHER = 4;

const {
    EMIT_TOKEN,
    PUSH_SCOPES,
    POP_SCOPES,
    PUSH_CLEAR,
    POP_CLEAR,

    emitToken,
    pushScopes,
    popScopes,
    pushClear,
    popClear,
} = require('./events');

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

class Stack {
    constructor() {
        this._top = null;
    }

    get length() {
        return this._top ? this._top.length : 0;
    }

    push(item) {
        this._top = {
            value: item,
            next: this._top,
            length: this.length + 1,
        }
    }

    pop(item) {
        const { value, next } = this._top;
        this._top = next;
        return value;
    }

    peek() {
        return this._top.value;
    }

    *[Symbol.iterator]() {
        for (let node = this._top; node !== null; node = node.next) {
            yield node.value;
        }
    }
}

class ParserState {
    constructor(syntax) {
        this.scannerProvider = new ScannerProvider();

        this.initialContext = syntax.contexts[syntax.mainContext];

        this.contextStack = new Stack();

        this.col = 0;
    }

    *advance(point) {
        if (point < this.col) {
            throw new Error(`Tried to advance backward to column ${point}.`);
        } else if (point === this.col) {
            // pass
        } else {
            const begin = this.col;
            this.col = point;
            const end = this.col;
            yield emitToken([begin, end])
        }
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
                    yield popScopes(scopes.length);
                } else {
                    break;
                }
            }

            yield* this.advance(nextPush);

            captureStack.push([capture, scopes]);
            yield pushScopes(scopes);
        }

        while (captureStack.length) {
            const [ {end}, scopes ] = captureStack[captureStack.length - 1];
            const nextPop = Math.min(end, matchEnd);
            // if (nextPop <= nextPush) {
                yield* this.advance(Math.max(nextPop, this.col));
                captureStack.pop();
                yield popScopes(scopes.length);
            // } else {
                // break;
            // }
        }
    }

    findNextEscape(line, level) {
        const contextList = Array.from(this.contextStack);
        contextList.reverse();
        for (let j=level; j < contextList.length; j++) {
            const escape = contextList[j].escape;
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
            if (this.contextStack.length === 0) {
                yield* this.pushContext(this.initialContext);
            }

            const escapeInfo = this.findNextEscape(line, level);
            if (escapeInfo) {
                const [ escapeLevel, captureIndices, captureScopes ] = escapeInfo;

                const nextEscape = captureIndices[0].start;

                yield* this.parseNextToken(line.slice(0, nextEscape), escapeLevel+1);

                yield* this.advance(nextEscape);

                while (this.contextStack.length > escapeLevel) {
                    yield popScopes(this.contextStack.peek().context.meta_content_scope.length);
                    yield* this.popContext();
                }

                yield* this.parseCapture(captureScopes, captureIndices, true);
            } else {
                const success = yield* this.parseNextToken2(line, level);
                if (!success) return false;
            }
        }
    }

    *parseNextToken2(line, level) {
        const { context: top, scanner } = this.contextStack.peek();

        const match = scanner.findNextMatchSync(line, this.col);

        if (!match) return false;

        const rule = top.rules[match.index];

        yield* this.advance(match.captureIndices[0].start);

        // Capture

        if (rule.pop) {
            yield popScopes(top.meta_content_scope.length);
        }

        if (rule.type === 'push' || rule.type === 'embed') {
            for (const ctx of rule.next) {
                if (ctx.clear_scopes) yield pushClear(ctx.clear_scopes);
            }
        }

        if (rule.type === 'push' || rule.type === 'set') {
            for (const ctx of rule.next) {
                yield pushScopes(ctx.meta_scope);
            }
        }

        yield* this.parseCapture(rule.captures, match.captureIndices, Boolean(rule.type || rule.pop));

        if (rule.type === 'push' || rule.type === 'set') {
            for (let i=rule.next.length-1; i>=0; i--) {
                yield popScopes(rule.next[i].meta_scope.length);
            }
        }

        if (rule.type === 'push' || rule.type === 'embed') {
            for (let i=rule.next.length-1; i>=0; i--) {
                if (rule.next[i].clear_scopes) yield popClear();
            }
        }

        if (rule.type === 'set') {
            yield popScopes(top.meta_content_scope.length);
        }

        // Pop/Push

        if (rule.pop || rule.type === 'set') {
            yield* this.popContext();
            if (this.contextStack.length < level) return;
        }

        if (rule.next.length) {
            let i = 0;
            if (rule.escape) {
                const ctx = rule.next[i++];
                yield* this.pushContext(ctx, match.captureIndices, line, {
                    scanner: this.scannerProvider.getScanner([rule.escape], match.captureIndices, line),
                    captures: rule.escape_captures,
                });
            }
            for (;i < rule.next.length; i++) {
                yield* this.pushContext(rule.next[i], match.captureIndices, line);
            }
        }

        return true;
    }

    *parseLine(line) {
        this.col = 0;

        const rowLen = line.length;

        yield* this.parseNextToken(line);

        yield* this.advance(rowLen);
    }

    *pushContext(context, captures, line, escape) {
        if (context.clear_scopes) yield pushClear(context.clear_scopes);
        this.contextStack.push({
            context,
            scanner: this.scannerProvider.getScanner(context.patterns, captures, line),
            escape,
        });
        yield pushScopes(context.meta_scope);
        yield pushScopes(context.meta_content_scope);
    }

    *popContext() {
        const { context: top } = this.contextStack.pop();
        yield popScopes(top.meta_scope.length);
        if (top.clear_scopes) yield popClear();
    }
}

const { ScannerProvider } = require('./scannerProvider');

function* _parse(syntax, text) {
    const lines = text.split(/^/gm);
    const lineCount = lines.length;

    const state = new ParserState(syntax);
    let offset = 0;

    let row;
    try {
        for (row = 0; row < lineCount; row++) {
            const line = lines[row];
            for (const event of state.parseLine(line)) {
                switch (event.type) {
                    case EMIT_TOKEN: {
                        for (const t of splitToken(event.value, line)) {
                            const [col0, col1] = t.value;
                            yield emitToken([
                                [col0 + offset, row, col0],
                                [col1 + offset, row, col1],
                            ]);
                        }
                    }

                    default: yield event;
                }
            }
            offset += line.length;
        }
    } catch (e) {
        console.log(row, state.col, state.contextStack);
        throw e;
    }
}

function* splitToken(token, line) {
    const [ begin, end ] = token;

    let lastCharClass;
    let col = begin;

    const _advance = destination => {
        const origin = col;
        col = destination;
        return emitToken([origin, destination]);
    };

    for (let i = begin; i < end; i++) {

        const currentCharClass = classify(line.charCodeAt(i));

        if (lastCharClass !== CLASS_PUNCTUATION && currentCharClass === CLASS_PUNCTUATION) {
            const nextCharClass = classify(line.charCodeAt(i+1));
            if (nextCharClass === CLASS_WORD) {
                yield _advance(i++);
                yield _advance(i);
            } else if (lastCharClass === CLASS_SPACE) {
                yield _advance(i);
            }
        } else if (currentCharClass === CLASS_NEWLINE || (currentCharClass !== CLASS_SPACE && lastCharClass === CLASS_SPACE)) {
            yield _advance(i);
        }

        lastCharClass = currentCharClass;
    }

    yield _advance(end);
}

function* parse(syntax, text) {
    const scopeStack = [];
    const clearStack = [];

    for (const { type, value } of _parse(syntax, text)) {
        switch (type) {
            case EMIT_TOKEN: {
                yield [ value, scopeStack.join('') ];
                break;
            }

            case PUSH_SCOPES: {
                scopeStack.push(...value);
                break;
            }

            case POP_SCOPES: {
                if (value !== 0) scopeStack.splice(-value);
                break;
            }

            case PUSH_CLEAR: {
                const scopes = scopeStack.splice(
                    value === true ? 0 : -value
                );
                clearStack.push(scopes);
                break;
            }

            case POP_CLEAR: {
                const scopes = clearStack.pop();
                scopeStack.push(...scopes)
                break;
            }

            default: throw new TypeError(type);
        }
    }
}

module.exports = { ParserState, parse };

