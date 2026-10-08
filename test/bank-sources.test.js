import test from 'node:test';
import assert from 'node:assert/strict';
import { bankJob, searchBanks, structuredJob, workdayJob } from '../bank-sources.js';
import { employerSources } from '../employer-sources.js';
test('bank metadata never substitutes for confirmed application status', () => {
  const data = { title: 'Developer', datePosted: '2026-10-4', description: '<p>Java &amp; SQL</p>', jobLocation: { address: { addressLocality: 'Pune' } } };
  assert.equal(bankJob(data, 'HSBC', 'https://example.com').applicationOpen, false);
  const verified = bankJob(data, 'Barclays', 'https://example.com', true);
  assert.equal(verified.applicationOpen, true);
  assert.equal(verified.posted, '2026-10-04');
  assert.equal(verified.description, 'Java & SQL');
  assert.equal(structuredJob('<script type="application/ld+json">'+JSON.stringify({...data, '@type':'JobPosting'})+'</script>').title, 'Developer');
});
test('bank search rejects unknown sources and does no network work for zero records', async () => {
  await assert.rejects(searchBanks({banks:['Unknown']}), /Choose/);
  const result = await searchBanks({banks:['Barclays'], locations:[{city:'Pune',country:'India'}],designations:['Developer'],limit:0}, () => { throw new Error('Network should not run'); });
  assert.deepEqual(result.jobs, []);
});
test('Workday adapters reject closed, non-India and unrelated application links', () => {
  const job = {country:{descriptor:'India'},canApply:true,posted:true,jobDescription:'<p>Business Analyst requires SQL and UAT banking experience.</p>',startDate:'2026-10-04',externalUrl:'https://db.wd3.myworkdayjobs.com/DBWebsite/job/Pune/Analyst_R1',location:'Pune',title:'Business Analyst',jobReqId:'R1'};
  assert.equal(workdayJob(job,'Deutsche Bank').applicationOpen,true);
  assert.equal(workdayJob({...job,canApply:false},'Deutsche Bank'),null);
  assert.equal(workdayJob({...job,posted:false},'Deutsche Bank'),null);
  assert.equal(workdayJob({...job,country:{descriptor:'UK'}},'Deutsche Bank'),null);
  assert.equal(workdayJob({...job,externalUrl:'https://example.com/job'},'Deutsche Bank'),null);
});
test('Workday search sends only job preferences and excludes unknown application flags', async () => {
  const calls=[];
  const result=await searchBanks({banks:['Citi'],locations:[{city:'Pune',country:'India'}],designations:['Business Analyst'],limit:5,today:'2026-10-05'},async(url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>url.endsWith('/jobs')?{jobPostings:[{externalPath:'/job/Pune/Analyst_R1'},{externalPath:'/job/Pune/Analyst_R2'}]}:{jobPostingInfo:{country:{descriptor:'India'},canApply:url.endsWith('R1'),posted:true,jobDescription:'SQL Business Analyst required for banking UAT projects.',startDate:'2026-10-04',externalUrl:'https://citi.wd5.myworkdayjobs.com/2/job/Pune/Analyst_R1',location:'Pune',title:'Business Analyst',jobReqId:'R1'}}};
  });
  assert.equal(result.jobs.length,1);
  assert.equal(JSON.parse(calls[0].options.body).searchText,'Business Analyst');
  assert.ok(!calls[0].options.body.includes('resume'));
});
test('FIS coded cities remain filterable and software employers are not classified as banks', () => {
  const info={country:{descriptor:'India'},canApply:true,posted:true,jobDescription:'Business Analyst for SQL banking payment projects.',startDate:'2026-10-07',title:'Business Analyst',jobReqId:'R1',location:'IND BNGL FL2; IND NOID TWR1',externalUrl:'https://fis.wd5.myworkdayjobs.com/SearchJobs/job/IND-BNGL/Analyst_R1'};
  const job=workdayJob(info,'FIS');
  assert.match(job.location,/Bengaluru/);assert.match(job.location,/Noida/);
  assert.deepEqual(job.businessVerticals,['Technology','Financial Services']);
});
test('PwC uses selected city facets, verifies India details and does not classify jobs as Banking', async () => {
  const searches=[];
  const result=await searchBanks({banks:['PwC'],locations:[{city:'Bengaluru',country:'India'}],designations:['Consultant'],limit:5,today:'2026-10-05'},async(url,options)=>{
    if(url.endsWith('/jobs')){
      const query=JSON.parse(options.body);searches.push(query);
      return {ok:true,json:async()=>query.appliedFacets.locations?{jobPostings:[{externalPath:'/job/Bangalore/Consultant_R1'}]}:{facets:[{facetParameter:'locationMainGroup',values:[{facetParameter:'locations',values:[{descriptor:'Bengaluru Millenia',id:'india-city'},{descriptor:'London',id:'uk-city'}]}]}]}};
    }
    return {ok:true,json:async()=>({jobPostingInfo:{country:{descriptor:'India'},canApply:true,posted:true,jobDescription:'Consultant required with SQL and stakeholder experience.',startDate:'2026-10-04',externalUrl:'https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers/job/Bangalore/Consultant_R1',location:'Bengaluru Millenia',title:'Consultant',jobReqId:'R1'}})};
  });
  assert.deepEqual(searches[1].appliedFacets.locations,['india-city']);
  assert.equal(result.jobs.length,1);
  assert.deepEqual(result.jobs[0].businessVerticals,['Professional Services','Consulting']);
  assert.equal(employerSources.length,10);
  assert.deepEqual(employerSources.filter(s=>s.live).map(s=>s.name),['Barclays','Deutsche Bank','Citi','PwC','Genpact','FIS','Fiserv','Mastercard','Salesforce','Adobe']);
});
