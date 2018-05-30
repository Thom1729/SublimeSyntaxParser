const { Path } = require('../lib/pathlib');
const { flatMap } = require('../src/util');

const testsDir = new Path('tests');

async function runTests() {
    const tests = Array.from(testsDir.iterdir()).filter(path => path.isDir());

    await Promise.all(tests.map(runTest));
}

runTests();

function zipString(str) {
    const zlib = require('zlib');
    return new Promise((resolve, reject) => {
        zlib.gzip(str, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

async function runTest(path) {
    const { SyntaxProvider } = require('../src/syntaxProvider.js');
    const { parse } = require('../src/parser.js');

    const syntaxProvider = new SyntaxProvider(path);

    const testFile = (await path.glob('test-file.*'))[0];

    const syntax = syntaxProvider.getPacked(
        syntaxProvider.getSyntaxForExtension(testFile.extension).raw
    );

    await path.joinpath('processed.json').writeText(JSON.stringify(syntax, null, 4));

    const zipped = await zipString(JSON.stringify(syntax));
    await path.joinpath('processed-min.json.gz').writeBinary(zipped);

    const text = await testFile.readText();

    const unpacked = syntaxProvider.unpack(syntax);

    await path.joinpath('unpacked.json').writeText(JSON.stringify(unpacked, null, 4));

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

    await path.joinpath('result.txt').writeText(result.map(l => l+'\n').join(''));

    const reference = (await path.joinpath('reference.txt').readText()).split('\n').slice(0, -1);

    for (let line=0; line < reference.length; line++) {
        if (reference[line] !== result[line]) {
            console.log(path.toString());
            console.log(reference[line] + '$');
            console.log(result[line] + '$');
        }
    }
}
