const fs = require('fs');
const { Path } = require('../lib/pathlib');
const { flatMap } = require('../src/util');

const testsDir = new Path('tests');

for (const path of testsDir.iterdir()) {
    if (path.isDir()) {
        runTest(path);
    }
}

function runTest(path) {
    const { SyntaxProvider } = require('../src/syntaxProvider.js');
    const { parse } = require('../src/parser.js');

    const syntaxProvider = new SyntaxProvider(path, {
        'source.regexp.js': path.joinpath('Regular Expressions (JavaScript).sublime-syntax'),
    });

    const syntax = syntaxProvider.getPacked('test-syntax.sublime-syntax');

    path.joinpath('processed.json').writeText(JSON.stringify(syntax, null, 4));
    path.joinpath('processed-min.json').writeText(JSON.stringify(syntax));

    const text = path.glob('test-file.*')[0].readText();

    const unpacked = syntaxProvider.unpack(syntax);
    path.joinpath('unpacked.json').writeText(JSON.stringify(unpacked, null, 4));
    path.joinpath('unpacked-min.json').writeText(JSON.stringify(unpacked));
    const tokens = Array.from(parse(unpacked, text));

    const result = Array.from(flatMap(
        tokens,
        function* ([region, scope]) {
            for (let i = region[0]; i < region[1]; i++) {
                const tokenMarker = (i === region[0] ? '*' : ' ');
                yield (`${i} ${tokenMarker} ${scope}`);
            }
        }
    ));

    path.joinpath('result.txt').writeText(result.map(l => l+'\n').join(''));

    const reference = path.joinpath('reference.txt').readText().split('\n').slice(0, -1);

    for (let line=0; line < reference.length; line++) {
        if (reference[line] !== result[line]) {
            console.log(path.toString());
            console.log(reference[line] + '$');
            console.log(result[line] + '$');
        }
    }
}
