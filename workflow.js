import { createHash } from 'node:crypto';

export function recordLimit(value = 15) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.min(15, Math.trunc(count))) : 15;
}
export function jobKey(job) {
  let identity;
  try {
    const url = new URL(job.applyLink);
    const linkedinId = url.hostname.endsWith('linkedin.com') && (url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1] || url.searchParams.get('currentJobId'));
    if (linkedinId) identity = `linkedin:${linkedinId}`;
    else {
      for (const name of [...url.searchParams.keys()]) if (/^(utm_|trk|tracking|ref|source|campaign)/i.test(name)) url.searchParams.delete(name);
      url.hash = ''; url.searchParams.sort();
      identity = `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, '')}${url.search}`;
    }
  } catch {}
  identity ||= job.externalId ? `${job.source}:${job.externalId}` : [job.company, job.title, job.location].map(v => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
  return createHash('sha256').update(identity).digest('hex');
}
export function validDate(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(text + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
}
export function todayInIndia() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function monthStart(today) {
  const date = new Date(today + 'T00:00:00Z');
  const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last)); return date.toISOString().slice(0, 10);
}
export function isRecentOpen(job, today = todayInIndia()) {
  const posted = validDate(job.postedAt || job.posted);
  const close = validDate(job.closesAt);
  return job.applicationOpen === true && !!posted && posted >= monthStart(today) && posted <= today && (!job.closesAt || (!!close && close >= today));
}
const canonical = text => String(text || '').toLowerCase().replace(/\bgurgaon\b/g, 'gurugram').replace(/\bbangalore\b/g, 'bengaluru').replace(/\bnew delhi\b/g, 'delhi');
export function matchesLocations(job, locations = []) {
  if (!locations.length) return true;
  return locations.some(location => {
    if (!location.city || !location.country || !canonical(job.city || job.location).includes(canonical(location.city))) return false;
    if (job.state && location.state && canonical(job.state) !== canonical(location.state)) return false;
    return job.country ? canonical(job.country) === canonical(location.country) : canonical(location.country) === 'india' || canonical(job.location).includes(canonical(location.country));
  });
}
export function matchesDesignations(job, designations = []) {
  if(!Array.isArray(designations) || designations.length>20 || designations.some(role=>typeof role!=='string' || !role.trim() || role.length>100)) throw new Error('Choose up to 20 valid job designations.');
  const normalize = value=>String(value||'').toLowerCase().replace(/\bba\b/g,'business analyst').replace(/[^a-z0-9]+/g,' ').trim();
  const title=' '+normalize(job.title)+' ';
  return !designations.length || designations.some(role=>title.includes(' '+normalize(role)+' '));
}
export const packageBuckets = {'0-5':[0,500000],'5-10':[500000,1000000],'10-15':[1000000,1500000],'15-20':[1500000,2000000],'20-30':[2000000,3000000],'30-50':[3000000,5000000],'50-plus':[5000000,Infinity]};
export function matchesPackage(job,bucket='any') {
  if(bucket==='any')return true;
  const band=packageBuckets[bucket];if(!band)throw new Error('Choose a valid package bucket.');
  if(job.salaryMin==null||job.salaryMax==null)return true;
  if(job.salaryCurrency!=='INR'||job.salaryPeriod!=='annual'||!Number.isFinite(job.salaryMin)||!Number.isFinite(job.salaryMax)||job.salaryMin<0||job.salaryMax<job.salaryMin)return false;
  return job.salaryMax>=band[0]&&job.salaryMin<band[1];
}
export function matchesVerticals(job,verticals=[]) {
  if(!Array.isArray(verticals)||verticals.length>20||verticals.some(v=>typeof v!=='string'||!v.trim()||v.length>100))throw new Error('Choose valid business verticals.');
  if(!verticals.length)return true;
  const normalize=v=>String(v||'').toLowerCase().trim().replace(/^logisics$/,'logistics').replace(/^pharmaceuticals?$/,'pharma').replace(/^health care$/,'healthcare');
  const values=Array.isArray(job.businessVerticals)?job.businessVerticals:typeof job.industry==='string'?[job.industry]:[];
  return verticals.some(v=>values.some(x=>normalize(x)===normalize(v)));
}
export function selectJobs(jobs, { threshold = 75, limit = 15, query = '', today = todayInIndia(), locations = [], designations = [], packageBucket = 'any', verticals = [] } = {}) {
  const minimum = Number(threshold);
  const search = String(query).toLowerCase();
  today = validDate(today) || todayInIndia();
  const matches = jobs.filter(j => matchesVerticals(j, verticals) && matchesPackage(j, packageBucket) && matchesDesignations(j, designations) && isRecentOpen(j, today) && matchesLocations(j, locations) && j.status !== 'Applied' && j.score !== null && j.score >= (Number.isFinite(minimum) ? Math.max(0, Math.min(100, minimum)) : 75) && `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(search)).sort((a, b) => b.score - a.score);
  return { jobs: matches.slice(0, recordLimit(limit)).map(job => ({ ...job, salaryUnknown:job.salaryUnknown||(packageBucket!=='any'&&(job.salaryMin==null||job.salaryMax==null)), status: 'New', posted: validDate(job.postedAt || job.posted) })), total: matches.length };
}
