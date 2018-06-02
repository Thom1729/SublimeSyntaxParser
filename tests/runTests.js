const { Path } = require('../lib/pathlib');
const { flatMap } = require('../src/util');

const testsDir = new Path('tests');

async function runTests(args) {
    let tests;
    if (args.length) {
        tests = args.map(name => testsDir.joinpath(name));
    } else {
        tests = Array.from(testsDir.iterdir()).filter(path => path.isDir());
    }

    await Promise.all(tests.map(runTest));
}

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
    await syntaxProvider.addDirectory(path);
    await syntaxProvider.doEverything();

    const artifactsPath = path.joinpath('artifacts');
    await artifactsPath.ensureDir();

    for (const testFile of (await path.glob('test-file.*'))) {
        if (testFile.extension === '.txt') continue;
        const syntaxRecord = syntaxProvider.getSyntaxForExtension(testFile.extension); 

        const syntax = syntaxRecord.compiled();

        await artifactsPath
            .joinpath(syntaxRecord.path.basename)
            .addExtension('.processed.json')
            .writeText(JSON.stringify(syntax, null, 4))

        await artifactsPath
            .joinpath(syntaxRecord.path.basename)
            .addExtension('.processed-min.json.gz')
            .writeBinary(await zipString(JSON.stringify(syntax)))

        const unpacked = syntaxRecord.unpacked();

        const text = await testFile.readText();
        const result = Array.from(flatMap(
            parse(unpacked, text, syntaxProvider),
            function* ([[begin, end], scope]) {
                const row = begin[1];
                for (let col = begin[2]; col < end[2]; col++) {
                    const tokenMarker = (col === begin[2] ? '*' : ' ');
                    yield `${row+1}:${col+1} ${tokenMarker} ${scope}`;
                }
            }
        ));

        await artifactsPath
            .joinpath(testFile.basename)
            .addExtension('.result.txt')
            .writeText(result.map(l => l+'\n').join(''));

        const reference = (await testFile.addExtension('.reference.txt').readText()).split('\n').slice(0, -1);

        for (let line=0; line < reference.length; line++) {
            if (reference[line] !== result[line]) {
                console.log(path.toString());
                console.log(reference[line] + '$');
                console.log(result[line] + '$');
            }
        }
    }
}

const [foo, bar, ...args] = process.argv;

runTests(args);
