import { todayInIndia } from '../workflow.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

test('server caps reports and exports, persists decisions after restart, and excludes reimported jobs', { timeout: 30000 }, async () => {
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const origin = `http://localhost:${port}`;
  const directory = mkdtempSync(join(tmpdir(), 'job-compass-server-test-'));
  let process;
  async function start() {
    process = spawn(globalThis.process.execPath, ['server.js'], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...globalThis.process.env, PORT: String(port), APP_URL: origin, DECISION_STORE_PATH: join(directory, 'decisions.json'), CAREER_STORE_PATH:join(directory,'career-vault.json'),CAREER_DATA_KEY:Buffer.alloc(32,9).toString('base64'), JOB_FEED_URL: '', LINKEDIN_CLIENT_ID: '', LINKEDIN_CLIENT_SECRET: '' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Test server startup timed out')), 10000);
      process.stdout.once('data', () => { clearTimeout(timer); resolve(); });
      process.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited with ${code}`)); });
      process.once('error', error => { clearTimeout(timer); reject(error); });
    });
  }
  async function stop() { if (process && process.exitCode === null) { const stopped = once(process, 'exit'); process.kill(); await stopped; } }
  let cookie;
  async function request(path, data, headers = {}) {
    const response = await fetch(origin + path, { method: data === undefined ? 'GET' : 'POST', headers: { Cookie: cookie || '', Origin: origin, 'Content-Type': 'application/json', ...headers }, body: data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data) });
    assert.equal(response.ok, true, await response.clone().text()); return response;
  }
  const upload = async () => { await request('/api/career/consent',{agree:true});return request('/api/resume', 'Business Analyst with SQL, Agile and UAT project experience.', { 'X-File-Name': 'resume.txt' }); };
  const jobs = Array.from({ length: 20 }, (_, i) => ({ applicationOpen: true, posted: todayInIndia(), title: `Role ${i}`, company: 'Test company', description: 'Business Analyst required with SQL, Agile and UAT project experience.', applyLink: `https://jobs.example/vacancy/${i}?utm_source=first` }));
  try {
    await start();
    const initial = await request('/api/state'); cookie = initial.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    await upload(); await request('/api/jobs', jobs);
    let state = await (await request('/api/state?threshold=25&limit=999')).json();
    assert.equal(state.jobs.length, 15); assert.equal(state.totalMatches, 20);
    const seen = state.jobs[0]; const applied = state.jobs[1];
    await request('/api/decision', { id: seen.id, status: 'Seen' });
    await request('/api/decision', { id: applied.id, status: 'Applied' });
    state = await (await request('/api/state?threshold=25&limit=1')).json();
    assert.equal(state.jobs.length, 1); assert.equal(state.totalMatches, 19);
    assert.deepEqual(state.decisionCounts, { seen: 1, applied: 1 });
    const csv = await (await request('/api/export?threshold=25&limit=999')).text();
    assert.equal((csv.match(/"100%"/g) || []).length, 15);
    assert.ok(csv.includes(`"${seen.title}"`)); assert.ok(!csv.includes(`"${applied.title}"`));
    assert.equal((await (await request('/api/state?limit=0')).json()).jobs.length, 0);
    await stop(); await start();
    const renewed = await request('/api/state');
    const newSid = renewed.headers.getSetCookie().find(c => c.startsWith('sid='));
    cookie = cookie.split('; ').filter(c => !c.startsWith('sid=')).concat(newSid.split(';')[0]).join('; ');
    await upload(); await request('/api/jobs', jobs.map(j => ({ ...j, description: j.description + ' Updated requirements.', applyLink: j.applyLink.replace('first', 'second') })));
    state = await (await request('/api/state?threshold=25&limit=15')).json();
    assert.equal(state.totalMatches, 19); assert.deepEqual(state.decisionCounts, { seen: 1, applied: 1 });
    assert.ok(state.jobs.some(j => j.title === seen.title)); assert.ok(!state.jobs.some(j => j.title === applied.title));
    await request('/api/clear', {});
    for (let i = 0; i < 2; i++) {
      const reset = await (await request('/api/state')).json();
      assert.equal(reset.resumeReady, false, 'Refresh must not restore the retained upload');
      assert.equal(reset.resumeName, '');
      assert.equal(reset.jobs.length, 0);
      assert.deepEqual(reset.decisionCounts, { seen: 1, applied: 1 });
    }
    await stop(); await start();
    const afterResetRestart = await (await request('/api/state')).json();
    assert.equal(afterResetRestart.resumeReady, false, 'cleared upload stays cleared after restart');
    await upload();
    const signedOut = await request('/api/signout', {});
    assert.ok(signedOut.headers.getSetCookie().some(c=>c.startsWith('sid=;')&&c.includes('Max-Age=0')));
    const signedOutState=await (await request('/api/state')).json();
    assert.equal(signedOutState.resumeReady,false);
    assert.deepEqual(signedOutState.decisionCounts,{seen:1,applied:1});
    const isolated = await fetch(origin + '/api/state'); const other = await isolated.json();
    assert.deepEqual(other.decisionCounts, { seen: 0, applied: 0 });
  } finally { await stop(); rmSync(directory, { recursive: true, force: true }); }
});
