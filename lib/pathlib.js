const fs = require('fs');
const nodePath = require('path');
const glob = require('glob');


function promisify(callback) {
    return new Promise((resolve, reject) => {
        callback((error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}


class Path {
    constructor(...parts) {
        this.parts = [];
        for (const part of parts) {
            this.parts.push(...part.toString().split('/'));
        }

        this._string = this.parts.join('/');
    }

    toString() {
        return this._string;
    }

    get dirname() {
        return nodePath.dirname(this._string);
    }

    get basename() {
        return nodePath.basename(this._string);
    }

    get extension() {
        return nodePath.extname(this._string);
    }

    joinpath(...others) {
        return new Path(...this.parts, ...others);
    }


    isDir() {
        return fs.statSync(this._string).isDirectory();
    }

    readText(encoding='utf-8') {
        return promisify(then => fs.readFile(this._string, { encoding }, then));
    }

    readTextSync(encoding='utf-8') {
        return fs.readFileSync(this._string, { encoding });
    }

    readBinary() {
        return promisify(then => fs.readFile(this._string, {}, then));
    }

    readBinarySync() {
        return fs.readFileSync(this._string);
    }

    writeText(text, encoding='utf-8') {
        return promisify(then => fs.writeFile(this._string, text, { encoding }, then));
        // return fs.writeFileSync(this._string, text, { encoding });
    }

    writeTextSync(text, encoding='utf-8') {
        return fs.writeFileSync(this._string, text, { encoding });
    }

    writeBinary(text) {
        return promisify(then => fs.writeFile(this._string, text, {}, then));
        // return fs.writeFileSync(this._string, text);
    }

    writeBinarySync(text) {
        return fs.writeFileSync(this._string, text);
    }

    // openWrite(options) {
    //     return fs.createWriteStream(this._string, options);
    // }

    // withWrite(callback) {
    //     const stream = fs.createWriteStream(this._string);
    //     try {
    //         callback(stream);
    //     } finally {
    //         stream.end();
    //     }
    // }

    *iterdir() {
        const filenames = fs.readdirSync(this._string);
        for (const filename of filenames) {
            yield this.joinpath(filename);
        }
    }

    async glob(pattern) {
        const files = await promisify(then => glob(pattern, { cwd: this._string }, then));
        return files.map(p => this.joinpath(p));
    }

    globSync(pattern) {
        return glob
            .sync(pattern, { cwd: this._string })
            .map(p => this.joinpath(p));
    }
}

module.exports = { Path };
