import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutreach } from './outreach.js';
import { matchJob, normalizeJob } from './matching.js';

test('outreach uses only skills shared with the uploaded résumé', () => {
  const job = normalizeJob({ title: 'Analyst', company: 'Example', email: 'hiring@example.com', description: 'We require SQL and Python skills for our analysis and reporting vacancy.' });
  const result = matchJob('My résumé includes SQL and Excel skills.', job);
  assert.equal(result.outreach.email, 'hiring@example.com');
  assert.match(result.outreach.body, /My resume lists SQL,/);
  assert.doesNotMatch(result.outreach.body, /Python|Excel|years/);
  assert.match(result.outreach.body, /\[Your name\]/);
});
test('missing and malformed contact emails do not generate drafts', () => {
  for (const email of ['', 'invalid', 'a@example.com\nBcc: other@example.com']) assert.equal(createOutreach({ email }), null);
  assert.equal(createOutreach({ contactEmail: 'contact@example.com' }).email, 'contact@example.com');
});
