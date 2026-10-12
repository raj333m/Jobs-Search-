// Private admin page: shows who used the app, their contact details, resume and activity.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = iso => iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const list = (items, empty) => items.length ? '<ul>' + items.join('') + '</ul>' : '<p class="muted">' + empty + '</p>';

function show(view) { for (const id of ['login', 'report', 'disabled']) $('#' + id).hidden = id !== view; $('#logout').hidden = view !== 'report'; }

function person(u) {
  const uploads = u.uploads.map(x => `<li>${when(x.at)} · ${esc(x.name)}</li>`);
  const searches = u.searches.slice().reverse().map(s => `<li>${when(s.at)} · <strong>${esc(s.designations.join(', ') || 'Any role')}</strong> in ${esc(s.cities.join(', ') || 'any city')} · min match ${esc(s.threshold)}% · ${esc(s.found)} jobs found</li>`);
  const jobs = u.jobs.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).map(j => `<li>${when(j.at)} · <strong>${esc(j.status)}</strong> · ${esc(j.job)}</li>`);
  return `<article class="card"><div class="person-head"><div><h2>${esc(u.name || 'Name not found')}</h2><p class="muted">Last active ${when(u.lastActive)}</p></div>
    <a class="button ghost" href="/api/admin/resume?user=${encodeURIComponent(u.id)}">Download resume</a></div>
    <div class="facts"><div><span>Email</span><strong>${esc(u.email || '—')}</strong></div><div><span>Phone</span><strong>${esc(u.phone || '—')}</strong></div>
    <div><span>Resume</span><strong>${esc(u.resumeName || '—')}</strong></div><div><span>First used</span><strong>${when(u.firstSeen)}</strong></div></div>
    <h3>Resume uploads (${uploads.length})</h3>${list(uploads, 'None in this period.')}
    <h3>Searches (${searches.length})</h3>${list(searches, 'None in this period.')}
    <h3>Saved and applied jobs (${jobs.length})</h3>${list(jobs, 'None in this period.')}</article>`;
}

async function load() {
  const days = $('#days').value;
  $('#csv').href = '/api/admin/export.csv?days=' + days;
  const response = await fetch('/api/admin/users?days=' + days);
  if (response.status === 404) return show('disabled');
  if (response.status === 401) return show('login');
  const data = await response.json();
  show('report');
  $('#ai-status').textContent = data.aiMatching ? 'AI matching: on' : 'AI matching: off (add ANTHROPIC_API_KEY)';
  $('#summary').textContent = `${data.users.length} ${data.users.length === 1 ? 'person' : 'people'} used the app in the last ${data.days} days. Only people who accepted the updated privacy notice appear here.`;
  $('#users').innerHTML = data.users.map(person).join('');
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter; if (button) button.disabled = true;
  $('#login-error').hidden = true;
  try {
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#password').value }) });
    $('#password').value = '';
    if (!response.ok) { $('#login-error').textContent = (await response.json()).error || 'Sign-in failed.'; $('#login-error').hidden = false; return; }
    await load();
  } finally { if (button) button.disabled = false; }
});
$('#logout').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST' }); show('login'); $('#users').innerHTML = ''; });
$('#days').addEventListener('change', load);
load();
