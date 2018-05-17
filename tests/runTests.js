const fs = require('fs');
const { Path } = require('../lib/pathlib');

const testsDir = new Path('tests');

for (const path of testsDir.iterdir()) {
    if (path.isDir()) {
        runTest(path);
    }
}

function runTest(path) {
    const { SyntaxProvider } = require('../src/syntaxProvider.js');
    const { parse } = require('../src/parser.js');

    const syntaxProvider = new SyntaxProvider(path);

    const syntax = syntaxProvider.load('test-syntax.sublime-syntax');
    const text = path.joinpath('test-file.js').readText();

    path.joinpath('result.txt').withWrite(out => {
        for (const token of parse(syntax, text)) {
            // out.write(JSON.stringify(token));
            // out.write('\n');

            out.write(`((${token[0][0]}, ${token[0][1]}), '${token[1]} ')\n`);
        }
    });
}
