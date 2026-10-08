import {selectSharedJobs,shareAttachment,emailJobs} from './job-sharing.js';
import {jobPreparation} from './job-preparation.js';
import JSZip from 'jszip';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {CareerStore,loadDataKey,seal,unseal} from './career-store.js';
import {createKv} from './remote-kv.js';
import {parseProfile,profileText} from './profile-intelligence.js';
import {scoreProfile,hardFilter,mergePostings} from './fit-scoring.js';
import {careerApi} from './career-api.js';
import {startCareerScheduler} from './career-workflow.js';
import { excelReport, pdfReport } from './report-exports.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { normalizeJob, matchJob, csv } from './matching.js';
import { jobKey, selectJobs, validDate, todayInIndia } from './workflow.js';
import { DecisionStore } from './decision-store.js';
import { searchBanks } from './bank-sources.js';
import { employerSources } from './employer-sources.js';

const port = Number(process.env.PORT || 3000);
const appUrl = process.env.APP_URL || `http://localhost:${port}`;
const sessions = new Map();
const linkedinConfigured = () => [process.env.LINKEDIN_CLIENT_ID, process.env.LINKEDIN_CLIENT_SECRET].every(value => value && !/your_client|your_secret|placeholder/i.test(value));
const vaultPath=process.env.CAREER_STORE_PATH || fileURLToPath(new URL('./data/career-vault.json',import.meta.url));
// On Vercel, KV_REST_API_URL/KV_REST_API_TOKEN point at the hosted Redis database; locally they are unset and data stays in data/.
const kv=createKv();
const dataKey=loadDataKey(dirname(vaultPath));
const careerStore=new CareerStore(vaultPath,dataKey,kv);
export const scheduler = kv ? null : startCareerScheduler(careerStore);
const decisions = new DecisionStore(process.env.DECISION_STORE_PATH || fileURLToPath(new URL('./data/decisions.json', import.meta.url)),dataKey,kv);
const publicFiles = { '/': ['public/index.html', 'text/html'], '/app.js': ['public/app.js', 'text/javascript'], '/style.css': ['public/style.css', 'text/css'], '/career.js':['public/career.js','text/javascript'] };
if (!kv) setInterval(() => { for (const [id, session] of sessions) if (Date.now() - session.lastSeen > 86400000) sessions.delete(id); }, 3600000).unref();
const sessionTtlSeconds = 86400;
const cookieValue = (req, name) => new RegExp(`(?:^|; )${name}=([a-f0-9]{48})(?:;|$)`).exec(req.headers.cookie || '')?.[1];
// Remote mode: load this visitor's session and saved data before the request, and write changes back before the response is sent.
async function hydrate(req) {
  if (!kv) return;
  const candidate = cookieValue(req, 'candidate');
  if (candidate) { const user = createHash('sha256').update(candidate).digest('hex'); await Promise.all([careerStore.load(user), decisions.load(user)]); }
  const id = cookieValue(req, 'sid');
  if (!id) return;
  const raw = await kv.get('session:' + id);
  if (!raw) { sessions.delete(id); return; }
  const stored = unseal(raw, dataKey); stored.seen = new Set(stored.seen || []);
  if ((stored._generation || 0) !== (careerStore.generations.get(stored.user) || 0)) { stored.resume = ''; stored.resumeName = ''; stored.jobs = []; delete stored.linkedin; }
  delete stored._generation; sessions.set(id, stored);
}
async function persist(req) {
  if (!kv) return;
  const id = req.sessionId;
  const writes = [careerStore.flush(), decisions.flush()];
  if (id) {
    const session = sessions.get(id);
    writes.push(session ? kv.set('session:' + id, seal({ ...session, seen: [...session.seen], _generation: careerStore.generations.get(session.user) || 0 }, dataKey), sessionTtlSeconds) : kv.del('session:' + id));
    sessions.delete(id);
  }
  await Promise.all(writes);
}
function sessionFor(req, res) {
  const cookies = [];
  let user = /(?:^|; )candidate=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  if (!user) {
    user = randomBytes(24).toString('hex');
    cookies.push(`candidate=${user}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${appUrl.startsWith('https:') ? '; Secure' : ''}`);
  }
  let id = /(?:^|; )sid=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  if (!id || !sessions.has(id)) {
    id = randomBytes(24).toString('hex');
    sessions.set(id, { resume: '', jobs: [], seen: new Set(), lastSeen: Date.now() });
    cookies.push(`sid=${id}; HttpOnly; SameSite=Lax; Path=/${appUrl.startsWith('https:') ? '; Secure' : ''}`);
  }
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  req.sessionId = id;
  const session = sessions.get(id); session.lastSeen = Date.now(); session.user = createHash('sha256').update(user).digest('hex'); const saved=careerStore.get(session.user);if(!session.resume&&saved.resumeText){session.resume=saved.resumeText;session.resumeName=saved.resumeName;session.jobs=saved.jobs;}return session;
}
async function body(req, max = 8 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error('Upload exceeds the '+(max/1024/1024)+' MB limit.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function send(res, status, data, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` }); res.end(type === 'application/json' ? JSON.stringify(data) : data);
}
function results(session) {
  const history = decisions.forUser(session.user);
  const saved=careerStore.get(session.user);const all=mergePostings(session.jobs,saved.splitKeys||[]).filter(job=>history[job.key]?.status!=='Applied'&&saved.decisions[job.key]?.status!=='Applied');return all.map(job=>saved.profile?.confirmed ? {...scoreProfile(saved.profile,job,saved.settings,saved.synonyms),...hardFilter(job,saved.profile,saved.settings)} : matchJob(session.resume,job)).map(job=>({...job,status:history[job.key]?.status==='Seen'?'Saved':job.status})).filter(j=>!j.hidden);
}
function addJobs(session, input) {
  if (!Array.isArray(input) || input.length > 500) throw new Error('Import an array of up to 500 vacancies.');
  const jobs = input.map(normalizeJob);
  for (const [index, job] of jobs.entries()) {
    job.source = typeof input[index].source === 'string' ? input[index].source.slice(0, 200) : '';
    job.externalId = job.id;
    job.fetchedAt=input[index].fetchedAt||new Date().toISOString();const key = jobKey(job); job.key = key;
    if (decisions.forUser(session.user)[key]?.status==='Applied') continue;
    const existing = session.jobs.find(j => j.key === key);
    job.id = existing?.id || randomBytes(12).toString('hex');
    if (existing) Object.assign(existing, job); else session.jobs.push(job);
  }
  if (session.jobs.length > 1000) session.jobs.splice(0, session.jobs.length - 1000);
}
export const handler = async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' https://media.licdn.com data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, appUrl);
    if (req.method === 'GET' && publicFiles[url.pathname]) { const [file, type] = publicFiles[url.pathname]; return send(res, 200, await readFile(new URL(file, import.meta.url)), type); }
    const session = sessionFor(req, res);
    if (req.method === 'POST' && req.headers.origin !== new URL(appUrl).origin) return send(res, 403, { error: 'Request origin does not match APP_URL.' });
    if (req.method === 'POST' && url.pathname === '/api/bank-search') {
      if (!session.resume) throw new Error('Upload a resume first.');
      
      const preferences = JSON.parse((await body(req)).toString());
      if (!['25', '50', '75', '100'].includes(String(preferences.threshold)) || !Number.isInteger(Number(preferences.limit)) || Number(preferences.limit) < 0 || Number(preferences.limit) > 15) throw new Error('Select valid match and record settings.');
      preferences.today = validDate(preferences.today) || todayInIndia();
      const found = await searchBanks(preferences);
      // Replace prior pilot results so closed or removed vacancies cannot survive later runs.
      session.jobs = session.jobs.filter(job => !employerSources.some(source => job.source === source.name + ' official careers'));
      addJobs(session, found.jobs);const stored=careerStore.get(session.user);stored.jobs=session.jobs;stored.health=found.messages.map(message=>({source:'Search',message,status:message.includes('unavailable')?'Failed':'Healthy',at:new Date().toISOString()}));careerStore.save(session.user,stored);
      return send(res, 200, { ok: true, retrieved: found.jobs.length, messages: found.messages });
    }
    if(req.method==='POST'&&url.pathname==='/api/share/jobs'){
      const payload=JSON.parse((await body(req)).toString());
      const jobs=selectSharedJobs(results(session),payload.ids);

      if(payload.action==='email'){
        if(payload.confirm!==true)throw new Error('Confirm the recipient and selected jobs before sending.');
        await emailJobs(careerStore.get(session.user),payload.to,jobs);
        return send(res,200,{ok:true,message:'Email submitted to the mail provider.'});
      }
      if(payload.action!=='download')throw new Error('Choose download or email.');
      const attachment=await shareAttachment(jobs,payload.format);
      res.setHeader('Content-Disposition','attachment; filename="'+attachment.filename+'"');
      return send(res,200,attachment.content,attachment.contentType);
    }
    if(await careerApi(req,res,url,session,{store:careerStore,body,send,decisions,sessions}))return;
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const selected = selectJobs(results(session), { threshold: url.searchParams.get('threshold') ?? 75, limit: url.searchParams.get('limit') ?? 15, query: url.searchParams.get('q') || '', today: validDate(url.searchParams.get('today')) || todayInIndia(), locations: JSON.parse(url.searchParams.get('locations') || '[]'), designations: JSON.parse(url.searchParams.get('designations') || '[]'), packageBucket: url.searchParams.get('package') || 'any', verticals: JSON.parse(url.searchParams.get('verticals') || '[]') });
      const history = Object.values(decisions.forUser(session.user));
      return send(res, 200, { resumeReady: !!session.resume, profileConfirmed: !!careerStore.get(session.user).profile?.confirmed, resumeName: session.resumeName, jobs: selected.jobs.map(job=>({...job,preparation:jobPreparation(job,careerStore.get(session.user).profile,session.resume)})), totalMatches: selected.total, decisionCounts: { seen: history.filter(d => d.status === 'Seen').length, applied: history.filter(d => d.status === 'Applied').length }, linkedin: session.linkedin || null, linkedinConfigured: linkedinConfigured(), bankSourcesAvailable: true, employerSources, feedConfigured: !!process.env.JOB_FEED_URL, jobSources: { linkedin: !!process.env.JOB_FEED_URL && process.env.JOB_FEED_SOURCE === 'linkedin', naukri: !!process.env.JOB_FEED_URL && process.env.JOB_FEED_SOURCE === 'naukri' } });
    }
    if (req.method === 'POST' && url.pathname === '/api/resume') {
      const stored=careerStore.get(session.user);if(!stored.consent)throw new Error('Accept the data-storage notice before uploading.');
      const buffer = await body(req,5*1024*1024); const name = decodeURIComponent(req.headers['x-file-name'] || 'resume.txt');
      let text;
      if (/\.pdf$/i.test(name)) text = (await pdf(buffer)).text;
      else if (/\.docx$/i.test(name)) text = (await mammoth.extractRawText({ buffer })).value;
      else if (/\.txt$/i.test(name)) text = buffer.toString('utf8');
      else throw new Error('Use a PDF, DOCX, or TXT resume.');
      if (text.trim().length < 40) throw new Error('No readable resume text found. For scanned PDFs, upload a text-based PDF or TXT export.');
      session.resume = text.slice(0,100000);session.resumeName=name.slice(0,200);const risks=[];if(/\.docx$/i.test(name)){const zip=await JSZip.loadAsync(buffer);const xml=await zip.file('word/document.xml')?.async('string')||'';if(/<w:tbl[ >]/.test(xml))risks.push('Tables detected; ATS reading order may differ.');if(/<w:cols[^>]*w:num="[2-9]/.test(xml))risks.push('Multiple columns detected.');if(/txbxContent/.test(xml))risks.push('Text boxes detected.');if(Object.keys(zip.files).some(n=>/^word\/(header|footer)/.test(n)))risks.push('Headers or footers detected; keep contact details in the main body.');if(Object.keys(zip.files).some(n=>n.startsWith('word/media/')))risks.push('Images detected; keep critical information in plain text.');}if(/\.pdf$/i.test(name))risks.push('PDF text extraction cannot reliably detect columns or tables; confirm reading order.');if(stored.profile)stored.history.push({at:new Date().toISOString(),profile:stored.profile});stored.profile=parseProfile(session.resume,risks);stored.resumeText=session.resume;stored.resumeName=session.resumeName;careerStore.save(session.user,stored);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/jobs') { if (!session.resume) throw new Error('Upload a resume first.'); addJobs(session, JSON.parse((await body(req)).toString())); const stored=careerStore.get(session.user);stored.jobs=session.jobs;careerStore.save(session.user,stored);return send(res,200,{ok:true}); }
    if (req.method === 'POST' && url.pathname === '/api/feed') {
      if (!session.resume) throw new Error('Upload a resume first.');
      if (!['linkedin', 'naukri'].includes(process.env.JOB_FEED_SOURCE)) throw new Error('Connect an authorised LinkedIn or Naukri job-data source.');
      const preferences = JSON.parse((await body(req)).toString());
      if (!['25', '50', '75', '100'].includes(String(preferences.threshold))) throw new Error('Select a valid match percentage.');
      if (preferences.limit === '' || preferences.limit == null || !Number.isInteger(Number(preferences.limit)) || Number(preferences.limit) < 0 || Number(preferences.limit) > 15) throw new Error('Select a record count from 0 to 15.');
      if (!Array.isArray(preferences.locations) || preferences.locations.length < 1 || preferences.locations.length > 30 || preferences.locations.some(p => !p || typeof p.city !== 'string' || !p.city.trim() || typeof p.country !== 'string' || !p.country.trim())) throw new Error('Select at least one valid preferred city.');
      if (!process.env.JOB_FEED_URL) throw new Error('A job feed has not been configured. Import vacancies or paste a JD.');
      if (!process.env.JOB_FEED_URL.startsWith('https://')) throw new Error('The configured feed must use HTTPS.');
      const response = await fetch(process.env.JOB_FEED_URL, { headers: process.env.JOB_FEED_TOKEN ? { Authorization: `Bearer ${process.env.JOB_FEED_TOKEN}` } : {}, signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (!response.ok) throw new Error('The configured job feed could not be reached.');
      let size = 0; const parts = []; for await (const part of response.body) { size += part.length; if (size > 8 * 1024 * 1024) throw new Error('Job feed exceeds the 8 MB limit.'); parts.push(part); }
      addJobs(session, JSON.parse(Buffer.concat(parts).toString())); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && ['/api/decision', '/api/review'].includes(url.pathname)) {
      const data = JSON.parse((await body(req)).toString());
      const job = session.jobs.find(j => j.id === data.id);
      if (!job) throw new Error('Vacancy not found. Refresh your results.');
      decisions.set(session.user,job.key,data.status||'Seen');const stored=careerStore.get(session.user);stored.decisions[job.key]={status:data.status||'Seen',updatedAt:new Date().toISOString()};if(data.status==='Applied'){let entry=stored.pipeline.find(a=>a.key===job.key);if(!entry){entry={key:job.key,job,history:[],resumeVersion:stored.profile?.version};stored.pipeline.push(entry);}entry.history.push({from:entry.stage||null,to:'Applied',at:new Date().toISOString()});entry.stage='Applied';entry.updatedAt=new Date().toISOString();}careerStore.save(session.user,stored);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && ['/api/clear','/api/signout'].includes(url.pathname)) { const saved = careerStore.get(session.user); if (saved.resumeText || saved.resumeName || saved.jobs?.length) { saved.resumeText = ''; saved.resumeName = ''; saved.jobs = []; careerStore.save(session.user, saved); } session.resume = ''; session.resumeName = ''; session.jobs = []; session.seen.clear(); delete session.linkedin; if(url.pathname==='/api/signout'){for(const [id,current] of sessions)if(current===session)sessions.delete(id);res.setHeader('Set-Cookie','sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');} return send(res, 200, { ok: true }); }
    if (['GET', 'POST'].includes(req.method) && url.pathname === '/api/export') {
      const demo = req.method === 'POST';
      let jobs;
      if(demo){ const payload=JSON.parse((await body(req)).toString()); if(payload.demo!==true || !Array.isArray(payload.jobs) || payload.jobs.length>15) throw new Error('Invalid demo export.'); jobs=payload.jobs.map(j=>matchJob(String(payload.resume||''),normalizeJob(j))); }
      else jobs=selectJobs(results(session),{threshold:url.searchParams.get('threshold')??75,limit:url.searchParams.get('limit')??15,query:url.searchParams.get('q')||'',today:validDate(url.searchParams.get('today'))||todayInIndia(),locations:JSON.parse(url.searchParams.get('locations')||'[]'),designations:JSON.parse(url.searchParams.get('designations')||'[]'),packageBucket:url.searchParams.get('package')||'any',verticals:JSON.parse(url.searchParams.get('verticals')||'[]')}).jobs;
      const format=url.searchParams.get('format')||'csv';
      if(!['csv','xlsx','pdf'].includes(format)) throw new Error('Choose CSV, Excel or PDF.');
      const output=format==='xlsx'?await excelReport(jobs,demo):format==='pdf'?await pdfReport(jobs,demo):csv(jobs);
      res.setHeader('Content-Disposition','attachment; filename="'+(demo?'sample-':'')+'job-matches.'+format+'"');
      return send(res,200,output,format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':format==='pdf'?'application/pdf':'text/csv');
    }
    if (req.method === 'GET' && url.pathname === '/auth/linkedin') {
      if (!linkedinConfigured()) throw new Error('LinkedIn sign-in requires developer credentials in .env.');
      session.oauthState = randomBytes(32).toString('hex'); session.oauthTime = Date.now();
      const query = new URLSearchParams({ response_type: 'code', client_id: process.env.LINKEDIN_CLIENT_ID, redirect_uri: `${appUrl}/auth/linkedin/callback`, state: session.oauthState, scope: 'openid profile email' });
      res.writeHead(302, { Location: `https://www.linkedin.com/oauth/v2/authorization?${query}` }); return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/auth/linkedin/callback') {
      if (!session.oauthState || session.oauthState !== url.searchParams.get('state') || Date.now() - session.oauthTime > 600000) throw new Error('LinkedIn sign-in expired or failed its security check.');
      delete session.oauthState;
      if (url.searchParams.has('error') || !url.searchParams.get('code')) throw new Error('LinkedIn sign-in was cancelled or denied.');
      const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: `${appUrl}/auth/linkedin/callback`, client_id: process.env.LINKEDIN_CLIENT_ID, client_secret: process.env.LINKEDIN_CLIENT_SECRET }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('LinkedIn token exchange failed. Check the app configuration.');
      const token = await response.json();
      const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(15000) });
      if (!profileResponse.ok) throw new Error('LinkedIn profile access failed. Enable Sign In with LinkedIn using OpenID Connect.');
      const profile = await profileResponse.json(); session.linkedin = { name: profile.name || 'LinkedIn member' };
      res.writeHead(302, { Location: '/?linkedin=connected#connections' }); return res.end();
    }
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    if (req.url?.startsWith('/auth/linkedin/callback')) {
      const message = error.message === 'fetch failed' ? 'LinkedIn could not be reached by the server. Please try Connect again.' : error.message || 'LinkedIn connection failed. Please try again.';
      res.writeHead(302, { Location: '/?linkedin_error=' + encodeURIComponent(message) + '#connections' }); return res.end();
    }
    send(res, 400, { error: error.message || 'Unable to complete this request.' });
  }
};
// Vercel entry point: holds the response until saved data has been written to the database.
export async function vercelHandler(req, res) {
  if (!kv) return send(res, 503, { error: 'The database is not connected yet. Connect Upstash Redis to this Vercel project and redeploy.' });
  const end = res.end.bind(res);
  res.end = (...args) => { persist(req).catch(error => console.error('Save failed:', error.message)).finally(() => end(...args)); return res; };
  try { await hydrate(req); }
  catch (error) { console.error('Load failed:', error.message); res.end = end; return send(res, 503, { error: 'Storage is temporarily unavailable. Please try again.' }); }
  return handler(req, res);
}
// Daily job: runs the same watch/digest logic the local scheduler runs every minute.
export async function runScheduledTasks() {
  await careerStore.loadAll();
  const { runSchedulerTick } = await import('./career-workflow.js');
  await runSchedulerTick(careerStore);
  await careerStore.flush();
}
if (!process.env.VERCEL) {
const server=process.env.HTTPS_CERT_FILE&&process.env.HTTPS_KEY_FILE ? https.createServer({cert:readFileSync(process.env.HTTPS_CERT_FILE),key:readFileSync(process.env.HTTPS_KEY_FILE),minVersion:'TLSv1.2'},handler) : http.createServer(handler);
server.listen(port,'127.0.0.1',()=>console.log(`Career assistant ready at ${appUrl}`));
}
