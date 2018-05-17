const { compose } = require('yaml-js');
const { objFromPairs } = require('./util.js');

function evaluate(node) {
    const value = (node => {
        switch (node.id) {
            case 'mapping': return objFromPairs(node.value.map(
                ([keyNode, valueNode]) => [keyNode.value, evaluate(valueNode)]
            ));

            case 'sequence': return node.value.map(evaluate);
            case 'scalar': return node.value;

            default: throw new TypeError(`Unhandled node ${node.id}.`);
        }
    })(node);

    if (value && typeof value === 'object') {
        Object.defineProperty(value, '__region', {
            enumerable: false, value: [
                node.start_mark.pointer,
                node.end_mark.pointer,
            ]
        });
    }

    return value;
}

function loadYaml(yaml) {
    return evaluate(compose(yaml));
}

module.exports = { loadYaml };
