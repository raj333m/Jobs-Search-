import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('interview asks six questions, saves answers and outreach opens alone', () => {
  const elements=new Map();
  const element=key=>{
    if(!elements.has(key)) elements.set(key,{value:key==='#threshold'?'75':key==='#record-limit'?'15':'',textContent:'',innerHTML:'',events:{},addEventListener(name,fn){this.events[name]=fn;},append(child){this.innerHTML+=child.innerHTML;},showModal(){this.open=true;},scrollIntoView(){}});
    return elements.get(key);
  };
  const spoken=[];let cancellations=0;
  const synth={cancel(){cancellations++;},getVoices(){return [{name:'English US',lang:'en-US',voiceURI:'us'},{name:'English India',lang:'en-IN',voiceURI:'india'}];},speak(utterance){spoken.push(utterance);}};
  let recognition;
  class MockRecognition {constructor(){recognition=this;}start(){}abort(){this.aborted=true;}}
  const context=vm.createContext({URL,SpeechRecognition:MockRecognition,speechSynthesis:synth,SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},document:{documentElement:{dataset:{}},querySelector:element,querySelectorAll:()=>[],createElement:()=>({innerHTML:''})},fetch:async()=>({ok:true,json:async()=>({jobs:[]})})});
  vm.runInContext(fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);
  vm.runInContext(`state.jobs=[{id:'1',title:'Data Analyst',company:'Example',description:'Use SQL for analysis and reporting.',matched:['SQL'],required:['SQL','Python'],gaps:['Python'],interview:[],outreach:{email:'hiring@example.com',subject:'Interest',body:'Hello'}}];showDetail('1','interview')`,context);
  assert.equal(spoken[0].voice.lang,'en-IN');
  assert.match(spoken[0].text,/Question 1/);
  element('#replay-question').events.click();
  assert.equal(spoken.length,2);
  assert.match(vm.runInContext("matchRationale(state.jobs[0])",context),/1 of 2 recognised job skills/);
  assert.match(vm.runInContext("conversationalReply('Am I audible?')",context),/received your voice/);
  assert.match(vm.runInContext("conversationalReply('Hello')",context),/Welcome/);
  element('#dictate-answer').events.click();
  recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'Are you there?'}],{isFinal:true})]});
  assert.match(spoken.at(-1).text,/here and listening/);
  assert.equal(element('#interview-answer').value,'','voice checks are not scored as interview answers');
  element('#interview-answer').value='Existing answer';
  element('#dictate-answer').events.click();
  recognition.onstart();
  assert.equal(element('#dictate-answer').disabled,true);
  recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'additional SQL'}],{isFinal:false})]});
  assert.match(element('#dictation-preview').textContent,/additional SQL/);
  assert.equal(element('#interview-answer').value,'Existing answer additional SQL','live speech appears in answer before final recognition');
  recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'additional SQL example'}],{isFinal:true})]});
  assert.equal(element('#interview-answer').value,'Existing answer additional SQL example');
  element('#evaluate-answer').events.click();
  assert.match(element('#answer-evaluation').innerHTML,/Suggested answer/);
  assert.match(element('#answer-evaluation').innerHTML,/Why you received this score/);
  assert.match(element('#answer-evaluation').innerHTML,/Detected cue/);
  assert.match(element('#answer-evaluation').innerHTML,/score capped at 50/);
  assert.match(element('#answer-evaluation').innerHTML,/answer-template/);
  assert.ok(vm.runInContext("evaluatePracticeAnswer('[real project] SQL result I would plan','q',state.jobs[0],0).score",context)<75,'placeholder answers cannot pass');
  assert.equal(vm.runInContext("evaluatePracticeAnswer('In my SQL project I developed reporting for a specific requirement. I analysed the data and tested the changes with my team. The result was a measured reduction of processing time by 20%.','q',state.jobs[0],0).score",context),100);
  element('#interview-answer').value='In my SQL project I developed reporting for a specific requirement. I analysed the data and tested the changes with my team. The result was a measured reduction of processing time by 20%.';
  element('#evaluate-answer').events.click();
  assert.match(element('#answer-evaluation').innerHTML,/Practice score: 100%/);
  assert.match(element('#answer-evaluation').innerHTML,/Why you received this score/);
  assert.match(element('#answer-evaluation').innerHTML,/Refine/);
  assert.doesNotMatch(element('#answer-evaluation').innerHTML,/id="answer-template"/);
  for(let i=1;i<=6;i++){
    assert.match(element('#detail-content').innerHTML,new RegExp('Question '+i+' of 6'));
    element('#interview-answer').value='My answer '+i;
    element('#next-question').events.click();
  }
  assert.ok(cancellations>=7);
  assert.match(spoken.at(-1).text,/Question 6/);
  assert.match(element('#detail-content').innerHTML,/Interview complete/);
  assert.match(element('#detail-content').innerHTML,/My answer 6/);
  assert.match(element('#detail-content').innerHTML,/SQL/);
  assert.match(element('#detail-content').innerHTML,/Python/);
  vm.runInContext("showDetail('1','outreach')",context);
  assert.match(element('#detail-content').innerHTML,/outreach-body/);
  assert.doesNotMatch(element('#detail-content').innerHTML,/Mock Interview|detail-grid|Why this job is listed/);
});
