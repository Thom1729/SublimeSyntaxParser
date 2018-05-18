const fs = require('fs');
const nodePath = require('path');
const glob = require('glob');

class Path {
    // constructor(str) {
    //     this._string = str.toString();
    //     this.parse = nodePath.parse(this._string);
    // }
    
    constructor(...parts) {
        this.parts = [];
        for (const part of parts) {
            this.parts.push(...part.toString().split('/'));
        }

        // this._string = nodePath.join(...parts.map(p => p.toString));
        this._string = this.parts.join('/');
    }

    toString() {
        return this._string;
    }

    joinpath(...others) {
        return new Path(...this.parts, ...others);
        // return new Path(this._string);
    }


    isDir() {
        return fs.statSync(this._string).isDirectory();
    }

    readText(encoding='utf-8') {
        return fs.readFileSync(this._string, { encoding });
    }

    readBinary() {
        return fs.readFileSync(this._string);
    }

    openWrite(options) {
        return fs.createWriteStream(this._string, options);
    }

    withWrite(callback) {
        const stream = fs.createWriteStream(this._string);
        try {
            callback(stream);
        } finally {
            stream.end();
        }
    }

    *iterdir() {
        const filenames = fs.readdirSync(this._string);
        for (const filename of filenames) {
            yield this.joinpath(filename);
        }
    }

    glob(pattern) {
        return glob
            .sync(pattern, { cwd: this._string })
            .map(p => this.joinpath(p));
    }
}

module.exports = { Path };
