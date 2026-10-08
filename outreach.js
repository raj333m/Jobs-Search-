export function createOutreach(job, matched = []) {
  const email = (job.email || job.contactEmail || '').trim();
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email)) return null;
  const title = String(job.title || 'the advertised role').replace(/[\r\n]/g, ' ');
  const company = String(job.company || 'your organisation').replace(/[\r\n]/g, ' ');
  const skills = matched.slice(0, 6).join(', ');
  return {
    email,
    subject: `Interest in ${title} at ${company}`,
    body: `Dear ${job.recruiter || 'Hiring team'},\n\nI am interested in the ${title} opportunity at ${company}.\n\n${skills ? `My resume lists ${skills}, which also appear in the vacancy requirements. I would welcome the opportunity to discuss how I could apply these skills to the responsibilities of this role.` : 'I would welcome your review of my resume and a discussion of how my background could contribute to this role.'}\n\n[Add a specific project from your resume and its outcome to demonstrate your contribution.]\n\nCould we arrange a brief conversation about the opportunity and the next steps in the application process?\n\nThank you for your time and consideration.\n\nBest regards,\n[Your name]\n[Your phone number]\n[Your LinkedIn profile]`
  };
}
