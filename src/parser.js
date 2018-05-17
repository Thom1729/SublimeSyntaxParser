function* parse(syntax, text) {

    const { contexts, scope:baseScope } = syntax;
    const lines = text.split(/^/gm);
    const lineCount = lines.length;

    const stack = [];
    const scopeStack = [];
    const clearedStack = [];

    let row = 0, col = 0, i=0;

    function* advance(point) {
        if (point < col) {
            throw new Error(`Tried to advance backward from ${col} to ${point}.`);
        } else if (point === col) {
            // pass
        } else {
            const d = point - col;
            yield [
                [i, i+d],
                scopeStack.join(''),
            ];
            col = point;
            i += d;
        }
    }

    while (row < lineCount) {
        const line = lines[row];
        const rowLen = line.length;
        while (col < rowLen) {
            if (stack.length === 0) {
                stack.push(contexts['main']);
                scopeStack.push(baseScope);
            }

            const top = stack[stack.length - 1];

            const match = top.scanner.findNextMatchSync(line, col);
            if (match) {
                const rule = top.rules[match.index];

                const { start, end } = match.captureIndices.find(cap => cap.index === 0);
                yield* advance(start);

                let captureIndex = 0;
                const captureCount = rule.captures.length;
                const captureEndStack = [];

                while (true) {

                    let nextPop = Infinity;
                    if (captureEndStack.length) {
                        nextPop = captureEndStack[captureEndStack.length - 1];
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

                        captureEndStack.pop();
                        scopeStack.pop()
                    } else {
                        yield* advance(nextPush);

                        captureEndStack.push(match.captureIndices[captureIndex].end);
                        scopeStack.push(rule.captures[captureIndex]);

                        do { captureIndex++; } while (
                            (captureIndex < captureCount) && (! rule.captures[captureIndex])
                        );
                    }
                }

                if (rule.pop) {
                    const ctx = stack.pop();
                    for (let i=0; i < ctx.meta.length; i++) scopeStack.pop();

                    if (ctx.clearScopes) {
                        scopeStack.push(... clearedStack.pop());
                    }
                }

                if (rule.push) {
                    for (const name of rule.push) {
                        const ctx = contexts[name];

                        if (ctx.clear_scopes) {
                            let i;
                            if (ctx.clear_scopes === true) {
                                i = 0;
                            } else {
                                i = -ctx.clear_scopes;
                            }
                            // const cleared = scopeStack.splice(i);
                            // clearedStack.push(
                            //     cleared
                            // );
                            // console.log(i, cleared);
                        }

                        stack.push(ctx);
                        scopeStack.push(...ctx.meta);
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

