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
    const text = path.glob('test-file.*')[0].readText();

    path.joinpath('result.txt').withWrite(out => {
        for (const [region, scope] of parse(syntax, text)) {
            for (let i = region[0]; i < region[1]; i++) {
                out.write(i + ' ' + scope + '\n');
            }
        }
    });
}
