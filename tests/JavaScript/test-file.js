/foo/;

// Hello? //

function recMap(obj, callback) {
    const ret = {};
    const stack = new Set();

    function recurse(key, value) {
        if (! ret.hasOwnProperty(key)) {
            if (stack.has(key)) throw new Error(`Infinite recursion on key ${key}.`);
            stack.add(key);
            if (value === undefined) value = obj[key];
            ret[key] = callback(key, value, recurse);
            stack.delete(key);
        }
        return ret[key]
    }

    for (const key of Object.keys(obj)) {
        recurse(key);
    }

    return ret;
}

module.exports = {
    objFromPairs,
    objMap,
    flatMap,
    recMap,
};
