import { todayInIndia } from '../workflow.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchJob, normalizeJob, csv, columns, safeUrl } from '../matching.js';
const job = normalizeJob({ applicationOpen: true, posted: todayInIndia(), title: 'BA', company: 'Bank', description: 'Business Analyst required with SQL, UAT and Agile experience.', applyLink: 'javascript:alert(1)' });
test('coverage counts all recognised requirements, and gaps are explicit', () => {
  const result = matchJob('Business Analyst with SQL and UAT experience', job);
  assert.equal(result.score, 75); assert.deepEqual(result.gaps, ['Agile']);
  assert.equal(result.applyLink, ''); assert.equal(result.status, 'New');
  assert.equal(matchJob('SQL', job, true).status, 'Reviewed');
});
test('unknown skills do not produce a misleading perfect match', () => {
  assert.equal(matchJob('experienced professional', normalizeJob({ description: 'We need a skilled violinist to perform classical concert repertoire.' })).score, null);
});
test('exports exactly the scheduled columns and escapes spreadsheet formulas', () => {
  assert.equal(columns.length, 20); const output = csv([matchJob('SQL UAT Agile Business Analyst', { ...job, company: '=HYPERLINK("bad")' })]);
  assert.ok(output.includes('Mock Interview')); assert.ok(output.includes("'=HYPERLINK")); assert.ok(output.includes('""bad""'));
});
test('malformed descriptions and unsafe URLs are rejected', () => {
  assert.throws(() => normalizeJob({ description: 'Too short' })); assert.equal(safeUrl('data:text/html,test'), '');
});
