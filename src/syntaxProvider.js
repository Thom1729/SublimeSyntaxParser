const { OnigScanner } = require('oniguruma');
const { Path } = require('../lib/pathlib');

const { loadYaml } = require('./load-yaml');
const { preprocess } = require('./syntax');

class SyntaxProvider {
    constructor(path) {
        this.path = new Path(path);
    }

    load(relpath) {
        const path = this.path.joinpath(relpath);
        const buffer = path.readBinary();
        const data = loadYaml(buffer);
        const syntax = preprocess(data);

        for (const ctx of Object.values(syntax.contexts)) {
            ctx.scanner = new OnigScanner(ctx.rules.map(r => r.match2));
        }

        return syntax;
    }
}

module.exports = { SyntaxProvider };
