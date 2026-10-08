import { isRecentOpen } from './workflow.js';
import { createOutreach } from './outreach.js';
export const columns = ['Match %', 'Status', 'Company', 'Job Title', 'Location', 'Posting Date', 'Skills Matched', 'Gaps', 'Apply Link', 'Recruiter', 'Recruiter Role', 'Email', 'Recruiter LinkedIn', 'Your Referral Contact', 'Contact Role', 'Connection', 'Why Relevant', 'Contact LinkedIn', 'Recommended Action', 'Mock Interview'];
const skills = {
  SQL: /\bsql\b|structured query language/i,
  Python: /\bpython\b/i,
  JavaScript: /\bjavascript\b|\btypescript\b/i,
  React: /\breact\b/i,
  Java: /\bjava\b/i,
  Excel: /\bexcel\b/i,
  'Power BI': /power\s*bi/i,
  Tableau: /\btableau\b/i,
  'Regulatory Reporting': /regulatory report|regulatory compliance/i,
  Basel: /\bbasel\b/i,
  'Credit Risk': /credit risk/i,
  'Data Lineage': /data lineage/i,
  'Data Modelling': /data model(?:l)?ing/i,
  ETL: /\betl\b|extract.transform.load/i,
  UAT: /\buat\b|user acceptance test/i,
  Agile: /\bagile\b|\bscrum\b/i,
  Jira: /\bjira\b/i,
  'Business Analysis': /business analy(?:sis|st)/i,
  'Requirements Gathering': /requirements (?:gather|elicit)|elicitation/i,
  'Stakeholder Management': /stakeholder/i,
  Banking: /\bbanking\b|\bbank\b/i,
  AWS: /\baws\b|amazon web services/i,
  Azure: /\bazure\b/i,
  'Machine Learning': /machine learning/i,
  Testing: /\btesting\b|quality assurance/i,
  'REST APIs': /\brest\b|\bapis?\b/i,
  Docker: /\bdocker\b/i,
  Kubernetes: /\bkubernetes\b/i,
  Accounting: /accounting/i,
  Sales: /\bsales\b/i,
  Marketing: /\bmarketing\b/i,
  Figma: /\bfigma\b/i
};
export function extractSkills(text) { return Object.entries(skills).filter(([, re]) => re.test(text)).map(([name]) => name); }
export function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function normalizeJob(job) {
  if (!job || typeof job !== 'object' || typeof job.description !== 'string' || job.description.trim().length < 40) throw new Error('Every vacancy needs a full job description (at least 40 characters).');
  const keys = ['id', 'title', 'company', 'location', 'posted', 'postedAt', 'closesAt', 'country', 'state', 'city', 'description', 'recruiter', 'recruiterRole', 'email', 'contactEmail', 'referralContact', 'contactRole', 'connection', 'whyRelevant', 'workMode', 'fetchedAt', 'firstSeenAt', 'companyType'];
  const result = Object.fromEntries(keys.map(k => [k, typeof job[k] === 'string' ? job[k].slice(0, k === 'description' ? 50000 : 300) : '']));
  for (const key of ['applyLink', 'recruiterLinkedIn', 'contactLinkedIn']) result[key] = safeUrl(job[key]);
  result.title ||= 'Untitled vacancy'; result.company ||= 'Not provided';
  result.businessVerticals = Array.isArray(job.businessVerticals) ? job.businessVerticals.filter(v=>typeof v==='string').map(v=>v.slice(0,100)).slice(0,20) : typeof job.industry==='string' ? [job.industry.slice(0,100)] : [];
  result.salaryMin = typeof job.salaryMin === 'number' ? job.salaryMin : null;
  result.salaryMax = typeof job.salaryMax === 'number' ? job.salaryMax : null;
  result.salaryCurrency = typeof job.salaryCurrency === 'string' ? job.salaryCurrency.toUpperCase() : '';
  result.salaryPeriod = typeof job.salaryPeriod === 'string' ? job.salaryPeriod.toLowerCase() : '';
  result.experienceMin=typeof job.experienceMin==='number'?job.experienceMin:null;result.noticeDays=typeof job.noticeDays==='number'?job.noticeDays:null;
  result.applicationOpen = job.applicationOpen === true || job.applicationStatus === 'open';
  if (job.applicationOpen === false || job.applicationStatus === 'closed') result.applicationOpen = false;
  if (result.postedAt) result.posted = result.postedAt.slice(0, 10);
  return result;
}
export function matchJob(resume, job, seen = false) {
  const candidate = extractSkills(resume);
  const required = extractSkills(job.description);
  const matched = required.filter(skill => candidate.includes(skill));
  const gaps = required.filter(skill => !candidate.includes(skill));
  const score = required.length ? Math.round(matched.length / required.length * 100) : null;
  const interview = [
    { question: `Why are you interested in the ${job.title} role at ${job.company}?`, points: 'Connect the stated responsibilities to an example from your resume. Explain your motivation without inventing experience.' },
    ...matched.slice(0, 4).map(skill => ({ question: `Describe a project where you used ${skill}. How does it relate to this role?`, points: `Choose a real resume example involving ${skill}; explain your actions, tradeoffs, and measurable outcome.` })),
    ...gaps.slice(0, 3).map(skill => ({ question: `This description mentions ${skill}. How would you prepare to meet that requirement?`, points: `Be candid about the gap in ${skill}, identify transferable experience, and outline a practical learning plan.` })),
    { question: 'How would you approach your first month in this role?', points: `Review the actual JD, clarify the priorities with stakeholders, and propose an achievable first deliverable. Verify experience, location, and eligibility requirements separately.` }
  ];
  return { ...job, outreach: createOutreach(job, matched), candidateSkills: candidate, score, status: seen ? 'Reviewed' : isRecentOpen(job) ? 'New' : 'Unverified or inactive', matched, gaps, required, interview,
    recommendedAction: score === null ? 'Review manually: no recognised skills' : score >= 75 ? (job.referralContact ? 'Review JD, apply + request referral' : 'Review JD and apply') : 'Review gaps before applying' };
}
export function record(job) {
  return [job.score === null ? 'Unscored' : `${job.score}%`, job.status, job.company, job.title, job.location, job.posted, job.matched.join('; '), job.gaps.join('; '), job.applyLink, job.recruiter, job.recruiterRole, job.email, job.recruiterLinkedIn, job.referralContact, job.contactRole, job.connection, job.whyRelevant, job.contactLinkedIn, job.recommendedAction, job.interview.map(q => `${q.question} Answer points: ${q.points}`).join('\n')];
}
export function csv(jobs) {
  const escape = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
  return '\uFEFF' + [columns, ...jobs.map(record)].map(row => row.map(escape).join(',')).join('\r\n');
}
