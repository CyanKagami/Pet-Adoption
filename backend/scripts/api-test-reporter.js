const { Transform } = require('node:stream');

const colors = {
  green: '\u001B[32m',
  red: '\u001B[31m',
  reset: '\u001B[0m',
};

function oneLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

class ApiTestReporter extends Transform {
  constructor() {
    super({ writableObjectMode: true });
  }

  _transform(event, _encoding, callback) {
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      const { name, details = {} } = event.data;
      if (details.type !== 'suite') {
        const passed = event.type === 'test:pass';
        const label = passed ? 'PASS' : 'FAIL';
        const color = passed ? colors.green : colors.red;
        const error = details.error || event.data.error;
        const message = error && !passed ? ` — ${oneLine(error.message || error)}` : '';
        this.push(`${color}${label}${colors.reset} ${oneLine(name)}${message}\n`);
      }
    }

    callback();
  }
}

module.exports = ApiTestReporter;
