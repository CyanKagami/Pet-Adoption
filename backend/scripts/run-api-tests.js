const { spawnSync } = require('node:child_process');
const path = require('node:path');

const suites = {
  pets: 'Pets',
  applications: 'Adoption Applications',
  wishlists: 'Wishlists',
  updates: 'Pet Updates',
  messaging: 'Messaging',
  reviews: 'Reviews',
};

function parseSuite(args) {
  let suite = 'all';
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--suite') {
      suite = args[index + 1];
      index += 1;
    } else if (argument.startsWith('--suite=')) {
      suite = argument.slice('--suite='.length);
    } else {
      throw new Error(`Unknown option "${argument}". Use --suite <${Object.keys(suites).join('|')}|all>.`);
    }

    if (!suite) throw new Error('Missing suite name. Use --suite <suite>.');
  }

  if (suite !== 'all' && !Object.hasOwn(suites, suite)) {
    throw new Error(`Unknown suite "${suite}". Choose one of: ${Object.keys(suites).join(', ')}, all.`);
  }
  return suite;
}

try {
  const suite = parseSuite(process.argv.slice(2));
  const args = [
    '--test',
    '--test-reporter',
    path.join(__dirname, 'api-test-reporter.js'),
  ];
  if (suite !== 'all') {
    args.push('--test-name-pattern', suites[suite]);
  }
  args.push(path.join(__dirname, 'test-api.js'));

  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
