import { isRecentOpen } from './workflow.js';

const decode = value => String(value || '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'");
const plain = value => decode(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
export const workdayBanks = {
  'Deutsche Bank': { base: 'https://db.wd3.myworkdayjobs.com/wday/cxs/db/DBWebsite', countryFacet: 'Country' },
  Citi: { base: 'https://citi.wd5.myworkdayjobs.com/wday/cxs/citi/2', countryFacet: 'Country_and_Jurisdiction' },
  PwC: { base: 'https://pwc.wd3.myworkdayjobs.com/wday/cxs/pwc/Global_Experienced_Careers', locationFacet: true },
  FIS: { base: 'https://fis.wd5.myworkdayjobs.com/wday/cxs/fis/SearchJobs', locationFacet: true, verticals: ['Technology', 'Financial Services'] },
  Fiserv: { base: 'https://fiserv.wd5.myworkdayjobs.com/wday/cxs/fiserv/EXT', locationFacet: true, verticals: ['Technology', 'Financial Services'] },
  Mastercard: { base: 'https://mastercard.wd1.myworkdayjobs.com/wday/cxs/mastercard/CorporateCareers', locationFacet: true, verticals: ['Technology', 'Financial Services'] },
  Genpact: { base: 'https://genpact.wd108.myworkdayjobs.com/wday/cxs/genpact/External_Careers', locationFacet: true, verticals: ['Technology', 'Professional Services', 'Consulting'] },
  Salesforce: { base: 'https://salesforce.wd12.myworkdayjobs.com/wday/cxs/salesforce/External_Career_Site', countryFacet: 'CF_-_REC_-_LRV_-_Job_Posting_Anchor_-_Country_from_Job_Posting_Location_Extended', verticals: ['Technology'] },
  Adobe: { base: 'https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced', countryFacet: 'locationCountry', verticals: ['Technology'] }
};
export function workdayJob(info, bank) {
  if (info?.country?.descriptor !== 'India' || info.canApply !== true || info.posted !== true || typeof info.jobDescription !== 'string') return null;
  const provider = workdayBanks[bank];
  let url; try { url = new URL(info.externalUrl); } catch { return null; }
  if (!provider || url.protocol !== 'https:' || url.hostname !== new URL(provider.base).hostname) return null;
  return { id: info.jobReqId, title: info.title, company: bank, source: `${bank} official careers`,
    description: plain(info.jobDescription),workMode:info.remoteType?.descriptor||'',experienceMin:Number(plain(info.jobDescription).match(/(\d{1,2})(?:\s*[-–]\s*\d{1,2}|\s*\+)?\s*(?:years|yrs)\s*(?:of\s*)?(?:relevant\s*|professional\s*)?experience/i)?.[1])||null, posted: info.startDate || '', country: 'India',
    location: [info.location, ...(info.additionalLocations || [])].filter(v => typeof v === 'string').map(value => bank === 'FIS' ? value.replace(/\bBNGL\b/g, 'Bengaluru').replace(/\bNOID\b/g, 'Noida') : value).join('; '),
    applyLink: url.href, applicationOpen: true, businessVerticals: provider.verticals || (bank === 'PwC' ? ['Professional Services', 'Consulting'] : ['Banking']),
    whyRelevant: 'Official application system confirmed this India vacancy is posted and accepting applications at search time.' };
}
async function searchWorkday(bank, preferences, fetcher) {
  const config = workdayBanks[bank], paths = new Set(), jobs = []; let failures = 0;
  const json = async (url, options = {}) => {
    const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  for (const role of preferences.designations.slice(0, 2)) {
    const search = appliedFacets => json(config.base + '/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliedFacets, limit: 20, offset: 0, searchText: role }) });
    let data;
    if (config.locationFacet) {
      data = await search({});
      const canonical = value => String(value).toLowerCase().replace(/\bbangalore\b|\bbngl\b/g,'bengaluru').replace(/\bgurgaon\b/g,'gurugram').replace(/\bnew delhi\b/g,'delhi').replace(/\bnoid\b/g,'noida');
      const locations = data.facets?.find(f => f.facetParameter === 'locationMainGroup')?.values?.find(f => f.facetParameter === 'locations')?.values || [];
      const ids = locations.filter(loc => preferences.locations.some(p => p.country === 'India' && canonical(loc.descriptor).includes(canonical(p.city)))).map(loc => loc.id);
      // If a selected city has no facet, do not silently fall back to global vacancies.
      if (!ids.length) continue;
      data = await search({ locations: ids });
    } else data = await search({ [config.countryFacet]: ['c4f78be1a8f14da0ab49ce1162348a5e'] });
    if (!Array.isArray(data.jobPostings)) throw new Error('Unexpected search response');
    for (const job of data.jobPostings) if (typeof job.externalPath === 'string' && /^\/job\/[A-Za-z0-9_/-]+$/.test(job.externalPath)) paths.add(job.externalPath);
  }
  const queue = [...paths].slice(0, 30);
  for (let i = 0; i < queue.length; i += 3) await Promise.all(queue.slice(i, i + 3).map(async path => {
    try { const data = await json(config.base + path); const job = workdayJob(data.jobPostingInfo, bank); if (job && job.description.length >= 40 && isRecentOpen(job, preferences.today)) jobs.push(job); } catch { failures++; }
  }));
  return { jobs, message: `${bank}: checked ${queue.length} vacancy pages; ${jobs.length} recent India vacancies confirmed accepting applications; ${failures} retrieval failures. Your preferences are applied to these vacancies.` };
}
export function structuredJob(html) {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const data = JSON.parse(m[1]); const job = [data, ...(data['@graph'] || [])].find(j => j['@type'] === 'JobPosting'); if (job) return job; } catch {}
  }
}
export function bankJob(data, bank, url, canApply = false) {
  const places = (Array.isArray(data.jobLocation) ? data.jobLocation : [data.jobLocation]).filter(Boolean).map(p => p.address || {});
  const date = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(data.datePosted || '');
  return { id: String(data.identifier || url), title: data.title, company: bank, source: `${bank} official careers`,
    description: plain(data.description), posted: date ? `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}` : '',
    location: [...new Set(places.map(p => p.addressLocality).filter(Boolean))].join('; '), country: 'India',
    applyLink: url, applicationOpen: canApply === true, businessVerticals: ['Banking'],
    whyRelevant: canApply ? 'Official vacancy; application system confirmed posted and accepting applications at search time.' : 'Official vacancy; open application status could not be independently confirmed.' };
}
export async function searchBanks(preferences, fetcher = fetch) {
  const banks = preferences.banks;
  if (!Array.isArray(banks) || !banks.length || banks.length > 10 || new Set(banks).size !== banks.length || banks.some(b => !['Barclays', ...Object.keys(workdayBanks)].includes(b))) throw new Error('Choose an available employer source.');
  if (!Array.isArray(preferences.locations) || !preferences.locations.length || preferences.locations.length > 30 || preferences.locations.some(p => !p || typeof p.city !== 'string' || !p.city.trim() || typeof p.country !== 'string')) throw new Error('Select preferred cities.');
  if (!Array.isArray(preferences.designations) || !preferences.designations.length || preferences.designations.length > 20 || preferences.designations.some(r => typeof r !== 'string' || !r.trim() || r.length > 100)) throw new Error('Select job designations.');
  const jobs = [], messages = [];
  const get = async url => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text(); if (html.length > 4000000) throw new Error('Response too large'); return html;
  };
  if (Number(preferences.limit) === 0) return { jobs, messages: ['Record count is 0; no sources queried.'] };
  const runBank = async bank => {
    if (workdayBanks[bank]) {
      try { const found = await searchWorkday(bank, preferences, fetcher); jobs.push(...found.jobs); messages.push(found.message); }
      catch (error) { messages.push(`${bank}: search unavailable (${error.message}).`); }
      return;
    }
    const links = new Set(); let discovered = 0, unverified = 0, failures = 0;
    try {
      // A bounded pilot searches up to four selected cities and two selected roles.
      for (const place of preferences.locations.slice(0, 4)) {
        if (place.country !== 'India') continue;
        for (const role of preferences.designations.slice(0, 2)) {
          const city = String(place.city).slice(0, 100);
          const url = bank === 'HSBC'
            ? `https://portal.careers.hsbc.com/careers?domain=hsbc.com&location=${encodeURIComponent(city)}&query=${encodeURIComponent(role)}`
            : `https://search.jobs.barclays/search-jobs/India/13015/2/1269750/22/79/50/2?k=${encodeURIComponent(role)}`;
          const html = await get(url);
          if (bank === 'HSBC') {
            const block = html.match(/<code id="smartApplyData"[^>]*>([\s\S]*?)<\/code>/);
            const data = block ? JSON.parse(decode(block[1])) : {};
            for (const p of data.positions || []) links.add(`https://portal.careers.hsbc.com/careers?domain=hsbc.com&pid=${encodeURIComponent(p.id)}`);
          } else {
            // Search results only; exclude the site's unrelated suggested jobs.
            const section = html.match(/<section[^>]*id="search-results-list"[\s\S]*?<\/section>/)?.[0] || '';
            for (const m of section.matchAll(/href="(\/job\/[^" ]+)"/g)) links.add(new URL(m[1], 'https://search.jobs.barclays').href);
          }
        }
      }
      const queue = [...links].slice(0, 30); discovered = queue.length;
      for (let offset = 0; offset < queue.length; offset += 3) {
        await Promise.all(queue.slice(offset, offset + 3).map(async url => {
          try {
            const html = await get(url), data = structuredJob(html); if (!data) { failures++; return; }
            let open = false;
            if (bank === 'Barclays') {
              const apply = [...html.matchAll(/href="(https:\/\/barclays\.wd3\.myworkdayjobs\.com\/External_Career_Site_Barclays\/job\/[^" ]+\/apply)"/g)][0]?.[1];
              if (apply) {
                const path = new URL(decode(apply)).pathname.replace('/External_Career_Site_Barclays', '').replace(/\/apply$/, '');
                const info = JSON.parse(await get('https://barclays.wd3.myworkdayjobs.com/wday/cxs/barclays/External_Career_Site_Barclays' + path)).jobPostingInfo;
                open = info?.canApply === true && info?.posted === true;
              }
            }
            const job = bankJob(data, bank, url, open);
            if (!open) unverified++;
            if (isRecentOpen(job, preferences.today) && job.description.length >= 40) jobs.push(job);
          } catch { failures++; }
        }));
      }
      messages.push(`${bank}: checked ${discovered} vacancy pages; ${unverified} excluded because open status is unverified; ${failures} retrieval failures.`);
    } catch (error) { messages.push(`${bank}: search unavailable (${error.message}).`); }
  }
  for(let i=0;i<banks.length;i+=3)await Promise.all(banks.slice(i,i+3).map(runBank));
  messages.push('Pilot coverage: first search page for 2 designations, up to 30 vacancy pages per bank. Barclays/HSBC discovery uses up to 4 cities; selected location filters apply to all results. Coverage is not exhaustive.');
  return { jobs, messages };
}
