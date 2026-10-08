import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jobPreparation} from '../job-preparation.js';
test('preparation grounds drafts in resume passages and keeps unsupported skills as gaps',()=>{
 const result=jobPreparation({title:'Business Analyst',description:'You will manage stakeholders and deliver SQL reporting. Requires Python experience.',matched:['SQL'],gaps:['Python']},null,'Delivered SQL reporting for banking stakeholders.\nWorked with UAT teams on release validation.');
 assert.equal(result.answers.length,6);
 assert.equal(new Set(result.answers).size,6);
 assert.ok(result.answers[2].includes('Applying'));
 assert.ok(result.answers[5].includes('first 30 days'));
 assert.ok(result.expectations.some(x=>x.includes('stakeholders')));
 assert.ok(result.answers[1].includes('Delivered SQL reporting for banking stakeholders.'));
 assert.ok(result.answers[3].includes('does not establish this skill'));
 assert.ok(result.improvements.some(x=>x.title==='Address Python'));
 assert.ok(result.answers[1].includes('[State'));
});
test('missing evidence does not manufacture a project',()=>{
 const result=jobPreparation({title:'Engineer',description:'Requires Python development experience.',matched:['Python'],gaps:[]},null,'');
 assert.ok(result.answers[1].includes('No specific supporting passage'));
 assert.deepEqual(result.evidence[0].quotes,[]);
});
