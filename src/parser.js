function* parse(syntax, text) {

    const { contexts, scope:baseScope } = syntax;
    const lines = text.split(/^/gm);
    const lineCount = lines.length;

    const stack = [];
    const scopeStack = [];
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
                scopeStack.push(rule.captures[0]);
                yield* advance(end);
                scopeStack.pop();

                // let captureIndex = 0;
                // const captureCount = captures.length;
                // const captureStack = [];

                // while (true) {
                //     const topCapture = captureStack[captureStack.length - 1];

                //     while (! rule.captures[captureIndex]) captureIndex++;
                //     const nextPush = rule.captures[captureIndex] ? rule.captures[captureIndex].start : Infinity;
                //     const nextPop = topCapture ? topCapture.end : Infinity;

                //     if (nextPop === Infinity && nextPush === Infinity) {
                //         break;
                //     } else if (nextPop <= nextPush) {
                //         yield* advance(nextPop, captureStack.map(cap => rule.captures[cap.index]));
                //         captureStack.pop();
                //     } else {
                //         yield* advance(nextPush, captureStack.map(cap => rule.captures[cap.index]));
                //         captureStack.push(match.captureIndices[captureIndex]);
                //         captureIndex++;
                //     }
                // }

                if (rule.pop) {
                    scopeStack.pop();
                    stack.pop();
                }
                if (rule.push) {
                    for (const name of rule.push) {
                        const ctx = contexts[name];
                        stack.push(ctx);
                        scopeStack.push(ctx.meta_scope);
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

