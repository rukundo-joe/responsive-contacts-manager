// Node test runner. Run with: node tests/test.js
// No dependencies, just the shared suite and a small assert shim.
import { registerTests } from './suite.js';

let passed = 0, failed = 0;
const failures = [];

const assert = {
  ok(cond, msg = 'expected truthy') { if (!cond) throw new Error(msg); },
  equal(a, b, msg) { if (a !== b) throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
  deepEqual(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  },
  throws(fn, msg) { try { fn(); } catch { return; } throw new Error(msg || 'expected throw'); },
};

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; failures.push([name, e.message]); console.log(`  ✗ ${name}\n      ${e.message}`); }
}

console.log('\nRunning contact manager tests\n');
registerTests(test, assert);

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)\n`);
if (failed) { process.exitCode = 1; }
