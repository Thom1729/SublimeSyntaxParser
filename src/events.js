const EMIT_TOKEN = 'EMIT_TOKEN';
const PUSH_SCOPES = 'PUSH_SCOPES';
const POP_SCOPES = 'POP_SCOPES';
const PUSH_CLEAR = 'PUSH_CLEAR';
const POP_CLEAR = 'POP_CLEAR';

const emitToken = (range) => ({
    type: EMIT_TOKEN,
    value: range,
});

const pushScopes = (scopes) => ({
    type: PUSH_SCOPES,
    value: scopes,
});

const popScopes = (n) => ({
    type: POP_SCOPES,
    value: n,
});

const pushClear = (n) => ({
    type: PUSH_CLEAR,
    value: n,
});

const popClear = ()  => ({
    type: POP_CLEAR,
});

module.exports = {
    EMIT_TOKEN,
    PUSH_SCOPES,
    POP_SCOPES,
    PUSH_CLEAR,
    POP_CLEAR,

    emitToken,
    pushScopes,
    popScopes,
    pushClear,
    popClear,
};