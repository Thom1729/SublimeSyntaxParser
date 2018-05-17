function objFromPairs(pairs) {
    const ret = {};
    for (const [k, v] of pairs) {
        ret[k] = v;
    }
    return ret;
}

function objMap(obj, valueSelector, keySelector) {
    if (!keySelector) keySelector = (v,k) => k;

    const ret = {};
    for (const [k, v] of Object.entries(obj)) {
        ret[keySelector(v, k)] = valueSelector(v, k);
    }
    return ret;
}

function* flatMap(iterable, callback) {
    for (const item of iterable) {
        yield* callback(item);
    }
}

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
