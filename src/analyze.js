const { Path } = require('../lib/pathlib');
const { SyntaxProvider } = require('./syntaxProvider');
const { ParserState } = require('./parser');

const [ _, __, syntaxPath, filePath ] = process.argv;

const path = new Path(syntaxPath);
const file = new Path(filePath);

const provider = new SyntaxProvider(path.dirname);
const syntax = provider.getSyntaxForExtension(file.extension);

const text = file.readTextSync();

const parser = new ParserState(syntax, text.split(/^/gm));

const blessed = require('blessed');

var screen = blessed.screen({
    smartCSR: true
});

const textBox = blessed.list({
    top: 0,
    left: 0,
    width: '50%',
    height: '100%',
    items: parser.lines,
    interactive: true,
    border: {
        type: 'line'
    },

    style: {
        selected: {
            fg: 'red',
            bg: 'white',
        }
    }
});

function resetLine(i) {
    textBox.splice(i, 1, parser.lines[i]);
}

function highlightLine() {
    textBox.splice(i, 1, parser.lines[i]);
}

const lineBox = blessed.box({
    top: 0,
    left: '50%',
    right: 0,
    height: 7,
    label: 'Line',
    tags: true,
    border: {
        type: 'line'
    },
});

const contextStack = blessed.list({
    top: 7,
    left: '50%',
    right: 0,
    height: '50%',
    label: 'Stack',
    items: [],
    border: {
        type: 'line'
    },
});

const debugBox = blessed.list({
    top: '50%',
    left: '50%',
    right: 0,
    bottom: 0,
    label: 'Context',
    // tags: true,
    border: {
        type: 'line'
    },

    style: {
        selected: {
            fg: 'red',
            bg: 'white',
        }
    },
});

function pretty(obj) {
    return JSON.stringify(obj, null, 4);
}

screen.append(textBox);
screen.append(lineBox);
screen.append(contextStack);
screen.append(debugBox);

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
});

function escapeLine(line) {
    return blessed.escape(line)
        .replace(/\n/g, '{gray-fg}\u21B5{/gray-fg}')
        .replace(/ /g, '{gray-fg}\u00b7{/gray-fg}');
}

function repChar(c, n) {
    return new Array(n+1).join(c);
}

function update() {
    {
        const { line, col } = parser;

        lineBox.setContent(
            escapeLine(line.slice(0, col)) + '{red-fg}|{/red-fg}' + escapeLine(line.slice(col))
        );
    }

    textBox.select(parser.row);

    if (parser.contextStack.length) {
        const [ top, scanner ] = parser.topContext();
        debugBox.setItems(top.rules.map(r => r.match));

        const match = scanner.findNextMatchSync(parser.line, parser.col);
        if (match) {
            debugBox.select(match.index);

            const { line, col } = parser;

            lineBox.setContent(
                '  ' + escapeLine(line.slice(0, col)) + `{red-bg}${escapeLine(line[col])}{/red-bg}` + escapeLine(line.slice(col+1)) +
                match.captureIndices.map(
                    ({ index, start, length }) => `\n${index}:${repChar(' ', start)}${repChar('^', length)}`
                ).join('')
            );
        }
    }

    contextStack.setContent(parser.contextStack.map(x => x[0].name).join('\n'));

    screen.render();
}

screen.key('enter', (ch, key) => {
    Array.from(parser.parseLine());

    update();
});

screen.key('space', (ch, key) => {
    Array.from(parser.parseNextToken());

    update();
});

screen.render();
