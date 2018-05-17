function* parse(syntax, text) {

    const { contexts, scope:baseScope } = syntax;
    const lines = text.split(/^/gm);
    const lineCount = lines.length;

    const stack = [];
    let row = 0, col = 0, i=0;

    function* advance(point, scope) {
        if (point < col) {
            throw new Error(`Tried to advance backward from ${col} to ${point}.`);
        } else if (point === col) {
            // pass
        } else {
            const d = point - col;
            yield [
                [i, i+d],
                [baseScope, ...stack.map(c => c.meta_scope), scope].filter(s => s).join(' '),
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
            }

            // console.log('Stack:', stack.map(c => c.name).join(' '));

            const top = stack[stack.length - 1];

            const match = top.scanner.findNextMatchSync(line, col);
            if (match) {
                const rule = top.rules[match.index];

                const { start, end } = match.captureIndices.find(cap => cap.index === 0);
                yield* advance(start);
                yield* advance(end, rule.captures[0]);

                if (rule.pop) stack.pop();
                if (rule.push) stack.push(...rule.push.map(name => contexts[name]))
            } else {
                yield* advance(rowLen);
            }
        }
        row++;
        col = 0;
    }
}

module.exports = { parse };

