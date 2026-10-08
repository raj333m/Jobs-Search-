import { todayInIndia } from '../workflow.js';
import { matchesDesignations } from '../workflow.js';
import { matchesPackage } from '../workflow.js';
import { matchesVerticals } from '../workflow.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jobKey, recordLimit, selectJobs, isRecentOpen, monthStart, matchesLocations } from '../workflow.js';
import { DecisionStore } from '../decision-store.js';

test('record limits, ranking and decisions are enforced before selecting results', () => {
  const jobs = Array.from({ length: 30 }, (_, i) => ({ applicationOpen: true, posted: todayInIndia(), score: 100 - i, title: `Role ${i}`, company: 'Bank', status: i === 0 ? 'Applied' : i === 1 ? 'Seen' : 'New' }));
  const selected = selectJobs(jobs, { threshold: 25, limit: 999 });
  assert.equal(selected.jobs.length, 15); assert.equal(selected.total, 29);
  assert.equal(selected.jobs[0].score, 99);
  assert.equal(selectJobs(jobs, { limit: 1 }).jobs.length, 1);
  assert.equal(selectJobs(jobs, { limit: 0 }).jobs.length, 0);
  assert.equal(selectJobs(jobs, { threshold: 100 }).jobs.length, 0);
  assert.equal(recordLimit('invalid'), 15);
});
test('stable identity survives tracking links, LinkedIn variants, and description edits', () => {
  assert.equal(jobKey({ applyLink: 'https://jobs.example/123?utm_source=email' }), jobKey({ applyLink: 'https://jobs.example/123?utm_source=feed#top' }));
  assert.equal(jobKey({ applyLink: 'https://www.linkedin.com/jobs/view/123?trk=test' }), jobKey({ applyLink: 'https://www.linkedin.com/jobs/search/?currentJobId=123' }));
  assert.equal(jobKey({ company: 'Bank', title: 'BA', location: 'Delhi', description: 'Old' }), jobKey({ company: ' BANK ', title: 'ba', location: 'Delhi', description: 'Updated' }));
  assert.notEqual(jobKey({ source: 'linkedin', externalId: '1' }), jobKey({ source: 'naukri', externalId: '1' }));
});
test('decisions persist across store reloads and remain private to each candidate', () => {
  const directory = mkdtempSync(join(tmpdir(), 'job-compass-test-'));
  try {
    const path = join(directory, 'decisions.json');
    const store = new DecisionStore(path);
    store.set('candidate-a', 'vacancy-1', 'Seen'); store.set('candidate-a', 'vacancy-2', 'Applied');
    const loaded = new DecisionStore(path);
    assert.equal(loaded.forUser('candidate-a')['vacancy-1'].status, 'Seen');
    assert.equal(loaded.forUser('candidate-a')['vacancy-2'].status, 'Applied');
    assert.deepEqual(loaded.forUser('candidate-b'), {});
    assert.throws(() => loaded.set('candidate-a', 'vacancy-3', 'invalid'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('New requires confirmed open applications and a valid posting date within a calendar month', () => {
  const today = '2026-10-04';
  assert.equal(isRecentOpen({ applicationOpen: true, posted: '2026-09-04' }, today), true);
  for (const posted of ['2026-09-03', '2026-10-05', '2026-02-30', '', '2 days ago']) assert.equal(isRecentOpen({ applicationOpen: true, posted }, today), false);
  assert.equal(isRecentOpen({ applicationOpen: false, posted: today }, today), false);
  assert.equal(isRecentOpen({ posted: today }, today), false);
  assert.equal(isRecentOpen({ applicationOpen: true, posted: today, closesAt: '2026-10-03' }, today), false);
  assert.equal(monthStart('2026-03-31'), '2026-02-28');
  assert.equal(monthStart('2024-03-31'), '2024-02-29');
});
test('location preferences match any selected city and recognise Gurgaon aliases', () => {
  const preferences = [{ country: 'India', city: 'Pune' }, { country: 'India', city: 'Gurgaon' }];
  assert.equal(matchesLocations({ location: 'Gurugram', country: 'India' }, preferences), true);
  assert.equal(matchesLocations({ location: 'Pune', country: 'India' }, preferences), true);
  assert.equal(matchesLocations({ location: 'Noida', country: 'India' }, preferences), false);
  assert.equal(matchesLocations({ city: 'London', country: 'Canada' }, [{ city: 'London', country: 'United Kingdom' }]), false);
  assert.equal(matchesLocations({ city: 'London', country: 'United Kingdom' }, [{ city: 'London', country: 'United Kingdom' }]), true);
});
test('designation filters accept multiple roles, senior titles and BA aliases', () => {
  const roles = ['Business Analyst', 'Data Analyst'];
  assert.equal(matchesDesignations({ title: 'Senior Business Analyst - Banking' }, roles), true);
  assert.equal(matchesDesignations({ title: 'Regulatory Data Analyst' }, roles), true);
  assert.equal(matchesDesignations({ title: 'Senior BA' }, roles), true);
  assert.equal(matchesDesignations({ title: 'Database Administrator' }, ['Data']), false);
  assert.equal(matchesDesignations({ title: 'Product Manager' }, roles), false);
  assert.equal(matchesDesignations({ title: 'Product Manager' }, []), true);
});
test('optional package buckets match advertised annual INR ranges and label rather than exclude unknown pay', () => {
  const job = { salaryMin: 1800000, salaryMax: 2400000, salaryCurrency: 'INR', salaryPeriod: 'annual' };
  assert.equal(matchesPackage(job, '15-20'), true);
  assert.equal(matchesPackage(job, '20-30'), true);
  assert.equal(matchesPackage(job, '30-50'), false);
  assert.equal(matchesPackage({}, 'any'), true);
  assert.equal(matchesPackage({}, '20-30'), true);
  assert.equal(matchesPackage({ ...job, salaryCurrency: 'USD' }, '20-30'), false);
  assert.equal(matchesPackage({ ...job, salaryPeriod: 'monthly' }, '20-30'), false);
  assert.equal(matchesPackage({ ...job, salaryMin: 2000000, salaryMax: 2000000 }, '15-20'), false);
  assert.equal(matchesPackage({ ...job, salaryMin: 2000000, salaryMax: 2000000 }, '20-30'), true);
});
test('optional verticals match any selected supplied industry and known aliases', () => {
  assert.equal(matchesVerticals({ businessVerticals: ['Banking'] }, ['Retail', 'Banking']), true);
  assert.equal(matchesVerticals({ industry: 'Pharmaceuticals' }, ['Pharma']), true);
  assert.equal(matchesVerticals({ businessVerticals: ['Aerospace'] }, ['Logistics']), false);
  assert.equal(matchesVerticals({}, ['Banking']), false);
  assert.equal(matchesVerticals({}, []), true);
});
