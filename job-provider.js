// TheirStack schema: https://api.theirstack.com/openapi.json
export function linkedInJobs(data) {
  if (!Array.isArray(data)) throw new Error('Provider returned an invalid vacancy list.');
  return data.flatMap(job => {
    let source;
    try { source = new URL(job.source_url); } catch { return []; }
    if (!['linkedin.com', 'www.linkedin.com'].includes(source.hostname) || !source.pathname.startsWith('/jobs/view/') || source.protocol !== 'https:') return [];
    if (typeof job.description !== 'string' || job.description.trim().length < 40) return [];
    const place = job.locations?.[0] || {};
    return [{ id: String(job.id ?? source.pathname), source: 'LinkedIn via TheirStack', title: job.job_title,
      company: job.company_object?.name || job.company, description: job.description,
      location: job.locations?.map(p => p.display_name || p.name).filter(Boolean).join('; ') || job.long_location || job.location || '',
      country: place.country_name || '', city: place.name || '', state: place.state || '',
      posted: job.date_posted, applyLink: source.href,
      // closed_at=null explicitly means open OR unknown in this provider's schema.
      applicationOpen: false,
      whyRelevant: 'LinkedIn listing supplied by TheirStack. Application availability requires independent confirmation.',
      salaryMin: job.min_annual_salary, salaryMax: job.max_annual_salary,
      salaryCurrency: job.salary_currency, salaryPeriod: 'annual', closesAt: job.closed_at || '' }];
  });
}

export async function searchLinkedInProvider(preferences, key, fetcher = fetch) {
  if (!key) throw new Error('Set THEIRSTACK_API_KEY in the server .env file.');
  if (!preferences.designations?.length || !preferences.locations?.length) throw new Error('Select a designation and location before searching.');
  if (Number(preferences.limit) === 0) return [];
  const escaped = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const response = await fetcher('https://api.theirstack.com/v1/jobs/search', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 0, limit: 15, job_title_or: preferences.designations,
      job_location_pattern_or: preferences.locations.map(p => escaped(p.city)), posted_at_max_age_days: 31 }),
    signal: AbortSignal.timeout(20000), redirect: 'error'
  });
  if (!response.ok) throw new Error(`Job provider request failed (HTTP ${response.status}). Check the provider key and credits.`);
  const payload = await response.json();
  return linkedInJobs(payload.data);
}
