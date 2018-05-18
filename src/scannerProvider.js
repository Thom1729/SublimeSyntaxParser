const { OnigScanner } = require('oniguruma');

function hasBackref(pattern) {
    let found = false;
    pattern.replace(
        /\\(.)/g,
        (all, c) => {
            if ('1' <= c && c <= '9') found = true;
        }
    );
    return found;
}

function regexpEscape(text) {
    return '(?:' + text.replace(/[\\+*?{[(]/g, c => '\\'+c) + ')';
}

function compileBackrefs(pattern, captures, line) {
    const ref = {};
    for (const capture of captures) {
        ref[capture.index] = line.substr(capture.start, capture.end);
    }

    return pattern.replace(
        /\\(.)/g,
        (all, c) => (
            ('1' <= c && c <= '9')
                ? regexpEscape(ref[c])
                : all
        )
    );
}

class ScannerProvider {
    constructor() {
        this.scannerCache = {};
        this.hasBackrefCache = {};
    }

    getScanner(patterns, captures, line) {
        const key = patterns.join('/');

        if (this.scannerCache[key]) {
            return this.scannerCache[key];
        } else {
            if (this.hasBackrefCache[key] === undefined) {
                this.hasBackrefCache[key] = patterns.some(hasBackref);
            }

            if (this.hasBackrefCache[key]) {
                // console.log(patterns.map(p => compileBackrefs(p, captures, line)));
                return new OnigScanner(patterns.map(p => compileBackrefs(p, captures, line)))
            } else {
                this.scannerCache[key] = new OnigScanner(patterns);
                return this.scannerCache[key];
            }
        }
    }
}

module.exports = { ScannerProvider };
