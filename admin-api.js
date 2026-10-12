// Private admin page for the app owner: who used the app, their contact details, resume, dates and activity.
// Switched on only when ADMIN_PASSWORD is set. Only users who accepted the current notice (consentVersion >= 2) are shown.
import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {seal,unseal,retentionSeconds} from './career-store.js';

export const CONSENT_VERSION = 2;
export const MAX_RESUME_FILE = 600 * 1024; // larger files keep the extracted text only (database request limit)
const SESSION_HOURS = 12;
const localFiles = new Map(); // used when running locally without the hosted database

export const adminConfigured = (env = process.env) => typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length >= 8;
const sign = (value, key) => createHmac('sha256', Buffer.concat([Buffer.from(process.env.ADMIN_PASSWORD || ''), key])).update(value).digest('hex');
const safeEqual = (a, b) => { const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest(); return timingSafeEqual(x, y); };

export function adminCookie(key, now = Date.now()) { const expires = String(now + SESSION_HOURS * 3600000); return expires + '.' + sign(expires, key); }
export function isAdmin(req, key, now = Date.now()) {
  if (!adminConfigured()) return false;
  const value = /(?:^|; )admin=(\d+\.[a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  if (!value) return false;
  const [expires, mac] = value.split('.');
  return Number(expires) > now && safeEqual(mac, sign(expires, key));
}

// ---- Activity capture (called from the main server) ----
export function consented(user) { return !!user.consent && (user.consentVersion || 0) >= CONSENT_VERSION; }
function activity(user) { user.activity ||= { firstSeen: new Date().toISOString(), uploads: [], searches: [] }; return user.activity; }
export function recordUpload(user, name, size) {
  if (!consented(user)) return;
  const a = activity(user); a.uploads.push({ at: new Date().toISOString(), name: String(name).slice(0, 200), size }); a.uploads = a.uploads.slice(-30);
}
export function recordSearch(user, preferences, found) {
  if (!consented(user)) return;
  const a = activity(user);
  const cities = (preferences.locations || []).map(l => l && l.city).filter(Boolean).slice(0, 30);
  const designations = (preferences.designations || []).map(d => typeof d === 'string' ? d : d?.title || d?.name || '').filter(Boolean).slice(0, 30);
  a.searches.push({ at: new Date().toISOString(), cities, designations, employers: (preferences.banks || []).slice(0, 40), threshold: preferences.threshold, limit: preferences.limit, found });
  a.searches = a.searches.slice(-100);
}
export async function saveResumeFile(kv, key, userId, user, name, buffer) {
  if (!consented(user) || buffer.length > MAX_RESUME_FILE) return false;
  const value = seal({ name, type: name.split('.').pop().toLowerCase(), data: buffer.toString('base64'), at: new Date().toISOString() }, key);
  if (kv) await kv.set('resume-file:' + userId, value, retentionSeconds); else localFiles.set(userId, value);
  return true;
}
export async function removeResumeFile(kv, userId) { if (kv) await kv.del('resume-file:' + userId); else localFiles.delete(userId); }
async function loadResumeFile(kv, key, userId) { const raw = kv ? await kv.get('resume-file:' + userId) : localFiles.get(userId); return raw ? unseal(raw, key) : null; }

// ---- Report ----
const inWindow = (at, since) => at && new Date(at).getTime() >= since;
function contact(user) {
  const p = user.profile || {};
  const text = user.resumeText || '';
  return {
    name: p.name || text.split(/\r?\n/).map(s => s.trim()).find(Boolean) || '',
    email: p.email || text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '',
    phone: p.phone || text.match(/(?:\+\d{1,3}[\s-]?)?(?:\d[\s()-]?){10,13}/)?.[0]?.trim() || ''
  };
}
export function report(store, days = 7, now = Date.now()) {
  const since = now - days * 86400000;
  const rows = [];
  for (const [id, user] of Object.entries(store.data)) {
    if (!consented(user)) continue;
    const a = user.activity || { uploads: [], searches: [] };
    const jobTitle = key => { const j = (user.jobs || []).find(x => x.key === key) || (user.pipeline || []).find(x => x.key === key)?.job; return j ? `${j.title} — ${j.company}` : ''; };
    const jobs = Object.entries(user.decisions || {}).filter(([, d]) => ['Seen', 'Applied'].includes(d.status) && inWindow(d.updatedAt, since))
      .map(([k, d]) => ({ status: d.status === 'Seen' ? 'Saved' : d.status, at: d.updatedAt, job: d.title ? `${d.title} — ${d.company || ''}` : jobTitle(k) || 'Job no longer listed' }));
    const uploads = (a.uploads || []).filter(u => inWindow(u.at, since));
    const searches = (a.searches || []).filter(s => inWindow(s.at, since));
    const dates = [user.consentAt, ...uploads.map(u => u.at), ...searches.map(s => s.at), ...jobs.map(j => j.at)].filter(Boolean).sort();
    const last = dates[dates.length - 1];
    if (!inWindow(last, since)) continue;
    rows.push({ id, ...contact(user), resumeName: user.resumeName || '', firstSeen: a.firstSeen || user.consentAt || '', lastActive: last, consentAt: user.consentAt, uploads, searches, jobs });
  }
  return rows.sort((x, y) => String(y.lastActive).localeCompare(String(x.lastActive)));
}
const cell = s => '"' + String(s ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
export function reportCsv(rows) {
  const lines = [['Name', 'Email', 'Phone', 'Resume', 'First seen', 'Last active', 'Uploads', 'Searches', 'Last search cities', 'Last search job titles', 'Saved jobs', 'Applied jobs']];
  for (const r of rows) {
    const s = r.searches[r.searches.length - 1];
    lines.push([r.name, r.email, r.phone, r.resumeName, r.firstSeen, r.lastActive, r.uploads.length, r.searches.length, s?.cities.join('; '), s?.designations.join('; '), r.jobs.filter(j => j.status === 'Saved').map(j => j.job).join('; '), r.jobs.filter(j => j.status === 'Applied').map(j => j.job).join('; ')]);
  }
  return lines.map(row => row.map(cell).join(',')).join('\r\n');
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Handles /admin and /api/admin/*. Returns true when the request was handled.
export async function adminApi(req, res, url, { store, kv, key, body, send, appUrl, readPage }) {
  if (url.pathname !== '/admin' && !url.pathname.startsWith('/api/admin/')) return false;
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!adminConfigured()) { send(res, 404, { error: 'Not found' }); return true; }
  if (req.method === 'GET' && url.pathname === '/admin') { send(res, 200, await readPage(), 'text/html'); return true; }
  if (req.method === 'POST' && req.headers.origin !== new URL(appUrl).origin) { send(res, 403, { error: 'Request origin does not match.' }); return true; }
  const secure = appUrl.startsWith('https:') ? '; Secure' : '';
  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    const data = JSON.parse((await body(req, 4096)).toString() || '{}');
    if (!safeEqual(data.password || '', process.env.ADMIN_PASSWORD)) { await pause(1500); send(res, 401, { error: 'Wrong password.' }); return true; }
    res.setHeader('Set-Cookie', `admin=${adminCookie(key)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure}`);
    send(res, 200, { ok: true }); return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/logout') { res.setHeader('Set-Cookie', `admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`); send(res, 200, { ok: true }); return true; }
  if (!isAdmin(req, key)) { send(res, 401, { error: 'Sign in to the admin page.' }); return true; }
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 7));
  if (kv && url.pathname !== '/api/admin/resume') for (const id of Object.keys(store.data)) delete store.data[id]; // always read fresh
  if (req.method === 'GET' && url.pathname === '/api/admin/users') {
    await store.loadAll();
    send(res, 200, { days, users: report(store, days), aiMatching: !!process.env.ANTHROPIC_API_KEY }); return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/export.csv') {
    await store.loadAll();
    res.setHeader('Content-Disposition', `attachment; filename="app-users-last-${days}-days.csv"`);
    send(res, 200, reportCsv(report(store, days)), 'text/csv'); return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/resume') {
    const id = url.searchParams.get('user') || '';
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Unknown user.');
    await store.load(id);
    const user = store.data[id];
    if (!user || !consented(user)) { send(res, 404, { error: 'Not found' }); return true; }
    const file = await loadResumeFile(kv, key, id);
    const types = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain' };
    const safeName = n => String(n || 'resume').replace(/[^\w.\- ]/g, '_').slice(0, 120);
    if (file && types[file.type]) {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName(file.name)}"`);
      res.writeHead(200, { 'Content-Type': types[file.type] }); res.end(Buffer.from(file.data, 'base64')); return true;
    }
    res.setHeader('Content-Disposition', `attachment; filename="${safeName((user.resumeName || 'resume').replace(/\.\w+$/, ''))}.txt"`);
    send(res, 200, user.resumeText || 'No resume text saved.', 'text/plain'); return true;
  }
  send(res, 404, { error: 'Not found' }); return true;
}
