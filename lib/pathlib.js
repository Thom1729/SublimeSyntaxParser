const fs = require('fs');
const nodePath = require('path');
const glob = require('glob');

const { promisify } = require('util');
const fsPromise = {
    readFile: promisify(fs.readFile),
    writeFile: promisify(fs.writeFile),
    access: promisify(fs.access),
    mkdir: promisify(fs.mkdir),

    glob: promisify(glob),
};


class Path {
    constructor(...parts) {
        this.parts = [];
        for (const part of parts) {
            this.parts.push(...part.toString().split(nodePath.sep));
        }

        this._string = this.parts.join(nodePath.sep);
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

    addExtension(extension) {
        return new Path(this._string + extension);
    }

    joinpath(...others) {
        return new Path(...this.parts, ...others);
    }


    isDir() {
        return fs.statSync(this._string).isDirectory();
    }

    readText(encoding='utf-8') {
        return fsPromise.readFile(this._string, { encoding });
    }

    readTextSync(encoding='utf-8') {
        return fs.readFileSync(this._string, { encoding });
    }

    readBinary() {
        return fsPromise.readFile(this._string, {});
    }

    readBinarySync() {
        return fs.readFileSync(this._string);
    }

    writeText(text, encoding='utf-8') {
        return fsPromise.writeFile(this._string, text, { encoding });
    }

    writeTextSync(text, encoding='utf-8') {
        return fs.writeFileSync(this._string, text, { encoding });
    }

    writeBinary(text) {
        return fsPromise.writeFile(this._string, text, {});
    }

    writeBinarySync(text) {
        return fs.writeFileSync(this._string, text);
    }

    access(mode=fs.constants.F_OK) {
        return fsPromise.access(this._string, mode);
    }

    mkdir(mode=0o777) {
        return fsPromise.mkdir(this._string, mode);
    }

    ensureDir(mode=0o777) {
        return new Promise((resolve, reject) => {
            fs.mkdir(this._string, mode, (err) => {
                if (err) {
                    if (err.code === 'EEXIST') {
                        resolve(false);
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(true);
                }
            });
        });
    }

    *iterdir() {
        const filenames = fs.readdirSync(this._string);
        for (const filename of filenames) {
            yield this.joinpath(filename);
        }
    }

    async glob(pattern) {
        const files = await fsPromise.glob(pattern, { cwd: this._string });
        return files.map(p => this.joinpath(p));
    }

    globSync(pattern) {
        return glob
            .sync(pattern, { cwd: this._string })
            .map(p => this.joinpath(p));
    }
}

module.exports = { Path };
