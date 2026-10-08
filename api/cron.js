// Called once a day by Vercel Cron (see vercel.json) to run job watches and email digests.
import { runScheduledTasks } from '../server.js';
export default async function cron(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) { res.statusCode = 401; return res.end('Unauthorized'); }
  try { await runScheduledTasks(); res.statusCode = 200; res.end('OK'); }
  catch (error) { console.error('Scheduled tasks failed:', error.message); res.statusCode = 500; res.end('Failed'); }
}
