function reenaVoices(list){
 const female=/neerja|heera|swara|veena|raveena|priya|female|zira|hazel|susan|samantha|karen|moira|serena|aria|jenny|sonia|natasha|sara|reena/i;
 const rank=v=>(female.test(v.name)?100:0)+(/^en[-_]IN$/i.test(v.lang)?20:0)+(/neerja|heera|swara|veena|raveena|reena/i.test(v.name)?10:0);
 return list.filter(v=>/^en(?:-|_)/i.test(v.lang)).sort((a,b)=>rank(b)-rank(a));
}
var applicationGuide;
const sharedJobIds=new Set();
let detailVacancy=null, detailSubview=false;
function matchRationale(j){
 const skills=(j.matched||[]).slice(0,4).join(', ')||'None identified';
 if(j.scoreParts){const parts=Object.entries(j.scoreParts).map(([name,p])=>name+' '+Math.round(p.score)+'% × '+(j.scoreWeights?.[name]??0)+'%').join(' · ');return j.score+'% weighted fit: '+parts+'. Matched: '+skills+'.';}
 return j.score+'% = '+(j.matched||[]).length+' of '+(j.required||[]).length+' recognised job skills matched (rounded). Matched: '+skills+'.';
}
function conversationalReply(text){
 const t=text.toLowerCase().trim().replace(/[!?.,]/g,'');
 if(/^(am i audible|can you hear me|is my voice audible|are you hearing me)$/.test(t))return 'Yes, I received your voice clearly. Please go ahead with your answer.';
 if(/^(are you there|hello are you there|can you hear)$/.test(t))return 'Yes, I am here and listening. Take your time.';
 if(/^(hi|hello|hey|good morning|good afternoon|good evening)( reena)?$/.test(t))return 'Hello! Welcome to your practice interview. I am Reena. Let us begin when you are ready.';
 if(/^(thank you|thanks|thank you reena)$/.test(t))return 'You are welcome. Shall we continue with the question?';
 if(/^(repeat|repeat the question|please repeat|can you repeat the question)$/.test(t))return 'repeat';
 if(/^(stop|exit|end interview|stop interview)$/.test(t))return 'exit';
 return null;
}
function preparationHtml(j) {
 const points=j.preparation?.expectations||[];
 return '<h3>Employer expectations</h3><ul class="expectation-points">'+points.slice(0,5).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
}
async function showResumeReview(j){
 detailVacancy=j;detailSubview=true;
 const draft=await post('/api/career/tailor',{key:j.key||j.id});
 const suggestions=[{label:'Target the summary',question:'Which verified experience best supports this role?',section:'TARGET ROLE SUMMARY'}, {label:'Highlight matched skills',question:'Which matched skills have you used, and in which project?',section:'RELEVANT SKILL EVIDENCE'}, {label:'Address the top skill gap',question:'For '+(j.gaps?.[0]||'a requirement needing stronger evidence')+', do you have practical experience or training? State which and give an example.',section:'ADDITIONAL VERIFIED EXPERIENCE'}, {label:'Add measurable impact',question:'What real outcome can you substantiate? Include the project and verified measure.',section:'VERIFIED PROJECT OUTCOME'}, {label:'Align responsibilities',question:'Which employer expectation have you delivered before? Describe your personal contribution.',section:'ROLE ALIGNMENT'}];
 $('#detail-content').innerHTML='<h2>Resume for '+esc(j.title)+'</h2><p class="fine">Review existing evidence. Add gap skills only if you can support them.</p><div class="fit-chips">'+(j.gaps||[]).map(x=>'<span class="gap">Gap: '+esc(x)+'</span>').join('')+'</div><div class="tailor-questions">'+suggestions.map((x,i)=>'<details><summary><label><input type="checkbox" id="tailor-choice-'+i+'"> '+(i+1)+'. '+esc(x.label)+'</label></summary><label>'+esc(x.question)+'<textarea id="tailor-input-'+i+'" rows="3" placeholder="Your truthful evidence; leave blank if unsupported"></textarea></label></details>').join('')+'</div><button id="apply-tailor-choices" class="secondary">Apply selected suggestions</button><label>Revised resume<textarea id="revised-resume" rows="20">'+esc(draft.tailored)+'</textarea></label><label><input type="checkbox" id="approve-resume"> I confirm all details are accurate and approve this version.</label><button id="download-approved" class="primary">Approve & unlock downloads</button><div id="resume-downloads" role="status"></div>';
 let tailoredBase=draft.tailored;
 $('#apply-tailor-choices').addEventListener('click',()=>action(async()=>{const additions=suggestions.flatMap((x,i)=>{if(!$('#tailor-choice-'+i).checked)return [];const answer=$('#tailor-input-'+i).value.trim();if(!answer)throw new Error('Answer the question for '+x.label+'.');return [x.section,answer];});if(!additions.length)throw new Error('Select at least one suggestion.');$('#revised-resume').value=tailoredBase+'\n\n'+additions.join('\n');$('#approve-resume').checked=false;}));
 $('#download-approved').addEventListener('click',()=>action(async()=>{if(!$('#approve-resume').checked)throw new Error('Confirm the resume is accurate before downloading.');await post('/api/career/approve',{id:draft.id,approve:true,text:$('#revised-resume').value});$('#resume-downloads').innerHTML='<a class="primary" href="/api/career/resume?id='+encodeURIComponent(draft.id)+'&format=docx">↓ DOCX</a> <a class="secondary" href="/api/career/resume?id='+encodeURIComponent(draft.id)+'&format=pdf">↓ PDF</a>';$('#revised-resume').disabled=true;$('#download-approved').disabled=true;}));
}
const $ = selector => document.querySelector(selector);
function setTheme(theme) {
  const mode = ['light', 'dark', 'colorful'].includes(theme) ? theme : 'light';
  document.documentElement.dataset.theme = mode;
  document.querySelectorAll('[data-theme-choice]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === mode));
  });
  try { localStorage.setItem('job-compass-theme', mode); } catch {}
}
let savedTheme = 'light';
try { savedTheme = localStorage.getItem('job-compass-theme') || 'light'; } catch {}
setTheme('light');
document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => setTheme(button.dataset.themeChoice)));
let state = { jobs: [] };
let resultLocation = 'all';
let appliedThreshold = 75;
let appliedLimit = 5;
let refreshSequence = 0;
let submitted = false;
function showSearchResults(){const marquee=document.querySelector('.pilot-testing-notice');if(marquee)marquee.hidden=false;if(!$('#form-wizard')?.nodeType)return;$('#form-wizard').hidden=true;const intro=document.querySelector('.intro');if(intro)intro.hidden=true;const demo=document.querySelector('.demo-panel');if(demo)demo.hidden=true;$('#edit-search').hidden=false;$('#sign-out').hidden=false;$('#matches').scrollIntoView({behavior:'smooth'});}
function editSearchForm(){if(!$('#form-wizard')?.nodeType)return;$('#form-wizard').hidden=false;const intro=document.querySelector('.intro');if(intro)intro.hidden=false;const demo=document.querySelector('.demo-panel');if(demo)demo.hidden=false;$('#edit-search').hidden=true;$('#sign-out').hidden=true;$('#matches').hidden=true;document.querySelector('[data-wizard-step="3"]').click();$('#form-wizard').scrollIntoView({behavior:'smooth'});}

let searching = false;
let demoMode = false;
let locationPreferences = [];
let appliedLocations = [];
let designationPreferences = [];
let relevantExperience = {};
let appliedDesignations = [];
let appliedPackage = 'any';
let verticalPreferences = [];
let appliedVerticals = [];
function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function requestFilters() {
  return `threshold=${appliedThreshold}&limit=${appliedLimit}&q=${encodeURIComponent($('#search').value)}&today=${localToday()}&locations=${encodeURIComponent(JSON.stringify(appliedLocations))}&designations=${encodeURIComponent(JSON.stringify(appliedDesignations))}&package=${encodeURIComponent(appliedPackage)}&verticals=${encodeURIComponent(JSON.stringify(appliedVerticals))}`;
}
const geography = {
  'United States': { California: ['San Francisco', 'Los Angeles', 'San Diego'], Texas: ['Austin', 'Dallas', 'Houston'], 'New York': ['New York City', 'Buffalo'], Washington: ['Seattle', 'Bellevue'] },
  'United Kingdom': { England: ['London', 'Manchester', 'Birmingham'], Scotland: ['Edinburgh', 'Glasgow'], Wales: ['Cardiff'], 'Northern Ireland': ['Belfast'] },
  Canada: { Ontario: ['Toronto', 'Ottawa'], 'British Columbia': ['Vancouver', 'Victoria'], Alberta: ['Calgary', 'Edmonton'], Quebec: ['Montreal', 'Quebec City'] },
  Australia: { 'New South Wales': ['Sydney', 'Newcastle'], Victoria: ['Melbourne'], Queensland: ['Brisbane', 'Gold Coast'], 'Western Australia': ['Perth'] },
  'United Arab Emirates': { Dubai: ['Dubai'], 'Abu Dhabi': ['Abu Dhabi'], Sharjah: ['Sharjah'] },
  Singapore: { Singapore: ['Singapore'] },
  Germany: { Berlin: ['Berlin'], Bavaria: ['Munich', 'Nuremberg'], Hesse: ['Frankfurt'], Hamburg: ['Hamburg'] },
  Ireland: { Leinster: ['Dublin'], Munster: ['Cork', 'Limerick'], Connacht: ['Galway'] }
};
const indiaCities = ['Pune', 'Delhi', 'Gurgaon', 'Noida', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Chandigarh'];
const cityName = value => String(value || '').toLowerCase().replace(/\bgurgaon\b/g, 'gurugram').replace(/\bbangalore\b/g, 'bengaluru').replace(/\bnew delhi\b/g, 'delhi');
function selectedBanks() { return [['Barclays','barclays'],['Deutsche Bank','deutsche'],['Citi','citi']].filter(([,id]) => $('#bank-'+id)?.checked).map(([bank]) => bank).concat(['PwC','Genpact','FIS','Fiserv','Mastercard','Salesforce','Adobe'].filter(name => $('#employer-'+name.toLowerCase())?.checked)); }
function hasJobSource() { return demoMode || (state.bankSourcesAvailable && selectedBanks().length > 0) || !!(state.jobSources?.linkedin || state.jobSources?.naukri); }
function experienceErrors() {
  const errors=[];const raw=$('#total-experience').value;const total=raw.trim()===''?null:Number(raw);
  if(total===null)errors.push('Enter total years of professional experience (use 0 for a fresher).');
  if(total!==null && (!Number.isFinite(total)||total<0||total>80))errors.push('Total experience must be between 0 and 80 years.');
  for(const role of designationPreferences){const rawYears=relevantExperience[role];if(rawYears===undefined||rawYears==='')continue;const years=Number(rawYears);if(!Number.isFinite(years)||years<0||years>80)errors.push('Enter valid relevant experience for '+role+'.');else if(total===null)errors.push('Enter total experience before relevant experience.');else if(years>total)errors.push('Relevant experience for '+role+' cannot exceed total experience.');}
  return errors;
}
function experienceProfile() { return {totalYears:$('#total-experience').value===''?null:Number($('#total-experience').value),relevantYears:Object.fromEntries(designationPreferences.filter(role=>relevantExperience[role]!==undefined&&relevantExperience[role]!=='').map(role=>[role,Number(relevantExperience[role])]))}; }
function requiredErrors() {
  const errors = [];
  if (!state.resumeReady) errors.push('Upload your resume.');
  if (!hasJobSource()) errors.push(state.bankSourcesAvailable ? 'Select at least one live employer careers source.' : state.linkedin ? 'LinkedIn profile is connected, but vacancy access is not configured. Select an available bank source.' : 'Connect at least one authorised LinkedIn or Naukri job-data source.');
  if (!['25', '50', '75', '100'].includes($('#threshold').value)) errors.push('Select a minimum match percentage.');
  const count = $('#record-limit').value;
  if (count === '' || !Number.isInteger(Number(count)) || Number(count) < 0 || Number(count) > 15) errors.push('Select a record count from 0 to 15.');
  if (!locationPreferences.length) errors.push('Select at least one preferred city.');
  if (!designationPreferences.length) errors.push('Select at least one job designation.');
  return [...errors, ...experienceErrors()];
}

const salaryBuckets={'0-5':[0,500000],'5-10':[500000,1000000],'10-15':[1000000,1500000],'15-20':[1500000,2000000],'20-30':[2000000,3000000],'30-50':[3000000,5000000],'50-plus':[5000000,Infinity]};
function packageMatches(job){if(appliedPackage==='any')return true;if(job.salaryMin==null||job.salaryMax==null)return true;const band=salaryBuckets[appliedPackage];return !!band&&job.salaryCurrency==='INR'&&job.salaryPeriod==='annual'&&typeof job.salaryMin==='number'&&typeof job.salaryMax==='number'&&Number.isFinite(job.salaryMin)&&Number.isFinite(job.salaryMax)&&job.salaryMin>=0&&job.salaryMax>=job.salaryMin&&job.salaryMax>=band[0]&&job.salaryMin<band[1];}
$('#package-bucket').addEventListener('change',()=>notify('Package preference updated. Click Submit to apply it.'));

function locationMatches(job) {
  return !appliedLocations.length || appliedLocations.some(place => cityName(job.city || job.location).includes(cityName(place.city)) && (job.country ? cityName(job.country) === cityName(place.country) : place.country === 'India' || cityName(job.location).includes(cityName(place.country))));
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function notify(message) { $('#notice').textContent = message; $('#notice').hidden = false; }
async function api(path, options = {}) {
  const response = await fetch(path, options); const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed'); return data;
}
async function action(work) { try { await work(); } catch (error) { notify(error.message); applicationGuide?.tell(error.message); } }
const post = (path, value) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
function filtered() {
  const query = $('#search').value.toLowerCase();
  if (!submitted) return [];
  return state.jobs.filter(j => (resultLocation==='all'||cityName(j.city||j.location).includes(cityName(resultLocation))) && verticalMatches(j) && packageMatches(j) && designationMatches(j) && locationMatches(j) && j.status !== 'Applied' && j.score !== null && j.score >= appliedThreshold && `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(query)).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, appliedLimit);
}
function render() {
  if($('#matches')?.nodeType&&!submitted)$('#matches').hidden=true;
  applicationGuide?.update();
  const journey=[['resume',state.resumeReady,state.resumeReady?'✓ Resume ready':'Upload your resume'],['sources',hasJobSource(),demoMode?'Sample sources':hasJobSource()?'✓ Source ready':'Connect a source'],['matches',submitted,submitted?filtered().length+' matches':'Choose & submit']];
  for(const [key,complete,label] of journey){const card=$('#journey-'+key);if(card?.classList)card.classList.toggle('is-complete',complete);const status=$('#journey-'+key+'-status');if(status)status.textContent=label;}

  $('#resume-name').textContent = state.resumeName || 'Choose your resume';
  $('#resume-status').textContent = state.resumeReady ? 'Ready to match' : 'Not uploaded';
  $('#upload-confirmation').hidden = !state.resumeReady;
  $('#upload-confirmation').textContent = state.resumeReady ? '✓ Your resume has been uploaded successfully.' : '';
  $('#demo-banner').hidden = !demoMode;
  $('#load-demo').textContent = demoMode ? 'Reload sample data' : 'View sample resume & output';
  if (demoMode) {
    $('#resume-status').textContent = 'Sample resume';
    $('#upload-confirmation').textContent = 'Fictional sample resume loaded for review. Download it using the Sample resume button.';
  }
  $('#linkedin-status').textContent = state.linkedin ? `Profile signed in: ${state.linkedin.name}` : state.linkedinConfigured ? 'Ready for profile sign-in' : 'Profile sign-in not configured';
  $('#connect-linkedin').textContent = state.linkedin ? 'Profile connected' : 'Connect';
  $('#naukri-status').textContent = state.jobSources?.naukri ? 'Authorised job feed configured' : 'Integration setup required';
  $('#connect-naukri').textContent = state.jobSources?.naukri ? 'View connection' : 'Connect';
  $('#connect-linkedin').disabled = !state.resumeReady || !!state.linkedin;
  $('#connect-naukri').disabled = !state.resumeReady;
  if (demoMode) { $('#connect-linkedin').disabled = false; $('#connect-naukri').disabled = false; }
  $('#job-source-status').textContent = state.feedConfigured ? 'A job feed is configured. Submit or Refresh will read its vacancies and match your resume.' : 'LinkedIn and Naukri job data are not connected. Authorised access is required to populate live matching vacancies.';
  if (state.bankSourcesAvailable) $('#job-source-status').textContent = '10 tested employer sources available. Select one or more employers before Submit.';
  if (demoMode) $('#job-source-status').textContent = 'Demo vacancies only. LinkedIn and Naukri are not connected.';
  const jobs = filtered(); $('#job-count').textContent = jobs.length;
  $('#match-summary').textContent = `${jobs.length} shown · maximum ${appliedLimit} · ${state.totalMatches ?? state.jobs.length} matching vacancies`;
  $('#decision-summary').textContent = `${state.decisionCounts?.seen || 0} Saved · ${state.decisionCounts?.applied || 0} Applied · only applied jobs are excluded`;
  $('#export').href = `/api/export?${requestFilters()}`;
  $('#export').hidden = !submitted;
  $('#export-excel').hidden = !submitted; $('#export-pdf').hidden = !submitted;
  const errors = requiredErrors();
  const ready = !errors.length;
  $('#search-buttons').hidden = false;
  $('#submit-search').disabled = searching || !ready;
  $('#refresh-search').disabled = searching;
  $('#threshold').disabled = !state.resumeReady;
  $('#record-limit').disabled = !state.resumeReady;
  $('#search-readiness').textContent = !state.resumeReady ? 'Upload your resume first. Then connect your job sources to enable Submit.' : !state.feedConfigured ? 'Connect an authorised job-data source to enable Submit. LinkedIn profile sign-in alone does not provide job listings.' : 'Resume uploaded and a job feed configured. Select your minimum match and record count, then Submit.';
  if (state.linkedin && !hasJobSource()) $('#search-readiness').textContent = 'Submit is unavailable because LinkedIn profile sign-in does not include vacancy access. Configure an authorised job feed, or load sample data to review the search experience.';
  if (state.bankSourcesAvailable && state.resumeReady && selectedBanks().length) $('#search-readiness').textContent = 'Employer sources selected. Complete your preferences and click Submit.';
  if (demoMode) $('#search-readiness').textContent = 'Sample data is ready. Review your preferences and click Submit to display fictional job matches.';
  $('#submit-search').title = errors.length ? errors.join(' ') : 'Search matching vacancies';
  const checks=[['↥','Resume',state.resumeReady],['◈','Sources',hasJobSource()],['◎','Profile',state.profileConfirmed!==false||demoMode],['⌘','Roles',designationPreferences.length>0],['⌖','Cities',locationPreferences.length>0],['◷','Experience',experienceErrors().length===0],['◉','Match', ['25','50','75','100'].includes($('#threshold').value)],['▤','Records',$('#record-limit').value!==''&&Number.isInteger(Number($('#record-limit').value))&&Number($('#record-limit').value)>=0&&Number($('#record-limit').value)<=15]];
  $('#required-fields').innerHTML='<div class="readiness-visual" aria-label="Search readiness">'+checks.map(([icon,label,ready])=>'<span class="readiness-chip '+(ready?'complete':'pending')+'"><span aria-hidden="true">'+icon+'</span> '+label+' <b>'+ (ready?'✓':'○')+'</b><span class="sr-only">'+(ready?' complete':' required')+'</span></span>').join('')+'</div>'+ (errors.length?'<details class="visual-help"><summary>'+errors.length+' steps remaining · View guidance</summary><ul>'+errors.map(error=>'<li>'+esc(error)+'</li>').join('')+'</ul></details>':'<small>✓ Ready to submit</small>');
  $('#submit-search').textContent = searching ? 'Searching…' : 'Submit';
  $('#applied-threshold').textContent = submitted ? `Showing matches ≥${appliedThreshold}%` : 'Submit your search to see results';
  const locationChoices=[...new Map(appliedLocations.map(p=>[cityName(p.city),p.city])).entries()];
  const locationTabs = locationChoices.length>1 ? '<div class="match-location-tabs" role="group" aria-label="Filter displayed jobs by location">'+[...locationChoices,['all','All selected']].map(([value,label])=>'<button type="button" data-result-location="'+esc(value)+'" aria-pressed="'+(resultLocation===value)+'">'+esc(label)+'</button>').join('')+'</div>' : '';
  const cards = jobs.map(j => {
    const score = Math.max(0,Math.min(100,Number(j.score)||0));
    const chips = [...(j.matched||[]).slice(0,3).map(skill=>'<span class="fit-chip">'+esc(skill)+'</span>'),...(j.nearFit||[]).slice(0,1).map(skill=>'<span class="fit-chip learning">'+esc(skill.name)+' · ready '+esc(skill.readyBy)+'</span>'),...(j.gaps||[]).slice(0,1).map(skill=>'<span class="fit-chip gap">Gap: '+esc(skill)+'</span>')].join('');
    const meta=[j.company,j.location,j.workMode].filter(Boolean).map(esc).join(' · ');
    return '<article class="fit-card"><label class="share-job-check"><input type="checkbox" class="select-share-job" data-id="'+esc(j.id)+'" '+(sharedJobIds.has(j.id)?'checked':'')+' aria-label="Select '+esc(j.title)+' for sharing"> <span>Share</span></label><button class="fit-ring review '+(score<80?'warm':'')+'" data-id="'+esc(j.id)+'" aria-label="Explain '+score+'% match" title="'+esc(matchRationale(j))+'" aria-describedby="match-tip-'+esc(j.id)+'"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="42"/><circle class="ring-progress" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="'+score+' 100"/></svg><span>'+score+'<small>% match</small></span><span class="match-hover-tip" role="tooltip" id="match-tip-'+esc(j.id)+'">'+esc(matchRationale(j))+'</span></button><div class="fit-card-content"><h3>'+esc(j.title)+'</h3><p class="fit-meta">'+meta+'</p><div class="fit-chips">'+chips+'</div><div class="fit-footnote">'+(j.posted?'Posted '+esc(j.posted):'')+(j.salaryUnknown?' · Unknown salary':'')+'</div><div class="fit-card-tools"><button class="fit-text-action decision" data-id="'+esc(j.id)+'" data-status="Seen">Save Job</button><button class="fit-text-action decision" data-id="'+esc(j.id)+'" data-status="Applied">Applied Job</button><button class="fit-text-action review" data-view="interview" data-id="'+esc(j.id)+'">View & prepare ↗</button>'+(j.outreach?'<button class="fit-text-action review" data-view="outreach" data-id="'+esc(j.id)+'">Draft outreach email</button>':'')+'</div></div><button class="fit-open review" aria-label="Open '+esc(j.title)+' at '+esc(j.company)+'" data-id="'+esc(j.id)+'">Open <span aria-hidden="true">↗</span></button></article>';
  }).join('');
  $('#job-list').innerHTML = '<div class="fit-list-toolbar"><span>Ranked by your match score</span>'+locationTabs+'</div>'+(jobs.length?'<div class="fit-card-list">'+cards+'</div><p class="fit-list-count">'+jobs.length+' of '+state.jobs.length+' loaded matches shown</p>':'<div class="empty"><div class="upload-icon">◈</div><h3>'+(submitted?'No matching vacancies found':'Your next opportunity starts here')+'</h3><p>'+(submitted?'Try another location filter or adjust your search preferences.':'Upload your resume, confirm your profile and Submit to see your best matches.')+'</p></div>');
  document.querySelectorAll('[data-result-location]').forEach(button=>button.addEventListener('click',()=>{resultLocation=button.dataset.resultLocation;render();}));
  document.querySelectorAll('.review').forEach(button => button.addEventListener('click', () => showDetail(button.dataset.id, button.dataset.view)));
  document.querySelectorAll('.decision').forEach(button => button.addEventListener('click', () => action(() => saveDecision(button.dataset.id, button.dataset.status, button))));
  if (submitted && appliedLimit === 0) $('#job-list').innerHTML = '<div class="empty"><h3>0 records requested</h3><p>Select a maximum from 1 to 15 and run your search to display matching vacancies.</p></div>';
}
async function refresh() {
  if (demoMode) { render(); return; }
  const sequence = ++refreshSequence;
  const data = await api(`/api/state?${requestFilters()}`);
  if (sequence !== refreshSequence) return;
  state = data; render();
}
async function saveDecision(id, status, button) {
  if (button) button.disabled = true;
  try {
    if (demoMode) {
      const job = state.jobs.find(j => j.id === id);
      if (!job) return;
      job.status = status;
      state.decisionCounts[status === 'Seen' ? 'seen' : 'applied']++;
      render(); notify(`Demo vacancy marked ${status}. Your real decision history is unchanged.`); return;
    }
    await post('/api/decision', { id, status });
    if(typeof window!=='undefined')window.dispatchEvent(new Event('career-search-completed'));
    if(status==='Applied')state.jobs = state.jobs.filter(j => j.id !== id);else {const job=state.jobs.find(j=>j.id===id);if(job)job.status='Saved';}
    render();
    await refresh();
    notify(status==='Applied'?'Applied job recorded. It will not appear in future searches.':'Job saved. It remains available in searches.');
  } finally { if (button) button.disabled = false; }
}

function shareMessage(jobs){return 'Job opportunities — Your Next Move Awaits\n\n'+jobs.map(j=>j.title+' · '+j.company+'\n'+j.location+' · '+j.score+'% match\n'+(j.applyLink||'Application link unavailable')).join('\n\n');}
function showJobShare(){
 const visible=filtered();if(!visible.length){notify('Submit a search with matching jobs first.');return;}
 const picked=visible.filter(j=>sharedJobIds.has(j.id));
 detailSubview=false;detailVacancy=null;
 $('#detail-content').innerHTML='<h2>Share job opportunities</h2><label>Jobs<select id="share-scope"><option value="all">All displayed ('+visible.length+')</option><option value="selected" '+(picked.length?'selected':'')+'>Selected ('+picked.length+')</option></select></label><label>Recipient emails<input id="share-email" type="text" inputmode="email" placeholder="alex@example.com; sam@example.com" aria-describedby="share-recipient-help"></label><small id="share-recipient-help">Add up to 20 emails separated by commas (,) or semicolons (;). Multiple recipients are sent using BCC.</small><label><input id="share-email-confirm" type="checkbox"> Send the selected job report to these recipients</label><button id="share-send-email" class="primary">Send email</button><details id="share-mail-setup"><summary>Gmail sender setup</summary><label>Gmail address<input id="share-gmail-address" type="email" autocomplete="off"></label><label>16-character Gmail app password<input id="share-gmail-password" type="password" autocomplete="new-password"></label><label><input id="share-save-gmail" type="checkbox"> Store these credentials encrypted locally</label><button id="share-configure-gmail" class="secondary">Save sender</button><small>Use a Google app password, not your normal password.</small></details><h3>WhatsApp</h3><label>WhatsApp numbers with country codes<input id="share-phone" type="text" inputmode="tel" placeholder="+91 9876543210; +91 9123456780" aria-describedby="share-phone-help"></label><small id="share-phone-help">Add up to 20 numbers separated by commas (,) or semicolons (;). Include + and country code for each number.</small><div id="share-whatsapp-links"></div><button id="prepare-whatsapp" class="secondary">Prepare message</button><small>WhatsApp opens the selected job links for you to send.</small><p id="share-feedback" role="status"></p>';
 const jobs=()=>{const chosen=$('#share-scope').value==='selected'?picked:visible;if(!chosen.length)throw new Error('Select at least one job card.');return chosen;};
 const work=fn=>async()=>{try{await fn();}catch(e){$('#share-feedback').textContent=e.message;}};
 $('#share-configure-gmail').addEventListener('click',work(async()=>{if(!$('#share-save-gmail').checked)throw new Error('Confirm encrypted credential storage.');const result=await post('/api/career/gmail',{address:$('#share-gmail-address').value.trim(),appPassword:$('#share-gmail-password').value,save:true});$('#share-gmail-password').value='';$('#share-feedback').textContent=result.message;$('#share-mail-setup').open=false;}));
 fetch('/api/career/state').then(r=>r.json()).then(data=>{if(data.smtpConfigured){$('#share-feedback').textContent='Sender configured. Confirm the recipient and click Send email.';}else{$('#share-mail-setup').open=true;$('#share-feedback').textContent='Set up a Gmail sender before sending.';}}).catch(()=>{});
 $('#share-send-email').addEventListener('click',work(async()=>{if(demoMode)throw new Error('Email sharing is available for live results.');if(!$('#share-email-confirm').checked)throw new Error('Confirm the recipient before sending.');const button=$('#share-send-email');button.disabled=true;try{$('#share-feedback').textContent='Sending your job report…';const result=await post('/api/share/jobs',{ids:jobs().map(j=>j.id),action:'email',to:$('#share-email').value.trim(),confirm:true});$('#share-feedback').textContent=result.message;$('#share-email-confirm').checked=false;}finally{button.disabled=false;}}));
 $('#prepare-whatsapp').addEventListener('click',work(async()=>{const entries=$('#share-phone').value.split(/[,;]/).map(p=>p.replace(/[\s()-]/g,'')).filter(Boolean);if(!entries.length||entries.length>20||entries.some(p=>!/^\+[1-9]\d{7,14}$/.test(p)))throw new Error('Enter up to 20 international numbers, separated by commas or semicolons; include + and country code.');const phones=[...new Set(entries)],message=encodeURIComponent(shareMessage(jobs()));$('#share-whatsapp-links').innerHTML=phones.map(phone=>'<a class="secondary" target="_blank" rel="noopener noreferrer" href="https://wa.me/'+phone.slice(1)+'?text='+message+'">WhatsApp '+esc(phone)+' ↗</a>').join('');$('#share-feedback').textContent=phones.length+' messages prepared. Open each recipient link and send in WhatsApp.';}));
 $('#detail').showModal();
}
$('#share-jobs').addEventListener('click',showJobShare);
$('#sign-out').addEventListener('click',()=>action(async()=>{if(searching)return;const button=$('#sign-out');button.disabled=true;try{stopDictation();stopInterviewVoice();await post('/api/signout',{});sharedJobIds.clear();location.href='/';}catch(error){button.disabled=false;throw error;}}));
document.addEventListener?.('change',event=>{if(event.target.matches?.('.select-share-job')){const id=event.target.dataset.id;if(event.target.checked)sharedJobIds.add(id);else sharedJobIds.delete(id);}});
function explainMatch(j) {
  if(j.scoreParts)return Object.entries(j.scoreParts).map(([name,p])=>name+': '+Math.round(p.score)+'% × '+j.scoreWeights[name]+'% — '+p.reason).join('\n')+'\n'+j.requirements.map(r=>r.name+': '+r.status+(r.viaSynonym?' via synonym':'')+' — '+r.evidence+(r.readyBy?' ready by '+r.readyBy:'')).join('\n')+'\nVersion '+j.scoreVersion+'; confirmed profile '+j.profileVersion+'; scored '+j.scoredAt;

  return 'Advertised annual package: '+(typeof j.salaryMin==='number'&&typeof j.salaryMax==='number'?j.salaryCurrency+' '+(j.salaryMin/100000)+'–'+(j.salaryMax/100000)+' lakh ('+j.salaryPeriod+')':'Not provided')+'.\nScore: '+j.matched.length+' matched JD skills / '+j.required.length+' recognised JD skills × 100 = '+j.score+'% (rounded).\nResume skills: '+(j.candidateSkills||[]).join(', ')+'.\nJD skills: '+j.required.join(', ')+'.\nMatched: '+j.matched.join(', ')+'.\nGaps: '+(j.gaps.join(', ')||'None')+'.\nListed because it meets your submitted match threshold, selected location, confirmed open status and past-month posting window. Seen/Applied records are excluded; highest scores come first, up to your record limit. Selected designations filter job titles; selected business verticals filter supplied industry data.\nAll recognised skills are equally weighted. This is rule-based skill coverage, not a ChatGPT assessment or a hiring probability. Seniority, experience, negation and eligibility are not assessed. Review the actual JD before applying.';
}
async function downloadReport(format) {
  const options=demoMode?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({demo:true,jobs:filtered(),resume:JSON.parse($('#sample-data').textContent).resume})}:{};
  const response=await fetch('/api/export?'+requestFilters()+'&format='+format,options);
  if(!response.ok)throw new Error((await response.json()).error||'Export failed');
  const href=URL.createObjectURL(await response.blob()); const a=document.createElement('a');a.href=href;a.download=(demoMode?'sample-':'')+'job-matches.'+format;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
}
$('#export-excel').addEventListener('click',()=>action(()=>downloadReport('xlsx')));
$('#export-pdf').addEventListener('click',()=>action(()=>downloadReport('pdf')));
$('#export').addEventListener('click',event=>{if(demoMode){event.preventDefault();action(()=>downloadReport('csv'));}});

function link(url, label) { return url ? `<a class="secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : ''; }
function showDetail(id, view = 'details') {
  const j = state.jobs.find(j => j.id === id); if (!j) return; detailVacancy=j;detailSubview=view!=='details';
  if (view === 'interview') { showInterview(j); return; }
  const fields = [['Match %', j.score === null ? 'Unscored' : j.score + '%'], ['Status', j.status], ['Company', j.company], ['Job Title', j.title], ['Location', j.location], ['Posted', j.posted], ['Skills Matched', j.matched.join(', ')], ['Gaps', j.gaps.join(', ') || (j.required.length ? 'No recognised skill gaps' : '')], ['Recruiter', j.recruiter], ['Recruiter Role', j.recruiterRole], ['Email', j.email], ['Recruiter LinkedIn', j.recruiterLinkedIn], ['Your Referral Contact', j.referralContact], ['Contact Role', j.contactRole], ['Connection', j.connection], ['Contact LinkedIn', j.contactLinkedIn]];
  $('#detail-content').innerHTML = `<h2>${esc(j.title)}</h2><p>${esc(j.company)} · ${esc(j.location)}</p><div class="detail-grid">${fields.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '').map(([label, value]) => `<div class="detail-field"><small>${esc(label)}</small>${label==='Match %'?'<button type="button" class="detail-match-score" aria-describedby="detail-match-tip">'+esc(value)+'<span id="detail-match-tip" class="detail-match-tip" role="tooltip">'+esc(matchRationale(j))+'</span></button>':esc(value || 'Not provided')}</div>`).join('')}</div>${preparationHtml(j)}<details><summary>Full employer job description</summary><div class="detail-jd">${esc(j.description)}</div></details><h3 class="section-title">Mock Interview</h3><button id="start-mock" class="primary">🎙 Start interview · 15–20 min</button><div class="dialog-actions">${link(j.applyLink, 'Open application')}${link(j.recruiterLinkedIn, 'Recruiter')}${link(j.contactLinkedIn, 'Referral contact')}<button id="mark-reviewed" class="primary">Mark reviewed</button></div>`;
  if(view!=='outreach'){ $('#start-mock').addEventListener('click',()=>showInterview(j)); }
  if (view === 'outreach') $('#detail-content').innerHTML = `<h2>Draft outreach email</h2><p>${esc(j.title)} · ${esc(j.company)}</p>`;
  const draft = j.outreach;
  const outreach = document.createElement('section');
  outreach.className = 'outreach-section';
  outreach.innerHTML = draft ? `<h3>Outreach email</h3><p>Draft based on resume skills shared with this vacancy. Review the wording, complete the placeholders, and attach your resume in your email app. Nothing is sent automatically.</p><label>To<input id="outreach-to" type="email" value="${esc(draft.email)}"></label><label>Subject<input id="outreach-subject" value="${esc(draft.subject)}"></label><label>Message<textarea id="outreach-body" rows="16">${esc(draft.body)}</textarea></label><div class="dialog-actions"><button id="copy-outreach" class="secondary">Copy email</button><button id="open-outreach" class="primary">Open email app</button></div><p id="outreach-feedback" role="status"></p>` : '<h3>Outreach email</h3><p>No valid contact email was provided for this vacancy. An outreach draft will be available when the job source supplies one.</p>';
  if (view === 'outreach') $('#detail-content').append(outreach);
  if (draft && view === 'outreach') {
    $('#copy-outreach').addEventListener('click', () => action(async () => {
      await navigator.clipboard.writeText('To: '+$('#outreach-to').value+'\nSubject: '+$('#outreach-subject').value+'\n\n'+$('#outreach-body').value);
      $('#outreach-feedback').textContent = 'Email draft copied. Complete the placeholders before sending.';
    }));
    $('#open-outreach').addEventListener('click', () => {
      const recipient=$('#outreach-to');
      if (!recipient.value.trim() || !recipient.checkValidity()) { recipient.reportValidity(); return; }
      const a=document.createElement('a');
      a.href='mailto:'+encodeURIComponent(recipient.value.trim())+'?subject='+encodeURIComponent($('#outreach-subject').value)+'&body='+encodeURIComponent($('#outreach-body').value);
      a.click();
      $('#outreach-feedback').textContent='Email app requested. Attach your resume and review the draft before sending.';
    });
  }
  if (view === 'outreach') { if (!$('#detail').open) $('#detail').showModal(); return; }
  $('#mark-reviewed').textContent = 'Save Job';
  const applied = document.createElement('button'); applied.className = 'primary'; applied.textContent = 'Applied Job';
  $('#mark-reviewed').after(applied);
  $('#mark-reviewed').addEventListener('click', () => action(async () => { await saveDecision(id, 'Seen', $('#mark-reviewed')); $('#detail').close(); }));
  applied.addEventListener('click', () => action(async () => { await saveDecision(id, 'Applied', applied); $('#detail').close(); }));
  if (!$('#detail').open) $('#detail').showModal();
}
let activeDictation=null;
function stopDictation() { if(activeDictation){activeDictation.onresult=null;activeDictation.abort();activeDictation=null;}const start=$('#dictate-answer');if(start){start.disabled=false;start.textContent='🎤 Dictate answer';}const stop=$('#stop-dictation');if(stop)stop.disabled=true; }
function stopInterviewVoice() { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); }
function evaluatePracticeAnswer(answer,question,job,index) {
  const text=answer.toLowerCase(), words=text.match(/\b[\w'-]+\b/g)||[];
  const placeholder=/\[[^\]]+\]/.test(answer);
  const relevant=(job.required||[]).filter(skill=>text.includes(skill.toLowerCase()));
  const criteria=[
    {label:'Relevance to the vacancy',points:relevant.length?25: /role|vacancy|requirement|responsibilit/.test(text)?15:0},
    {label:'Specific example or concrete plan',points:/project|example|situation|task|first 30|first month|prioriti|plan/.test(text)?25:0},
    {label:'Personal actions and approach',points:/\bi (?:analys|develop|creat|built|led|work|test|implement|would|will|design|deliver|learn)|my (?:role|contribution|approach)/.test(text)?25:0},
    {label:'Outcome or success measure',points:/result|outcome|measur|improv|reduc|success|\d+\s*%/.test(text)?25:0}
  ];
  const patterns=[null,/project|example|situation|task|first 30|first month|prioriti|plan/i,/\bi (?:analys|develop|creat|built|led|work|test|implement|would|will|design|deliver|learn)|my (?:role|contribution|approach)/i,/result|outcome|measur|improv|reduc|success|\d+\s*%/i];
  const improvements=[
    'Link your example to a specific responsibility in the vacancy, explaining how the relevant skill was used.',
    'Describe the real situation or planned task, its objective, constraints and your role.',
    'Explain the steps you personally took, the reasoning behind your choices and how you handled difficulties.',
    'Give a truthful outcome, baseline and success measure. Explain how the result was measured.'
  ];
  criteria.forEach((c,i)=>{
    const cue=i===0 ? relevant.join(', ') || text.match(/role|vacancy|requirement|responsibilit/)?.[0] : answer.match(patterns[i])?.[0];
    c.rationale=cue ? 'Detected cue: “'+cue+'”. '+(i===0&&c.points===15?'Generic vacancy wording earns 15 points; a recognised required skill earns 25.':'This cue earns 25 points under the practice rubric; its presence does not establish the quality or truth of the example.') : 'No recognised cue was detected for this criterion, so 0 points were awarded. Different wording may be missed by this rubric.';
    c.improvement=improvements[i];
  });
  const rawScore=criteria.reduce((sum,c)=>sum+c.points,0);
  const caps=[];
  if(words.length<20)caps.push('Answer has '+words.length+' words (fewer than 20): score capped at 50%.');
  if(placeholder)caps.push('Unfilled bracketed placeholders detected: score capped at 50%.');
  let score=criteria.reduce((sum,c)=>sum+c.points,0);
  if(words.length<20)score=Math.min(score,50);
  if(placeholder)score=Math.min(score,50);
  const guidelines=criteria.map(c=>(c.points<25?'Priority — ':'Refine — ')+c.improvement);
  if(words.length<20)guidelines.push('Expand your answer with a concrete example, your actions and the outcome.');
  if(placeholder)guidelines.push('Replace all template placeholders with real details.');
  const skill=(job.matched||[])[0] || 'relevant skills';
  const template=index===3 && job.gaps?.length ? 'The role requires '+job.gaps[0]+'. My current level is [honest assessment]. My transferable experience is [real example]. I would prepare by [specific learning and practice steps], and demonstrate readiness through [deliverable and success measure].' : index===5 ? 'For the '+job.title+' role at '+job.company+', I would first clarify [priority from the vacancy]. In the first 30 days I would [specific actions and stakeholders], using '+skill+' where relevant. My first deliverable would be [deliverable], with success measured by [metric]. A real example supporting this approach is [resume project].' : 'For the '+job.title+' role at '+job.company+', my relevant example is [real resume project]. The situation and objective were [context]. My responsibility was [your role]. I used '+skill+' to [specific actions relevant to this question]. The result was [truthful outcome or metric]. This relates to the vacancy because [specific responsibility from the job description].';
  return {score,rawScore,caps,criteria,guidelines,template,question};
}
function showInterview(j) {
  detailVacancy=j;detailSubview=true;
  stopInterviewVoice();
  let selectedVoice=''; let followUp=''; const began=Date.now(); let paused=false;
  if(typeof setInterval==='function'){const clock=setInterval(()=>{if(!$('#detail').open||!detailSubview||!$('#session-clock')){clearInterval(clock);return;}const elapsed=Math.floor((Date.now()-began)/1000);if($('#session-clock'))$('#session-clock').textContent=Math.floor(elapsed/60).toString().padStart(2,'0')+':'+(elapsed%60).toString().padStart(2,'0')+' / 20:00';if(elapsed>=1200){stopDictation();stopInterviewVoice();clearInterval(clock);$('#detail-content').innerHTML='<h2>Practice complete</h2><p>Your 20-minute session has ended.</p>'; }},1000);}
  const voiceSupported=typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
  function voices() { return voiceSupported ? reenaVoices(speechSynthesis.getVoices()) : []; }
  function speakQuestion() {
    if (!voiceSupported) return;
    stopInterviewVoice();
    const available=voices();
    const voice=available.find(v=>v.voiceURI===selectedVoice) || available[0];
    const utterance=new SpeechSynthesisUtterance(followUp || 'Question '+(index+1)+'. '+questions[index]);
    if(voice)utterance.voice=voice;
    utterance.lang=voice?.lang || 'en-IN';utterance.rate=0.9;utterance.pitch=0.95;
    utterance.onerror=()=>{if($('#voice-feedback'))$('#voice-feedback').textContent='Voice playback was unavailable. Choose a voice and try Replay question.';};
    speechSynthesis.speak(utterance);
  }
  function populateVoices() {
    if(!$('#interview-voice'))return;
    const available=voices();
    if(!selectedVoice)selectedVoice=available[0]?.voiceURI || '';
    $('#interview-voice').innerHTML=available.map(v=>'<option value="'+esc(v.voiceURI)+'">'+esc(v.name)+' ('+esc(v.lang)+')</option>').join('') || '<option value="">Browser default voice</option>';
    $('#interview-voice').value=selectedVoice;
    $('#voice-feedback').textContent=available.some(v=>/reena/i.test(v.name)) ? 'Reena is available and selected by default.' : 'Reena is not available on this device. Choose an installed voice below; Indian English is preferred as the fallback.';
  }
  const skills=j.matched || [], gaps=j.gaps || [];
  const focus=skills[0] || j.required?.[0] || 'the vacancy requirements';
  const questions=[
    'Why are you interested in the '+j.title+' role at '+j.company+', and which resume examples best demonstrate your fit?',
    'Describe a real project where you used '+focus+'. What was your personal contribution and the outcome?',
    'How would you apply '+(skills[1] || focus)+' to a specific responsibility in this vacancy? Walk me through your approach.',
    gaps.length ? 'The vacancy mentions '+gaps[0]+', which was not identified in your resume. What transferable experience and preparation would help you meet this requirement?' : 'Which responsibility of this vacancy would challenge you most, and how would you prepare?',
    'Describe a time you resolved a difficult requirement or delivery problem with colleagues. How does that example relate to this '+j.title+' role?',
    'Based on this vacancy, what would you prioritise in your first 30 days at '+j.company+', and how would you measure your contribution?'
  ];
  let index=0;const answers=Array(6).fill('');
  function draw() {
    stopDictation();
    $('#detail-content').innerHTML=`<h2>Voice interview</h2><p>${esc(j.title)} · ${esc(j.company)}</p><div class="interview-session-bar"><span>🎙 Reena · 15–20 min practice</span><button id="pause-interview" class="secondary">Pause</button><button id="exit-interview" class="secondary">Exit interview</button></div><small id="session-clock">00:00 / 20:00</small><section class="voice-controls"><label>Interviewer voice · Reena preferred<select id="interview-voice"></select></label><div class="dialog-actions"><button id="replay-question" class="primary">▶ Replay question</button><button id="stop-question" class="secondary">Stop voice</button></div><p id="voice-feedback" role="status"></p></section><div class="interview-progress">Question ${index+1} of 6</div><section class="interview"><h3 id="question-caption">${esc(followUp || questions[index])}</h3><label>Your answer<textarea id="interview-answer" rows="7">${esc(answers[index])}</textarea></label><div class="dialog-actions"><button id="dictate-answer" class="secondary">🎤 Dictate answer</button><button id="stop-dictation" class="secondary">Stop dictation</button><button id="evaluate-answer" class="primary">Evaluate answer</button></div><p class="fine dictation-fallback">If browser dictation fails, click the answer box and press <strong>Windows + H</strong> for voice typing.</p><p id="dictation-status" role="status" aria-live="polite"></p><p id="dictation-preview" class="fine" aria-live="polite"></p><details><summary>Voice typing alternative</summary><p class="fine">If browser dictation fails, click the answer box and press Windows + H. Windows voice typing inserts text directly into the answer. Enable Windows online speech recognition if prompted.</p></details><div id="answer-evaluation" aria-live="polite"></div><details><summary>Suggested answer</summary><p class="interview-answer-summary">${esc(j.preparation?.answers[index] || "Use a verified project example: situation, your actions, outcome and relevance to this role.")}</p></details></section><div class="dialog-actions"><button id="previous-question" class="secondary" ${index===0?'disabled':''}>Previous</button><button id="next-question" class="primary">${index===5?'Finish interview':'Next question'}</button></div>`;
    $('#pause-interview').addEventListener('click',()=>{paused=!paused;stopDictation();stopInterviewVoice();$('#pause-interview').textContent=paused?'Resume':'Pause';$('#next-question').disabled=paused;$('#dictate-answer').disabled=paused;$('#evaluate-answer').disabled=paused;if(!paused)speakQuestion();});
    $('#exit-interview').addEventListener('click',()=>{stopDictation();stopInterviewVoice();showDetail(j.id);});
    const Recognition=typeof SpeechRecognition!=='undefined'?SpeechRecognition:typeof webkitSpeechRecognition!=='undefined'?webkitSpeechRecognition:null;
    $('#stop-dictation').disabled=true;
    $('#stop-dictation').addEventListener('click',()=>{if(activeDictation?.stop){activeDictation.stop();$('#dictation-status').textContent='Finishing transcription…';}else{stopDictation();$('#dictation-status').textContent='Dictation stopped. You can edit the transcript.';}$('#stop-dictation').disabled=true;});
    $('#dictate-answer').addEventListener('click',()=>{
      if(!Recognition)return;
      stopDictation();stopInterviewVoice();
      const recognition=new Recognition();activeDictation=recognition;
      recognition.lang='en-IN';recognition.continuous=true;recognition.interimResults=true;
      recognition.maxAlternatives=1;
      recognition.onstart=()=>{$('#dictate-answer').disabled=true;$('#dictate-answer').textContent='🎤 Listening…';$('#stop-dictation').disabled=false;$('#dictation-status').textContent='Microphone active. Speak your answer; text will appear below.';};
      const field=$('#interview-answer');let committed=field.value;
      $('#dictation-preview').textContent='';
      recognition.onresult=event=>{
        let interim='';for(let n=event.resultIndex;n<event.results.length;n++)if(!event.results[n].isFinal)interim+=event.results[n][0].transcript;$('#dictation-preview').textContent=interim?'Hearing: '+interim:'';if(interim)field.value=committed+(committed.trim()?' ':'')+interim;
        for(let n=event.resultIndex;n<event.results.length;n++)if(event.results[n].isFinal){const transcript=event.results[n][0].transcript;const reply=conversationalReply(transcript);if(reply){field.value=committed;stopDictation();if(reply==='exit'){stopInterviewVoice();showDetail(j.id);return;}if(reply==='repeat'){speakQuestion();return;}$('#voice-feedback').textContent=reply;if(voiceSupported){stopInterviewVoice();const response=new SpeechSynthesisUtterance(reply);const selected=voices().find(v=>v.voiceURI===selectedVoice)||voices()[0];if(selected)response.voice=selected;response.lang='en-IN';speechSynthesis.speak(response);}continue;}committed+=(committed.trim()?' ':'')+transcript;field.value=committed;}
        answers[index]=field.value;$('#answer-evaluation').innerHTML='';
      };
      let recognitionFailed=false;
      function resetDictationButtons(){$('#dictate-answer').disabled=false;$('#dictate-answer').textContent='🎤 Dictate answer';$('#stop-dictation').disabled=true;}
      recognition.onerror=event=>{recognitionFailed=true;const errors={'not-allowed':'Microphone access was blocked. Allow the microphone for localhost in browser site settings, then retry.','service-not-allowed':'This browser blocks the speech service. Open http://localhost:3000/ in Microsoft Edge or Google Chrome.','audio-capture':'No working microphone was found. Check Windows microphone access and your selected input device.','network':'The browser speech service could not connect. Check your internet connection, or open this app in Microsoft Edge or Google Chrome.','no-speech':'No speech was detected. Move closer to the microphone and click Dictate answer again.','aborted':'Dictation stopped.'};$('#dictation-status').textContent=errors[event.error]||'Speech recognition failed ('+event.error+'). Try Edge or Chrome, or focus the answer box and press Windows + H.';resetDictationButtons();};
      recognition.onend=()=>{if(activeDictation===recognition){activeDictation=null;resetDictationButtons();if(!recognitionFailed)$('#dictation-status').textContent='Listening finished. Click Dictate answer to continue.';}};
      try{recognition.start();$('#dictation-status').textContent='Requesting microphone access… Your browser may use an online speech service.';}catch(error){activeDictation=null;resetDictationButtons();$('#dictation-status').textContent='Could not start dictation: '+error.message+'. Try Microsoft Edge or Google Chrome.';}
    });
    if(!Recognition){$('#dictate-answer').disabled=true;$('#dictation-status').textContent='Speech recognition is unavailable in this browser. Open http://localhost:3000/ in Microsoft Edge or Google Chrome to dictate, or focus the answer box and press Windows + H for Windows voice typing.';}
    $('#interview-answer').addEventListener('input',()=>{$('#answer-evaluation').innerHTML='';});
    $('#evaluate-answer').addEventListener('click',()=>{
      stopDictation();const answer=$('#interview-answer').value.trim();answers[index]=answer;
      if(!answer){$('#answer-evaluation').innerHTML='<p>Please provide an answer before evaluating.</p>';return;}
      const evaluation=evaluatePracticeAnswer(answer,questions[index],j,index);
      if(j.preparation?.answers[index])evaluation.template=j.preparation.answers[index];
      $('#answer-evaluation').innerHTML='<section class="match-reasoning"><h3>Practice score: '+evaluation.score+'% · '+(evaluation.score>=75?'Strong structure':'Try again')+'</h3><ul>'+evaluation.guidelines.slice(0,3).map(g=>'<li>'+esc(g)+'</li>').join('')+'</ul><details><summary>Why you received this score</summary>'+evaluation.criteria.map(c=>'<p>'+esc(c.label)+': '+c.points+'/25 · '+esc(c.rationale)+'</p>').join('')+evaluation.caps.map(c=>'<p>'+esc(c)+'</p>').join('')+'</details><small>Practice rubric · factual accuracy is not verified</small>'+(evaluation.score<75?'<h4>Suggested answer</h4><textarea id="answer-template" rows="7">'+esc(evaluation.template)+'</textarea><button id="use-answer-template" class="secondary">Practice this answer</button>':'')+'</section>';
      followUp=evaluation.score>=75?'':evaluation.criteria.find(c=>c.points<25)?.label.toLowerCase().includes('result')?'What was the outcome, and how did you measure it?':evaluation.criteria.find(c=>c.points<25)?.label.toLowerCase().includes('action')?'What did you personally do, and why did you choose that approach?':'Could you give a specific example and connect it to this vacancy?';if(followUp){$('#question-caption').textContent=followUp;speakQuestion();}else if(voiceSupported){stopInterviewVoice();const feedback=new SpeechSynthesisUtterance('Thank you. That answer has a clear structure. Let us move on when you are ready.');feedback.lang='en-IN';speechSynthesis.speak(feedback);}
      if(evaluation.score<75)$('#use-answer-template').addEventListener('click',()=>{$('#interview-answer').value=$('#answer-template').value;answers[index]=$('#interview-answer').value;$('#answer-evaluation').innerHTML='';});
    });
    if(voiceSupported){
      populateVoices();
      speechSynthesis.onvoiceschanged=populateVoices;
      $('#interview-voice').addEventListener('change',()=>{selectedVoice=$('#interview-voice').value;speakQuestion();});
      $('#replay-question').addEventListener('click',speakQuestion);
      $('#stop-question').addEventListener('click',stopInterviewVoice);
      speakQuestion();
    }else{
      $('#voice-feedback').textContent='Voice playback is not supported in this browser. Open the application in Chrome or Edge to try the voice interview.';
      $('#replay-question').disabled=true;$('#stop-question').disabled=true;$('#interview-voice').disabled=true;
    }
    $('#previous-question').addEventListener('click',()=>{answers[index]=$('#interview-answer').value;index--;followUp='';draw();});
    $('#next-question').addEventListener('click',()=>{stopDictation();answers[index]=$('#interview-answer').value;if(index<5){index++;followUp='';draw();}else{
      stopInterviewVoice();
      $('#detail-content').innerHTML=`<h2>Interview complete</h2><p>Review your answers for ${esc(j.title)}.</p>${questions.map((q,i)=>`<section class="interview"><h3>${i+1}. ${esc(q)}</h3><p class="interview-answer-summary">${esc(answers[i] || 'No answer entered.')}</p></section>`).join('')}`;
    }});
  }
  draw();if (!$('#detail').open) $('#detail').showModal();
}
$('#close-detail').addEventListener('click', () => { stopDictation(); stopInterviewVoice(); if(detailSubview&&detailVacancy){showDetail(detailVacancy.id);return;}$('#detail').close(); });
$('#detail').addEventListener('close',stopInterviewVoice);
$('#detail').addEventListener('cancel',()=>{stopDictation();stopInterviewVoice();});
$('#detail').addEventListener('close',stopDictation);
$('#total-experience').addEventListener('input', render);
$('#threshold').addEventListener('change', () => notify('Click Submit to apply the selected match percentage.'));
$('#record-limit').addEventListener('change', () => notify('Click Submit to apply the selected maximum records.'));
$('#search').addEventListener('input', () => { if (submitted) action(async () => {
  await refresh();
  if (typeof location !== 'undefined') { const message = new URLSearchParams(location.search).get('linkedin_error'); if (message) { notify(message); if(typeof history !== 'undefined')history.replaceState(null,'','/#connections'); } }
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('linkedin') === 'connected' && state.linkedin) {
    notify('LinkedIn profile connected successfully as '+state.linkedin.name+'. Profile sign-in is complete; job listings require a separate authorised job-data integration.');
    if(typeof history !== 'undefined')history.replaceState(null,'','/#connections');
  }
}); else render(); });
let searchEngagementTimer;
function startSearchEngagement() {
  applicationGuide?.tell('I am checking the selected employers for matching openings. Please wait for your results.');
  $('#search-engagement').hidden = false;
  $('#matches').setAttribute?.('aria-busy', 'true');
  setSearchPhase(demoMode ? 'Reviewing your sample matches' : 'Looking for your next opportunity', demoMode ? 'Applying your preferences to fictional sample vacancies.' : 'Checking selected job sources for fresh openings.');
  const tips = ['Only open vacancies posted within the last month are eligible.', 'Your match threshold and location preferences help narrow the results.', 'Applied jobs stay out of future searches. Saved jobs remain searchable.', 'Open a match to explore the skills you share and any gaps.'];
  let index = 0;
  $('#search-progress-tip').textContent = tips[0];
  if (typeof setInterval === 'function') searchEngagementTimer = setInterval(() => {
    $('#search-progress-tip').textContent = tips[++index % tips.length];
  }, 6500);
  $('#search-engagement').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function setSearchPhase(title, message) {
  $('#search-progress-title').textContent = title;
  $('#search-progress-message').textContent = message;
}
function stopSearchEngagement() {
  if (searchEngagementTimer !== undefined && typeof clearInterval === 'function') clearInterval(searchEngagementTimer);
  searchEngagementTimer = undefined;
  $('#search-engagement').hidden = true;
  $('#matches').setAttribute?.('aria-busy', 'false');
}
async function runSearch(isRefresh = false, manual = false) {
  if(!manual&&formWizard&&!formWizard.validate())return;
  if (searching) return;
  searching = true; render();
  try {
    if (!state.resumeReady) throw new Error('Upload your resume first.');
    if (!manual && requiredErrors().length) throw new Error(requiredErrors().join(' '));
    startSearchEngagement();
    notify(isRefresh ? 'Refreshing vacancies and matching your resume…' : 'Finding matching vacancies…');
    let bankNotice = '';
    if (state.bankSourcesAvailable && selectedBanks().length && !manual && !demoMode) {
      const result = await post('/api/bank-search', { banks: selectedBanks(), threshold: $('#threshold').value, limit: $('#record-limit').value, locations: locationPreferences, designations: designationPreferences, today: localToday() });
      bankNotice = result.messages.join(' ');
    }
    if (state.feedConfigured && !manual && !demoMode) await post('/api/feed', { threshold: $('#threshold').value, limit: $('#record-limit').value, locations: locationPreferences, experience: experienceProfile() });
    appliedThreshold = Number($('#threshold').value); submitted = true;
    appliedLocations = JSON.parse(JSON.stringify(locationPreferences)); resultLocation = 'all';
    appliedDesignations = [...designationPreferences];
    appliedPackage = $('#package-bucket').value || 'any';
    appliedVerticals = [...verticalPreferences];
    const requestedLimit = Number($('#record-limit').value);
    appliedLimit = Number.isFinite(requestedLimit) ? Math.max(0, Math.min(15, Math.trunc(requestedLimit))) : 5;
    setSearchPhase('Preparing your best matches', 'Loading match scores and applying your search preferences.');
    await refresh();
    if($('#matches')?.nodeType)$('#matches').hidden=false;
    showSearchResults();
    if(typeof window!=='undefined')window.dispatchEvent(new Event('career-search-completed'));
    if (demoMode) { notify(`${filtered().length} fictional sample vacancies match your selection. No real jobs or connections are used.`); $('#matches').scrollIntoView({ behavior: 'smooth' }); return; }
    notify(`${filtered().length} matching vacancies at ${appliedThreshold}% or above.${state.bankSourcesAvailable ? ' Employer careers pilot searched.' : state.feedConfigured ? ' Configured job feed refreshed.' : ' Using added or imported vacancies.'}`);
    if (bankNotice) notify(`${filtered().length} matching vacancies found.`);
    applicationGuide?.tell(filtered().length?'Your matches are ready. Open a vacancy to review it, save it or apply.':'No jobs matched this search. Try a broader role, another city or a lower match threshold.');
    $('#matches').scrollIntoView({ behavior: 'smooth' });
  } finally { stopSearchEngagement(); searching = false; render(); }
}
$('#submit-search').addEventListener('click', () => action(async () => {
  const feedback = $('#submit-feedback'); if (feedback) { feedback.hidden = true; feedback.textContent = ''; }
  try { await runSearch(); }
  catch (error) { if (feedback) { feedback.textContent = error.message; feedback.hidden = false; } throw error; }
}));
async function resetWorkspace() {
  if (demoMode) await exitDemo();
  if (searching) return;
  searching = true; render();
  try {
    await post('/api/clear', {});
    resultLocation='all'; submitted = false; appliedThreshold = 75; appliedLimit = 5;sharedJobIds.clear();
    document.querySelectorAll('#connections input[type=checkbox]').forEach(input=>{input.checked=input.defaultChecked;});
    document.querySelectorAll('.optional-preferences,.international-locations,.role-group').forEach(section=>{section.open=false;});
    locationPreferences = []; appliedLocations = []; designationPreferences = []; appliedDesignations = []; relevantExperience = {}; verticalPreferences = []; appliedVerticals = []; renderVerticals(); appliedPackage = 'any'; $('#package-bucket').value = 'any'; $('#total-experience').value = ''; $('#custom-designation').value = ''; renderDesignations(); renderLocations();
    $('#country-choice').value = 'United States'; populateStates();
    $('#custom-country').value = ''; $('#custom-state').value = ''; $('#custom-city').value = '';
    $('#threshold').value = '75'; $('#record-limit').value = '5';
    $('#search').value = ''; $('#resume').value = ''; $('#profile-link').value = '';
    profileLinks.length = 0; $('#saved-links').innerHTML = '';
    document.querySelectorAll('.profile-shortcuts').forEach(section => { section.open = false; });
    if ($('#detail').open) $('#detail').close();
    await refresh();
    formWizard?.reset();if($('#form-wizard')?.nodeType){$('#form-wizard').hidden=false;document.querySelector('.intro').hidden=false;document.querySelector('.demo-panel').hidden=false;$('#edit-search').hidden=true;}
    notify('Search reset. Defaults restored: 75% match and 5 records. Saved and Applied history is preserved.');
    applicationGuide?.tell('Your form has been reset. Upload your resume to start a new search.');
    $('#form-wizard')?.scrollIntoView({behavior:'smooth',block:'start'});
  } finally { searching = false; render(); }
}
$('#refresh-search').addEventListener('click', () => action(resetWorkspace));
$('#resume').addEventListener('change', event => action(async () => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 5 * 1024 * 1024) throw new Error('Upload a file smaller than 5 MB.');
  if (demoMode) await exitDemo();
  applicationGuide?.tell('I am reading your resume. I will confirm when it is ready.'); notify('Reading your resume…');
  await api('/api/resume', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
  submitted = false;
  if(typeof window!=='undefined')window.dispatchEvent(new Event('career-profile-updated'));
  await refresh(); applicationGuide?.uploaded(); notify('Your resume has been uploaded successfully. Choose your search preferences, then click Submit.'); event.target.value = '';
}));
$('#connect-linkedin').addEventListener('click', () => {
  stopDictation();stopInterviewVoice();
  if (state.linkedinConfigured && !demoMode) { location.href = '/auth/linkedin'; return; }
  $('#detail-content').innerHTML = `<h2>Connect LinkedIn</h2><p>${demoMode ? 'You are reviewing sample data. Exit the demo before connecting your real profile.' : 'LinkedIn connection is not configured for this application yet.'}</p><p>When enabled, Connect opens LinkedIn’s own sign-in page. Enter your email and password there, then approve access and return to this application.</p><ol class="connection-flow"><li>Enable the application’s LinkedIn integration.</li><li>Click Connect here and sign in on LinkedIn.</li><li>Approve profile access.</li><li>Return automatically to this application and see the verified confirmation.</li></ol><p>Job-data access is separate from profile sign-in. Opening a standalone login page cannot complete this flow.</p><div class="dialog-actions"><a class="primary" href="https://www.linkedin.com/developers/apps" target="_blank" rel="noopener noreferrer">Set up LinkedIn application ↗</a>${demoMode ? '<button id="leave-demo-connect" class="secondary">Exit sample mode</button>' : ''}</div><details class="match-reasoning"><summary>Application owner: enable LinkedIn connection</summary><ol><li>Create a LinkedIn developer app and enable “Sign In with LinkedIn using OpenID Connect”.</li><li>Register the callback: <code>http://localhost:3000/auth/linkedin/callback</code>.</li><li>Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in the server’s .env file, then restart the application. These are app credentials, not your LinkedIn username and password.</li></ol><a href="https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2" target="_blank" rel="noopener noreferrer">LinkedIn setup instructions ↗</a></details>`;
  if(demoMode)$('#leave-demo-connect').addEventListener('click',()=>action(async()=>{await exitDemo();$('#detail').close();}));
  if(!$('#detail').open)$('#detail').showModal();
});
$('#connect-naukri').addEventListener('click', () => {
  stopDictation();stopInterviewVoice();
  const ready=!!state.jobSources?.naukri;
  $('#detail-content').innerHTML=`<h2>Connect Naukri</h2><p>${demoMode?'Sample mode: real accounts are not connected.':ready?'An authorised Naukri job feed is configured.':'Naukri integration setup is required.'}</p><ol class="connection-flow"><li>Application owner obtains authorised Naukri integration access.</li><li>Configure the approved provider connection on the server.</li><li>Upload your resume and complete your preferences.</li><li>Click Submit to read vacancies from the configured feed and show matching jobs.</li></ol><p>This application does not currently have a Naukri account sign-in or callback integration. Logging into Naukri separately cannot connect your profile or return a verified connection to this application.</p><div class="dialog-actions"><button id="return-from-naukri" class="primary">Return to application</button></div><details class="match-reasoning"><summary>Application owner: integration setup</summary><p>Obtain the approved provider’s API documentation and credentials. The current feed adapter accepts an authorised HTTPS JSON vacancy feed using JOB_FEED_URL, JOB_FEED_SOURCE=naukri and, if needed, JOB_FEED_TOKEN. Configure these in .env and restart the server. Personal Naukri passwords are not integration credentials.</p></details>`;
  $('#return-from-naukri').addEventListener('click',()=>$('#detail').close());
  if(!$('#detail').open)$('#detail').showModal();
});
const profileLinks = [];

const verticalOptions=['Banking','Professional Services','Consulting','Retail','Pharma','Healthcare','Logistics','Aerospace','Insurance','Financial Services','Technology','Telecommunications','Manufacturing','Automotive','Energy','Education','Hospitality','Real Estate','Media','Government'];
function verticalName(value){return String(value||'').toLowerCase().trim().replace(/^logisics$/,'logistics').replace(/^pharmaceuticals?$/,'pharma').replace(/^health care$/,'healthcare');}
function verticalMatches(job){const values=Array.isArray(job.businessVerticals)?job.businessVerticals:[];return !appliedVerticals.length||appliedVerticals.some(v=>values.some(x=>verticalName(x)===verticalName(v)));}
function renderVerticals(){
  $('#vertical-options').innerHTML=verticalOptions.map(v=>'<label><input class="vertical-choice" type="checkbox" value="'+esc(v)+'" '+(verticalPreferences.includes(v)?'checked':'')+'>'+esc(v)+'</label>').join('');
  document.querySelectorAll('.vertical-choice').forEach(input=>input.addEventListener('change',()=>{verticalPreferences=verticalPreferences.filter(v=>v!==input.value);if(input.checked)verticalPreferences.push(input.value);notify('Business verticals updated. Click Submit to apply them.');}));
}
renderVerticals();


const designationOptions = ['Business Analyst','Data Analyst','Regulatory Reporting Analyst','Project Manager','Software Engineer','Data Engineer','Data Scientist','QA Engineer','DevOps Engineer','Risk Analyst','Financial Analyst',
  'HR Executive','HR Generalist','HR Manager','HR Business Partner','Talent Acquisition Specialist','Talent Acquisition Manager','Recruiter','Learning and Development Specialist','Compensation and Benefits Specialist','HR Operations Specialist',
  'Sales Executive','Sales Manager','Business Development Executive','Business Development Manager','Account Manager','Key Account Manager','Regional Sales Manager','Sales Operations Analyst',
  'Marketing Executive','Marketing Manager','Digital Marketing Specialist','Digital Marketing Manager','Brand Manager','Content Marketing Specialist','SEO Specialist','Performance Marketing Manager','Product Marketing Manager',
  'Associate Product Manager','Product Manager','Senior Product Manager','Product Owner','Product Analyst','Product Operations Manager','Head of Product'];
function roleText(value) { return String(value || '').toLowerCase().replace(/\bba\b/g,'business analyst').replace(/[^a-z0-9]+/g,' ').trim(); }
function designationMatches(job) { const title=' '+roleText(job.title)+' ';return !appliedDesignations.length || appliedDesignations.some(role=>title.includes(' '+roleText(role)+' ')); }
function renderDesignations() {
  const roleGroups = [ ['Analysis & technology', designationOptions.slice(0,11)], ['Human resources', designationOptions.slice(11,21)], ['Sales & business development', designationOptions.slice(21,29)], ['Marketing', designationOptions.slice(29,38)], ['Product', designationOptions.slice(38)] ];
  $('#designation-options').innerHTML = roleGroups.map(([name, roles], index) => '<details class="role-group" '+(index===0 || roles.some(role=>designationPreferences.includes(role)) ? 'open' : '')+'><summary>'+esc(name)+'<span>'+roles.filter(role=>designationPreferences.includes(role)).length+' selected</span></summary><div class="role-group-options">'+roles.map(role=>'<label><input type="checkbox" class="designation-choice" value="'+esc(role)+'" '+(designationPreferences.includes(role)?'checked':'')+'>'+esc(role)+'</label>').join('')+'</div></details>').join('');
  document.querySelectorAll('.designation-choice').forEach(input=>input.addEventListener('change',()=>{designationPreferences=designationPreferences.filter(role=>role!==input.value);if(input.checked)designationPreferences.push(input.value);renderDesignations();notify('Designation preferences updated. Click Submit to apply them.');}));
  $('#selected-designations').innerHTML=designationPreferences.map((role,i)=>'<button class="secondary remove-designation" type="button" data-index="'+i+'" aria-label="Remove '+esc(role)+'">'+esc(role)+' ×</button>').join('');
  document.querySelectorAll('.remove-designation').forEach(button=>button.addEventListener('click',()=>{designationPreferences.splice(Number(button.dataset.index),1);renderDesignations();}));
  $('#relevant-experience-fields').innerHTML=designationPreferences.map((role,i)=>'<label class="experience-role" for="role-experience-'+i+'"><span>'+esc(role)+' — relevant years</span><input id="role-experience-'+i+'" class="role-experience" data-role="'+esc(role)+'" type="number" min="0" max="80" step="0.1" placeholder="e.g. 4" value="'+esc(relevantExperience[role]??'')+'"></label>').join('');
  document.querySelectorAll('.role-experience').forEach(input=>input.addEventListener('input',()=>{relevantExperience[input.dataset.role]=input.value;render();}));
  render();

}
$('#add-designation').addEventListener('click',()=>action(()=>{const role=$('#custom-designation').value.trim();if(!role)throw new Error('Enter a job designation.');if(designationPreferences.length>=20)throw new Error('Select up to 20 job designations.');if(!designationPreferences.some(r=>roleText(r)===roleText(role)))designationPreferences.push(role);$('#custom-designation').value='';renderDesignations();notify('Designation added. Click Submit to apply it.');}));
renderDesignations();


function renderLocations() {
  $('#india-cities').innerHTML = indiaCities.map(city => '<label><input type="checkbox" class="india-location" value="'+esc(city)+'" '+(locationPreferences.some(p => p.country === 'India' && p.city === city) ? 'checked' : '')+'>'+esc(city)+'</label>').join('');
  document.querySelectorAll('.india-location').forEach(input => input.addEventListener('change', () => {
    locationPreferences = locationPreferences.filter(p => !(p.country === 'India' && p.city === input.value));
    if (input.checked) locationPreferences.push({country:'India',city:input.value,state:''});
    renderLocations(); notify('Location preferences updated. Click Submit to apply them.');
  }));
  $('#selected-locations').innerHTML = locationPreferences.map((p,i) => '<button class="secondary remove-location" data-index="'+i+'" type="button" aria-label="Remove '+esc(p.city)+'">'+esc(p.city)+', '+esc(p.country)+' ×</button>').join('');
  document.querySelectorAll('.remove-location').forEach(button => button.addEventListener('click', () => {locationPreferences.splice(Number(button.dataset.index),1);renderLocations();}));
  render();
}
function populateStates() {
  const states=Object.keys(geography[$('#country-choice').value] || {});
  $('#state-choice').innerHTML=states.map(s=>'<option>'+esc(s)+'</option>').join('');
  $('#state-choice').value=states[0] || '';populateCities();
}
function populateCities() {
  const cities=geography[$('#country-choice').value]?.[$('#state-choice').value] || [];
  $('#city-choice').innerHTML=cities.map(c=>'<option>'+esc(c)+'</option>').join('');$('#city-choice').value=cities[0] || '';
}
function addLocation(place) {
  if (!place.country || !place.city) throw new Error('Choose or enter a country and city.');
  if (locationPreferences.length>=30) throw new Error('Select up to 30 preferred locations.');
  if (!locationPreferences.some(p=>cityName(p.city)===cityName(place.city)&&cityName(p.country)===cityName(place.country))) locationPreferences.push(place);
  renderLocations();notify('Location added. Click Submit to apply preferences.');
}
$('#country-choice').innerHTML=Object.keys(geography).map(c=>'<option>'+esc(c)+'</option>').join('');
$('#country-choice').value='United States';populateStates();renderLocations();
$('#country-choice').addEventListener('change',populateStates);$('#state-choice').addEventListener('change',populateCities);
$('#add-location').addEventListener('click',()=>action(()=>addLocation({country:$('#country-choice').value,state:$('#state-choice').value,city:$('#city-choice').value})));
$('#add-custom-location').addEventListener('click',()=>action(()=>addLocation({country:$('#custom-country').value.trim(),state:$('#custom-state').value.trim(),city:$('#custom-city').value.trim()})));

function loadDemo() {
  if (searching) return;
  ++refreshSequence;
  state = JSON.parse($('#sample-data').textContent);
  $('#total-experience').value = '5';
  designationPreferences = [...new Set(state.jobs.map(job => job.title))];
  relevantExperience = {}; renderDesignations();
  state.jobs.forEach((job, index) => {
    const date = new Date(); date.setDate(date.getDate() - (index + 1) * 4);
    job.posted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    job.applicationOpen = true; job.country = 'India'; job.status = 'New';
    const salaries=[[1800000,2400000],[2400000,3200000],[1200000,1800000],[600000,1000000]];job.salaryMin=salaries[index][0];job.salaryMax=salaries[index][1];job.salaryCurrency='INR';job.salaryPeriod='annual';job.businessVerticals=['Banking'];
  });
  locationPreferences = state.jobs.map(job => ({ country: 'India', city: job.location, state: '' }));
  renderLocations();
  appliedLocations = JSON.parse(JSON.stringify(locationPreferences));
  demoMode = true; submitted = false; appliedThreshold = 75; appliedLimit = 5;
  $('#threshold').value = '75'; $('#record-limit').value = '5'; $('#search').value = '';
  render(); notify('Sample resume and search preferences loaded. Review the form and click Submit to populate sample job matches.');
  $('#submit-search').scrollIntoView({ behavior: 'smooth' });
}
async function exitDemo() {
  demoMode = false; submitted = false; appliedThreshold = 75; appliedLimit = 5;
  appliedLocations = []; appliedDesignations = []; appliedVerticals = []; appliedPackage = 'any'; $('#package-bucket').value = 'any';
  $('#threshold').value = '75'; $('#record-limit').value = '5'; $('#search').value = '';
  if ($('#detail').open) $('#detail').close();
  await refresh(); notify('Demo closed. Your real resume, sources and decision history are unchanged.');
}
$('#load-demo').addEventListener('click', () => action(loadDemo));
$('#exit-demo').addEventListener('click', () => action(exitDemo));
$('#download-sample').addEventListener('click', () => {
  const data = JSON.parse($('#sample-data').textContent);
  const href = URL.createObjectURL(new Blob([data.resume], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = href; anchor.download = 'sample-resume.txt';
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
});
$('#save-profile').addEventListener('click', () => action(async () => {
  const url = new URL($('#profile-link').value);
  if (url.protocol !== 'https:' || !['linkedin.com', 'www.linkedin.com', 'naukri.com', 'www.naukri.com'].includes(url.hostname) || url.username || url.password) throw new Error('Enter an HTTPS LinkedIn or Naukri profile URL.');
  if (!profileLinks.includes(url.href)) profileLinks.push(url.href);
  $('#saved-links').innerHTML = profileLinks.map((href, i) => link(href, `Profile ${i + 1}`)).join('');
  $('#profile-link').value = ''; notify('Profile shortcut saved for this page session. This does not grant account access.');
}));

action(refresh);

for (const id of ['bank-barclays', 'bank-deutsche', 'bank-citi', 'employer-pwc', 'employer-genpact', 'employer-fis', 'employer-fiserv', 'employer-mastercard', 'employer-salesforce', 'employer-adobe']) $('#'+id)?.addEventListener('change', () => { submitted = false; render(); });
const employerIds = ['bank-barclays', 'bank-deutsche', 'bank-citi', 'employer-mastercard', 'employer-fis', 'employer-fiserv', 'employer-pwc', 'employer-genpact', 'employer-salesforce', 'employer-adobe'];
function updateEmployerCount() { const box = $('#employer-count'); if (!box) return; const on = employerIds.filter(id => $('#'+id)?.checked).length; box.textContent = `${on} of ${employerIds.length} selected`; }
for (const id of employerIds) $('#'+id)?.addEventListener('change', updateEmployerCount);
for (const [button, value] of [['#employers-all', true], ['#employers-none', false]]) $(button)?.addEventListener('click', () => { for (const id of employerIds) { const box = $('#'+id); if (box) box.checked = value; } updateEmployerCount(); submitted = false; render(); });
updateEmployerCount();

if(typeof window!=='undefined')window.addEventListener('career-profile-saved',()=>action(refresh));

// Progressive setup keeps inputs mounted, so going back never loses entered values.
let formWizard;
function wizardIssue(stage) {
 if(stage===0&&$('#data-consent').checked===false&&!demoMode)return {message:'Accept the data-processing notice before uploading your resume.',selector:'#data-consent'};
 if(stage===0&&!state.resumeReady)return {message:'Upload your resume to continue.',selector:'#resume'};
 if(stage===1&&!hasJobSource())return {message:'Choose at least one job source.',selector:'#connections input[type=checkbox]'};
 if(stage===2){if(experienceErrors().length)return {message:experienceErrors()[0],selector:'#total-experience'};if(!designationPreferences.length)return {message:'Choose at least one job designation.',selector:'#designation-options input'};}
 if(stage===3){if(!locationPreferences.length)return {message:'Choose at least one preferred city.',selector:'#india-cities input'};if(!['25','50','75','100'].includes($('#threshold').value))return {message:'Choose a minimum match.',selector:'#threshold'};const n=$('#record-limit').value;if(n===''||!Number.isInteger(Number(n))||Number(n)<0||Number(n)>15)return {message:'Choose 0–15 records.',selector:'#record-limit'};}
 return null;
}
function initFormWizard(){
 if(!$('#candidate')?.nodeType)return;
 const titles=['Your resume','Job sources','Your experience','Search preferences'];
 const icons=['↥','◈','◎','⌖'];let current=0;
 const root=document.createElement('section');root.className='form-wizard';root.id='form-wizard';
 root.innerHTML='<nav class="wizard-progress" aria-label="Search setup">'+titles.map((t,i)=>'<button type="button" data-wizard-step="'+i+'"><span>'+icons[i]+'</span><small>'+t+'</small></button>').join('')+'</nav><div class="wizard-heading"><small id="wizard-counter"></small><h2 id="wizard-title" tabindex="-1"></h2></div><div id="wizard-panels"></div><p id="wizard-error" role="alert" hidden></p><div class="wizard-navigation"><button id="wizard-back" class="secondary" type="button">← Back</button><button id="wizard-next" class="primary" type="button">Continue →</button></div>';
 const setup=$('#candidate');setup.before(root);
 const panels=titles.map((_,i)=>{const panel=document.createElement('div');panel.className='wizard-stage';panel.dataset.stage=i;$('#wizard-panels').append(panel);return panel;});
 panels[0].append(setup.querySelector('.resume-panel'));
 panels[1].append($('#connections'));
 const preferences=$('#search-settings');
 panels[2].append(preferences.querySelector('.experience-preferences'),preferences.querySelector('.designation-preferences'));
 panels[3].append(preferences);preferences.querySelector('.panel-heading').hidden=true;
 const submission=document.querySelector('.search-submit-zone');panels[3].append(submission);
 const refreshControl=$('#refresh-search');refreshControl.title='Reset all search inputs and return to your resume';document.querySelector('.wizard-navigation').insertBefore(refreshControl,$('#wizard-next'));submission.hidden=true;
 setup.hidden=true;
 function display(step,focus=true){current=step;applicationGuide?.stage(step);panels.forEach((p,i)=>p.hidden=i!==step);$('#wizard-counter').textContent='STEP '+(step+1)+' OF 4';$('#wizard-title').textContent=titles[step];$('#wizard-back').hidden=step===0;$('#wizard-next').hidden=false;$('#wizard-next').textContent=step===3?'Find my matches ↗':'Continue →';$('#wizard-error').hidden=true;document.querySelectorAll('[data-wizard-step]').forEach((b,i)=>{b.setAttribute('aria-current',i===step?'step':'false');b.classList.toggle('done',i<step);});if(focus)$('#wizard-title').focus();}
 function direct(issue){applicationGuide?.tell(issue.message);$('#wizard-error').textContent=issue.message;$('#wizard-error').hidden=false;const field=$(issue.selector);field?.closest('details')?.setAttribute('open','');field?.focus();field?.scrollIntoView({behavior:'smooth',block:'center'});}
 function go(step){if(step>current){for(let i=0;i<step;i++){const issue=wizardIssue(i);if(issue){display(i,false);direct(issue);return;}}}display(step);}
 $('#wizard-next').addEventListener('click',()=>{if(current===3){action(()=>runSearch());return;}go(current+1);});$('#wizard-back').addEventListener('click',()=>display(current-1));
 document.querySelectorAll('[data-wizard-step]').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.wizardStep))));
 for(const [selector,step] of [['#journey-resume',0],['#journey-sources',1],['#journey-matches',3]])$(selector)?.addEventListener('click',e=>{e.preventDefault();go(step);root.scrollIntoView({behavior:'smooth'});});
 document.querySelectorAll('.main-nav a').forEach(a=>{const target=a.getAttribute('href');if(target==='#candidate'||target==='#connections')a.addEventListener('click',e=>{e.preventDefault();go(target==='#candidate'?0:1);root.scrollIntoView({behavior:'smooth'});});});
 formWizard={reset:()=>display(0),validate:()=>{for(let i=0;i<4;i++){const issue=wizardIssue(i);if(issue){display(i,false);direct(issue);return false;}}return true;}};
 display(0,false);
}
initFormWizard();
if($('#sign-out')?.nodeType){document.querySelector('header').append($('#sign-out'));$('#sign-out').hidden=true;}

if($('#matches')?.nodeType){const edit=document.createElement('button');edit.id='edit-search';edit.className='secondary';edit.type='button';edit.textContent='← Edit search';edit.hidden=true;document.querySelector('.result-actions').prepend(edit);edit.addEventListener('click',editSearchForm);$('#matches').hidden=!submitted;}

function istGreeting(now=new Date()){
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).format(now));
 return hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
}
function nextGuideAction(){
 if(!state.resumeReady)return {key:'resume',text:'Upload your resume to get started.',stage:0};
 if(!hasJobSource())return {key:'sources',text:'Choose at least one employer, then continue.',stage:1};
 if(experienceErrors().length||!designationPreferences.length)return {key:'experience',text:'Add your experience and choose the roles you want.',stage:2};
 if(!locationPreferences.length)return {key:'locations',text:'Choose your preferred cities, match level and number of jobs.',stage:3};
 if(!submitted)return {key:'search',text:'Your preferences are ready. Find your matches.',stage:3};
 return {key:'results',text:'Open a match to prepare, tailor your resume or apply.',stage:null};
}
function initApplicationGuide(){
 if(!$('#form-wizard')?.nodeType)return;
 const panel=document.createElement('aside');panel.className='application-guide';panel.setAttribute('aria-label','Application guide');
 panel.innerHTML='<span class="guide-avatar" aria-hidden="true">✦</span><div class="guide-copy"><strong>Reena · Your guide</strong><p id="guide-message" role="status" aria-live="polite"></p><div class="guide-actions"><button id="guide-voice" type="button" class="guide-toggle" role="switch" aria-checked="false"><span class="guide-toggle-track" aria-hidden="true"><i></i></span> AI voice guide <span id="guide-voice-state">Off</span></button><select id="guide-voice-choice" hidden aria-hidden="true" tabindex="-1"></select></div></div>';
 const testingNotice=document.querySelector('.pilot-testing-notice');if(testingNotice)testingNotice.after(panel);else $('#form-wizard').before(panel);
 let voice=false,dismissed=false,lastKey='',activeStage=0,loaded=false,reminderCount=0,timers=[];
 const greeting=istGreeting();
 function speak(text){if(!voice||typeof speechSynthesis==='undefined'||typeof SpeechSynthesisUtterance==='undefined')return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-IN';u.rate=.95;const available=reenaVoices(speechSynthesis.getVoices());const selected=available.find(v=>v.voiceURI===$('#guide-voice-choice').value)||available[0];if(selected)u.voice=selected;u.rate=.9;u.pitch=.95;speechSynthesis.speak(u);}
 function say(text){if(dismissed)return;if($('#guide-message').textContent===text)return;$('#guide-message').textContent=text;speak(text);}
 function clearReminders(){timers.forEach(clearTimeout);timers=[];}
 function startReminders(){
   if(timers.length||reminderCount>=2||dismissed||state.resumeReady)return;
   for(let n=1;n<=2;n++)timers.push(setTimeout(()=>{if(dismissed||state.resumeReady)return;reminderCount++;say('Have you uploaded your resume? '+(n===1?'You can upload it when you are ready.':'Upload it when you are ready; I will pause the reminders now.'));},n*120000));
 }
 applicationGuide={tell:say,stage(step){activeStage=step;lastKey='stage-'+step;const messages=['Upload your resume, then Continue.','Select the employers you want to search, then Continue.','Enter total experience and select your job designations.','Choose cities, match percentage and record count, then Find my matches.'];say(messages[step]);},update(){if(dismissed)return;const action=nextGuideAction();if(!loaded){loaded=true;lastKey=action.key;say(greeting+'! '+action.text);if(!state.resumeReady)startReminders();return;}if(state.resumeReady)clearReminders();const issue=wizardIssue(activeStage);const key=issue?.message||'ready-'+activeStage;if(key!==lastKey){lastKey=key;say(issue?issue.message:['Your resume is ready. Continue to choose your job sources.','Sources selected. Continue to your experience and roles.','Experience and roles are ready. Continue to search preferences.','Preferences are ready. Click Find my matches.'][activeStage]);}if(!state.resumeReady)startReminders();},uploaded(){clearReminders();lastKey=nextGuideAction().key;say('Your resume has been successfully loaded. '+nextGuideAction().text);}};
 $('#guide-voice').addEventListener('click',()=>{voice=!voice;$('#guide-voice').setAttribute('aria-checked',String(voice));$('#guide-voice-state').textContent=voice?'On':'Off';if(voice)speak($('#guide-message').textContent);else if(typeof speechSynthesis!=='undefined')speechSynthesis.cancel();});
 function populateGuideVoices(){if(typeof speechSynthesis==='undefined')return;const available=reenaVoices(speechSynthesis.getVoices());const previous=$('#guide-voice-choice').value;$('#guide-voice-choice').innerHTML=available.map(v=>'<option value="'+esc(v.voiceURI)+'">'+esc(v.name)+' · '+esc(v.lang)+'</option>').join('')||'<option value="">Loading device voices…</option>';if(available.some(v=>v.voiceURI===previous))$('#guide-voice-choice').value=previous;}
 populateGuideVoices();if(typeof speechSynthesis!=='undefined')speechSynthesis.addEventListener?.('voiceschanged',populateGuideVoices);
 $('#guide-voice-choice').addEventListener('change',()=>{if(voice)speak($('#guide-message').textContent);});

 const hints={'data-consent':'Accept the data notice to enable resume upload.','resume':'Choose your resume file: PDF, DOCX or TXT, up to 5 MB.','total-experience':'Enter your total years of experience. Use zero if you are a fresher.','custom-designation':'Add a job title if your preferred role is not listed.','threshold':'Choose the minimum match percentage. A lower threshold can show more jobs.','record-limit':'Choose how many matches to show, from zero to fifteen.','package-bucket':'Salary preference is optional. Leave Any package to broaden your search.'};
 document.addEventListener('focusin',event=>{const el=event.target;if(!el.closest?.('.wizard-stage'))return;if(hints[el.id])say(hints[el.id]);else if(el.matches?.('#connections input[type=checkbox]'))say('Select one or more employers. These are the sources used for your search.');else if(el.matches?.('#india-cities input'))say('Choose one or more preferred cities. Only matching locations will be listed.');else if(el.matches?.('#designation-options input'))say('Choose the job roles you want to apply for. You can select more than one.');});
 document.addEventListener('change',event=>{if(event.target.closest?.('.wizard-stage'))queueMicrotask(()=>applicationGuide.update());});

 // The first state refresh supplies the actual upload status before reminders start.
 if(state.resumeReady!==undefined)applicationGuide.update();
}
initApplicationGuide();

// Privacy notice dialog: opened from the header button, the footer link, the consent help link or the #privacy address.
if (typeof document !== 'undefined' && typeof location !== 'undefined' && typeof window !== 'undefined' && $('#privacy-dialog')?.showModal) {
  const privacyDialog = $('#privacy-dialog');
  const privacyMessage = (text, isError) => { const box = $('#privacy-message'); box.textContent = text; box.hidden = !text; box.classList.toggle('error', !!isError); };
  const openPrivacy = event => { event?.preventDefault(); privacyMessage(''); if (!privacyDialog.open) privacyDialog.showModal(); };
  $('#open-privacy').addEventListener('click', openPrivacy);
  document.querySelectorAll('[data-open-privacy]').forEach(el => el.addEventListener('click', openPrivacy));
  $('#close-privacy').addEventListener('click', () => privacyDialog.close());
  privacyDialog.addEventListener('click', event => { if (event.target === privacyDialog) privacyDialog.close(); });
  const privacyFromAddress = () => { if (location.hash === '#privacy') openPrivacy(); };
  privacyFromAddress(); window.addEventListener('hashchange', privacyFromAddress);
  $('#privacy-delete').addEventListener('click', async () => {
    if ($('#privacy-delete-confirm').value.trim() !== 'DELETE') return privacyMessage('Type DELETE in the box to confirm erasing your data.', true);
    $('#privacy-delete').disabled = true;
    try {
      await post('/api/career/delete', { confirm: 'DELETE' });
      $('#privacy-delete-confirm').value = '';
      privacyMessage('Your data has been permanently deleted from this app. The page will now reload.');
      setTimeout(() => location.reload(), 2500);
    } catch (error) { privacyMessage(error.message, true); $('#privacy-delete').disabled = false; }
  });
}
