import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedInJobs, searchLinkedInProvider } from '../job-provider.js';
const job = { id: 1, source_url: 'https://www.linkedin.com/jobs/view/123', job_title: 'Analyst', company: 'Example', description: 'Requires SQL skills for analysis, reporting and stakeholder delivery.', date_posted: '2026-10-01', closed_at: null };
test('provider retains only LinkedIn sources and never invents open status', () => {
  const result = linkedInJobs([job, { ...job, source_url: 'https://linkedin.com.evil.test/jobs/view/123' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].applicationOpen, false);
  assert.equal(result[0].source, 'LinkedIn via TheirStack');
});
test('provider searches selected roles and locations without sending résumé', async () => {
  const result = await searchLinkedInProvider({ limit: 5, designations: ['Analyst'], locations: [{city:'Pune'}] }, 'test-key', async (url, options) => {
    assert.equal(url, 'https://api.theirstack.com/v1/jobs/search');
    const body=JSON.parse(options.body);
    assert.deepEqual(body.job_title_or,['Analyst']);
    assert.deepEqual(body.job_location_pattern_or,['Pune']);
    assert.equal(body.limit,15);
    return {ok:true,json:async()=>({data:[job]})};
  });
  assert.equal(result.length,1);
  await assert.rejects(searchLinkedInProvider({},''), /API_KEY/);
});
