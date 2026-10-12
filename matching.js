import { isRecentOpen } from './workflow.js';
import { createOutreach } from './outreach.js';
export const columns = ['Match %', 'Status', 'Company', 'Job Title', 'Location', 'Posting Date', 'Skills Matched', 'Gaps', 'Apply Link', 'Recruiter', 'Recruiter Role', 'Email', 'Recruiter LinkedIn', 'Your Referral Contact', 'Contact Role', 'Connection', 'Why Relevant', 'Contact LinkedIn', 'Recommended Action', 'Mock Interview'];
// Specialist products or platforms. If a job is built around one of these and the resume does not show it, the job is a weak fit however many general skills overlap.
const platforms = {
  'SAP': /\bsap\b|s\/4\s*hana|\bfieldglass\b|\bconcur\b|\bariba\b|successfactors/i,
  'Oracle EBS / Fusion': /oracle\s*(?:ebs|e-?business|fusion|erp|apps\b|cloud\s+(?:erp|hcm|financials))|\bebs\b/i,
  'Salesforce': /\bsalesforce\b|\bsfdc\b/i,
  'Workday': /workday\s*(?:hcm|financials|integration|studio|consultant|functional|reporting|prism)/i,
  'ServiceNow': /\bservicenow\b/i,
  'Murex': /\bmurex\b/i,
  'Calypso': /\bcalypso\b/i,
  'Guidewire': /\bguidewire\b/i,
  'Pega': /\bpega\b|pegasystems/i,
  'Mainframe / COBOL': /\bcobol\b|\bmainframe\b/i,
  'Microsoft Dynamics': /dynamics\s*365|\bd365\b/i,
  'Temenos / T24': /\btemenos\b|\bt24\b/i,
  'Finacle': /\bfinacle\b/i,
  'Flexcube': /\bflexcube\b/i,
  'Axiom': /\baxiom(?:sl)?\b/i
};
// Business domains. Weighted above individual tools because they describe what the role is about.
const domains = {
  'Regulatory Reporting': /regulatory report|regulatory compliance/i,
  'Credit Risk': /credit risk/i,
  Basel: /\bbasel\b/i,
  'IFRS 9': /ifrs\s*9/i,
  Banking: /\bbanking\b|\bbank\b/i,
  'AML / KYC': /\baml\b|anti[- ]money|\bkyc\b/i,
  'Collections & Recoveries': /\bcollections\b/i,
  'Procure-to-Pay': /procure[- ]to[- ]pay|\bp2p\b|\bprocurement\b/i,
  'Supply Chain': /supply chain/i,
  'Capital Markets': /capital markets|\bderivatives\b|\btrading\b/i,
  Insurance: /\binsurance\b|underwriting/i,
  'HR / Payroll': /\bpayroll\b|\bhcm\b/i,
  'Data Warehouse': /data\s*warehous|\bdwh\b|\bedw\b/i,
  'Data Governance': /data governance/i,
  'Data Quality': /data quality/i,
  'Data Lineage': /data lineage/i,
  'Cards & Payments': /\bcards?\b|\bpayments?\b|\bacquiring\b|card schemes?/i,
  'Consumer Credit': /consumer credit|credit bureau|credit reference|\bccds\b|\bcra\b/i,
  'Lending & Mortgages': /\bmortgages?\b|\blending\b|\bloans?\b/i,
  'Wealth Management': /wealth management|private banking|asset management/i,
  Treasury: /\btreasury\b/i
};
const general = {
  SQL: /\bsql\b|structured query language/i,
  Teradata: /\bteradata\b/i,
  OBIEE: /\bobiee\b/i,
  Python: /\bpython\b/i,
  JavaScript: /\bjavascript\b|\btypescript\b/i,
  React: /\breact\b/i,
  Java: /\bjava\b/i,
  Excel: /\bexcel\b/i,
  'Power BI': /power\s*bi/i,
  Tableau: /\btableau\b/i,
  'Data Modelling': /data model(?:l)?ing/i,
  'Data Mapping': /source[- ]to[- ]target|data mapping|\bs2t\b/i,
  Reconciliation: /reconcil/i,
  ETL: /\betl\b|extract.transform.load/i,
  Middleware: /\bmiddleware\b|\bmulesoft\b|\btibco\b/i,
  Snowflake: /\bsnowflake\b/i,
  Databricks: /\bdatabricks\b/i,
  Informatica: /\binformatica\b/i,
  SAS: /\bsas\b/i,
  Alteryx: /\balteryx\b/i,
  UAT: /\buat\b|user acceptance test/i,
  Agile: /\bagile\b|\bscrum\b/i,
  Jira: /\bjira\b/i,
  'Business Analysis': /business analy(?:sis|st)/i,
  'Requirements Gathering': /requirements? (?:analysis|gather|elicit|management|matrix)|elicitation|\bbrds?\b|\bfrds?\b/i,
  'Process Mapping': /\bvisio\b|lucid ?charts?|process (?:map|flow)/i,
  Consulting: /consult(?:ing|ancy)|client advisory/i,
  'Team Leadership': /leading and managing|people management|lead(?:ing)? a team|managing a (?:group|team)|\bmentor/i,
  'Stakeholder Management': /stakeholder/i,
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
const skills = { ...platforms, ...domains, ...general };
const weightOf = name => name in platforms ? 3 : name in domains ? 2 : 1;
export const isPlatform = name => name in platforms;
// Honest scoring: weighted coverage, then caps when a core platform is missing or too little of the job could be checked.
export function fitScore(required, matched, title = '') {
  if (!required.length) return { score: null, notes: [], platformGaps: [] };
  const total = required.reduce((sum, name) => sum + weightOf(name), 0);
  const got = matched.reduce((sum, name) => sum + weightOf(name), 0);
  let score = Math.round(got / total * 100); const notes = [];
  const platformGaps = required.filter(name => isPlatform(name) && !matched.includes(name));
  const titleGaps = platformGaps.filter(name => platforms[name].test(title));
  const titleDomainGaps = required.filter(name => name in domains && !matched.includes(name) && domains[name].test(title));
  if (titleGaps.length) { score = Math.min(score, 30); notes.push(`The role is built around ${titleGaps.join(', ')}, which your resume does not show.`); }
  else if (platformGaps.length) { score = Math.min(score, 45); notes.push(`The role needs ${platformGaps.join(', ')}, which your resume does not show.`); }
  if (titleDomainGaps.length) { score = Math.min(score, 40); notes.push(`The role is in ${titleDomainGaps.join(', ')}, which your resume does not show.`); }
  if (required.length < 4) { score = Math.min(score, 70); notes.push(`Only ${required.length} requirement${required.length === 1 ? '' : 's'} could be checked automatically; read the full description.`); }
  return { score, notes, platformGaps };
}
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
  const gaps = required.filter(skill => !candidate.includes(skill)).sort((a, b) => weightOf(b) - weightOf(a));
  const fit = fitScore(required, matched, job.title || '');
  const score = fit.score;
  const scoreExplanation = score === null ? 'No recognised requirements.' : `${matched.length} of ${required.length} recognised requirements matched, weighted by importance (platforms ×3, business domains ×2, other skills ×1) = ${score}%.` + (fit.notes.length ? ' ' + fit.notes.join(' ') : '');
  const interview = [
    { question: `Why are you interested in the ${job.title} role at ${job.company}?`, points: 'Connect the stated responsibilities to an example from your resume. Explain your motivation without inventing experience.' },
    ...matched.slice(0, 4).map(skill => ({ question: `Describe a project where you used ${skill}. How does it relate to this role?`, points: `Choose a real resume example involving ${skill}; explain your actions, tradeoffs, and measurable outcome.` })),
    ...gaps.slice(0, 3).map(skill => ({ question: `This description mentions ${skill}. How would you prepare to meet that requirement?`, points: `Be candid about the gap in ${skill}, identify transferable experience, and outline a practical learning plan.` })),
    { question: 'How would you approach your first month in this role?', points: `Review the actual JD, clarify the priorities with stakeholders, and propose an achievable first deliverable. Verify experience, location, and eligibility requirements separately.` }
  ];
  return { ...job, outreach: createOutreach(job, matched), candidateSkills: candidate, score, scoreNotes: fit.notes, platformGaps: fit.platformGaps, scoreExplanation, status: seen ? 'Reviewed' : isRecentOpen(job) ? 'New' : 'Unverified or inactive', matched, gaps, required, interview,
    recommendedAction: score === null ? 'Review manually: no recognised skills' : score >= 75 ? (job.referralContact ? 'Review JD, apply + request referral' : 'Review JD and apply') : 'Review gaps before applying' };
}
export function record(job) {
  return [job.score === null ? 'Unscored' : `${job.score}%`, job.status, job.company, job.title, job.location, job.posted, job.matched.join('; '), job.gaps.join('; '), job.applyLink, job.recruiter, job.recruiterRole, job.email, job.recruiterLinkedIn, job.referralContact, job.contactRole, job.connection, job.whyRelevant, job.contactLinkedIn, job.recommendedAction, job.interview.map(q => `${q.question} Answer points: ${q.points}`).join('\n')];
}
export function csv(jobs) {
  const escape = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
  return '\uFEFF' + [columns, ...jobs.map(record)].map(row => row.map(escape).join(',')).join('\r\n');
}
