import { spawnSync } from 'node:child_process';

const tests = [
  'scripts/test-zone-mapper.mjs',
  'scripts/test-label-mapper.mjs',
  'scripts/test-style-identity.mjs',
  'scripts/test-score-engine.mjs',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [test], {
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(1);
  }
}

console.log('RUNTIME TESTS PASSED');
