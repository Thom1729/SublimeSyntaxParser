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

    const artifactsPath = path.joinpath('artifacts');
    await artifactsPath.ensureDir();

    for (const testFile of (await path.glob('test-file.*'))) {
        if (testFile.extension === '.txt') continue;
        const syntaxRecord = syntaxProvider.getSyntaxForExtension(testFile.extension); 

        const syntax = syntaxProvider.compile(syntaxRecord.raw);

        await artifactsPath
            .joinpath(syntaxRecord.path.basename)
            .addExtension('.processed.json')
            .writeText(JSON.stringify(syntax, null, 4))

        await artifactsPath
            .joinpath(syntaxRecord.path.basename)
            .addExtension('.processed-min.json.gz')
            .writeBinary(await zipString(JSON.stringify(syntax)))

        const unpacked = syntaxProvider.unpack(syntax);

        await artifactsPath
            .joinpath(syntaxRecord.path.basename)
            .addExtension('.unpacked.json')
            .writeText(JSON.stringify(unpacked, null, 4))

        const text = await testFile.readText();
        const result = Array.from(flatMap(
            parse(unpacked, text),
            function* ([region, scope]) {
                for (let i = region[0]; i < region[1]; i++) {
                    const tokenMarker = (i === region[0] ? '*' : ' ');
                    yield (`${i} ${tokenMarker} ${scope}`);
                }
            }
        ));

        await artifactsPath
            .joinpath(testFile.basename)
            .addExtension('.result.txt')
            .writeText(result.map(l => l+'\n').join(''));

        const reference = (await testFile.addExtension('.reference.txt').readText()).split('\n').slice(0, -1);

        // const reference = (await path.joinpath('reference.txt').readText()).split('\n').slice(0, -1);

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
