// AI matching: Claude (Anthropic) reads each job description against the candidate's resume.
// Switched on only when ANTHROPIC_API_KEY is set; otherwise the rule-based score is used unchanged.
import {createHash} from 'node:crypto';

export const aiConfigured = (env = process.env) => !!env.ANTHROPIC_API_KEY;
export const resumeHash = text => createHash('sha256').update(String(text || '')).digest('hex').slice(0, 16);
export const AI_MAX_JOBS = 20;

const SYSTEM = `You are a strict, honest recruitment screener. You compare one candidate resume with one job description and judge how well the candidate fits.
Rules:
- Use only evidence written in the resume. Never assume skills that are not shown.
- The core platform, product or domain the job is built around matters most (for example SAP, Oracle EBS, Salesforce, Murex, cards and payments, insurance). If the candidate lacks it, the score must be 45 or lower.
- Seniority, years of experience and industry also count.
- 90-100: almost every requirement is clearly evidenced. 70-89: strong fit with minor gaps. 50-69: partial fit. Below 50: weak fit.
Reply with JSON only, no other text, in this shape:
{"score": <integer 0-100>, "reason": "<one or two plain-English sentences addressed to the candidate as 'you'>", "strengths": ["<up to 4 short items>"], "missing": ["<up to 4 short items>"]}`;

function prompt(resume, job) {
  const description = String(job.description || '').replace(/\s+/g, ' ').slice(0, 6000);
  return `RESUME:\n${String(resume).slice(0, 12000)}\n\nJOB:\nTitle: ${job.title || ''}\nCompany: ${job.company || ''}\nLocation: ${job.location || ''}\nDescription: ${description || '(no description provided)'}`;
}

const list = value => Array.isArray(value) ? value.filter(x => typeof x === 'string' && x.trim()).slice(0, 4).map(x => x.trim().slice(0, 80)) : [];

export function parseAiReply(text) {
  const match = /\{[\s\S]*\}/.exec(String(text || ''));
  if (!match) return null;
  let data; try { data = JSON.parse(match[0]); } catch { return null; }
  const score = Math.round(Number(data.score));
  if (!Number.isFinite(score) || score < 0 || score > 100 || typeof data.reason !== 'string') return null;
  return { score, reason: data.reason.trim().slice(0, 400), strengths: list(data.strengths), missing: list(data.missing) };
}

export async function scoreJobWithAi(resume, job, { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || 'claude-haiku-4-5', max_tokens: 400, system: SYSTEM, messages: [{ role: 'user', content: prompt(resume, job) }] }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error('AI service returned ' + response.status);
  const data = await response.json();
  const parsed = parseAiReply((data.content || []).filter(part => part.type === 'text').map(part => part.text).join(''));
  if (!parsed) throw new Error('AI reply could not be read');
  return parsed;
}

// Scores the given jobs in parallel before the deadline. Jobs that fail or run out of time keep their rule-based score.
export async function aiScoreJobs(resume, jobs, { deadline = Date.now() + 20000, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!aiConfigured(env) || !resume) return { scored: 0, failed: 0 };
  const hash = resumeHash(resume);
  const todo = jobs.filter(job => job.ai?.resumeHash !== hash).slice(0, AI_MAX_JOBS);
  let scored = 0, failed = 0;
  await Promise.all(todo.map(async job => {
    const left = deadline - Date.now();
    if (left < 2000) { failed++; return; }
    try {
      job.ai = { ...(await scoreJobWithAi(resume, job, { env, fetchImpl, timeoutMs: Math.min(20000, left - 500) })), resumeHash: hash, at: new Date().toISOString() };
      scored++;
    } catch (error) { failed++; console.error('AI scoring failed:', error.message); }
  }));
  return { scored, failed };
}

// Applies a stored AI result on top of a rule-scored job (only if it was made for this exact resume).
export function withAi(job, resume) {
  if (!job.ai || job.ai.resumeHash !== resumeHash(resume)) return job;
  return { ...job, ruleScore: job.score, score: job.ai.score, scoreNotes: [], scoreExplanation: `Claude AI read the full job description against your resume and scored it ${job.ai.score}%. ${job.ai.reason}` };
}
