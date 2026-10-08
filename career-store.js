import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
// Hosted data is removed automatically 12 months after the user's last update (see the privacy notice).
export const retentionSeconds=365*24*60*60;
export function loadDataKey(directory){
  if(process.env.CAREER_DATA_KEY){const key=Buffer.from(process.env.CAREER_DATA_KEY,'base64');if(key.length!==32)throw new Error('CAREER_DATA_KEY must encode 32 bytes.');return key;}
  if(process.platform!=='win32')throw new Error('Set CAREER_DATA_KEY to protect stored career data.');
  mkdirSync(directory,{recursive:true});const path=join(directory,'vault-key.dpapi');
  const invoke=(operation,input)=>Buffer.from(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($result))`],{input:input.toString('base64'),windowsHide:true,encoding:'utf8'}).trim(),'base64');
  if(!existsSync(path))writeFileSync(path,invoke('Protect',randomBytes(32)),{mode:0o600});return invoke('Unprotect',readFileSync(path));
}
export function seal(value,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')});}
export function unseal(text,key){const data=JSON.parse(text);if(data.v!==1)throw new Error('Unsupported encrypted store');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(data.iv,'base64'));decipher.setAuthTag(Buffer.from(data.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.body,'base64')),decipher.final()]).toString('utf8'));}
export class CareerStore{
  // kv (optional): remote key-value store used on Vercel. Each user is stored under its own encrypted key.
  constructor(path,key,kv=null){this.path=path;this.key=key;this.kv=kv;this.pending=[];this.data=!kv&&existsSync(path)?unseal(readFileSync(path,'utf8'),key):{};this.generations=new Map(Object.entries(this.data).map(([id,value])=>[id,value._generation||0]));}
  get(user){return this.data[user]||{_generation:this.generations.get(user)||0,consent:false,profile:null,history:[],jobs:[],pipeline:[],drafts:[],health:[],alerts:[],synonyms:[],settings:{weights:{skills:40,domain:25,seniority:15,location:10,certifications:10},followUpDays:10,digestTime:'08:30',email:'',emailEnabled:false,watchlist:['HSBC','Barclays','NatWest','Lloyds','Deutsche Bank','Wells Fargo','American Express','EXL','Genpact'],scheduled:false},decisions:{}};}
  async load(user){if(!this.kv)return;const [value,generation]=await Promise.all([this.kv.get('career:'+user),this.kv.get('career-gen:'+user)]);this.generations.set(user,Number(generation)||0);if(value)this.data[user]=unseal(value,this.key);else delete this.data[user];}
  async loadAll(){if(!this.kv)return;for(const name of await this.kv.keys('career:'))await this.load(name.slice('career:'.length));}
  async flush(){while(this.pending.length)await Promise.all(this.pending.splice(0));}
  save(user,value){if((value._generation||0)!==(this.generations.get(user)||0))throw new Error('This data was deleted; cancelled the pending update.');this.data[user]=value;if(this.kv){this.pending.push(this.kv.set('career:'+user,seal(value,this.key),retentionSeconds));return;}mkdirSync(dirname(this.path),{recursive:true});writeFileSync(this.path+'.tmp',seal(this.data,this.key),{mode:0o600});renameSync(this.path+'.tmp',this.path);}
  remove(user){const generation=(this.generations.get(user)||0)+1;this.generations.set(user,generation);delete this.data[user];if(this.kv){this.pending.push(this.kv.del('career:'+user),this.kv.set('career-gen:'+user,String(generation)));return;}mkdirSync(dirname(this.path),{recursive:true});writeFileSync(this.path+'.tmp',seal(this.data,this.key),{mode:0o600});renameSync(this.path+'.tmp',this.path);}
}
