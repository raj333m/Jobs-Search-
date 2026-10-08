import {seal,unseal,retentionSeconds} from './career-store.js';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export class DecisionStore {
  // kv (optional): remote key-value store used on Vercel; each user's decisions are stored under their own encrypted key.
  constructor(path, key = null, kv = null) {
    this.key = key;
    this.path = path;
    this.kv = kv;
    this.pending = [];
    if (kv) { this.data = {}; return; }
    try { const text = readFileSync(path, 'utf8'); this.data = key && JSON.parse(text).v === 1 ? unseal(text,key) : JSON.parse(text);if(key&&JSON.parse(text).v!==1){writeFileSync(path+'.tmp',seal(this.data,key),{mode:0o600});renameSync(path+'.tmp',path);} }
    catch (error) { if (error.code !== 'ENOENT') throw error; this.data = {}; }
  }
  async load(user) { if (!this.kv) return; const value = await this.kv.get('decisions:' + user); if (value) this.data[user] = unseal(value, this.key); else delete this.data[user]; }
  async flush() { while (this.pending.length) await Promise.all(this.pending.splice(0)); }
  persist(user, next) {
    if (this.kv) { this.pending.push(next[user] ? this.kv.set('decisions:' + user, seal(next[user], this.key), retentionSeconds) : this.kv.del('decisions:' + user)); this.data = next; return; }
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path + '.tmp', this.key ? seal(next,this.key) : JSON.stringify(next), { mode: 0o600 });
    renameSync(this.path + '.tmp', this.path);
    this.data = next;
  }
  removeUser(user) { const next={...this.data};delete next[user];this.persist(user,next); }
  forUser(user) { return this.data[user] || {}; }
  set(user, key, status) {
    if (!['Seen', 'Applied'].includes(status)) throw new Error('Choose Seen or Applied.');
    const next = { ...this.data, [user]: { ...this.forUser(user), [key]: { status, updatedAt: new Date().toISOString() } } };
    this.persist(user, next);
  }
}
