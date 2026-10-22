import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const required = ['APP_URL','DATABASE_URL','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','SESSION_SECRET','ENCRYPTION_KEY'];
for (const k of required) if (!process.env[k]) throw new Error(`Missing ${k}`);
const APP_URL = process.env.APP_URL.replace(/\/$/, '');
const port = Number(process.env.PORT || 3000);
const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
if (encryptionKey.length !== 32) throw new Error('ENCRYPTION_KEY must be 64 hex characters');
const sessionSecret = process.env.SESSION_SECRET;
if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must have >=32 chars');
const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: true }
    : undefined
});
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const now = () => new Date().toISOString();
const log = (level, event, more = {}) => console.log(JSON.stringify({time: now(),level,event,...more}));

// A single schema migration for the take-home; use migrations for production.
async function init() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY, login TEXT NOT NULL, avatar TEXT,
      token_encrypted TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS repos (
      id BIGSERIAL PRIMARY KEY, owner_id BIGINT NOT NULL REFERENCES users(id),
      full_name TEXT NOT NULL, github_repo_id BIGINT NOT NULL,
      hook_id BIGINT, webhook_secret TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(owner_id, full_name), UNIQUE(github_repo_id)
    );
    CREATE TABLE IF NOT EXISTS rules (
      id BIGSERIAL PRIMARY KEY, repo_id BIGINT NOT NULL REFERENCES repos(id),
      keyword TEXT NOT NULL, label TEXT NOT NULL DEFAULT 'bug',
      slack_enabled BOOLEAN NOT NULL DEFAULT true,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY, repo_id BIGINT NOT NULL REFERENCES repos(id),
      delivery_id TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL, action TEXT,
      payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ DEFAULT now(),
      error TEXT, received_at TIMESTAMPTZ DEFAULT now(), processed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS actions (
      id BIGSERIAL PRIMARY KEY, event_id BIGINT NOT NULL REFERENCES events(id),
      kind TEXT NOT NULL, status TEXT NOT NULL, detail TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(event_id, kind)
    );
  `);
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm',encryptionKey,iv);
  const data = Buffer.concat([cipher.update(plain,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');
}
function decrypt(encoded) {
  const buf = Buffer.from(encoded,'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm',encryptionKey,buf.subarray(0,12));
  decipher.setAuthTag(buf.subarray(12,28));
  return Buffer.concat([decipher.update(buf.subarray(28)),decipher.final()]).toString();
}
const hmac = (secret,value) => crypto.createHmac('sha256',secret).update(value).digest('base64url');
function signed(value) { return value + '.' + hmac(sessionSecret,value); }
function verified(value) {
  if (!value) return null;
  const dot = value.lastIndexOf('.'); if (dot < 0) return null;
  const payload=value.slice(0,dot), sig=value.slice(dot+1), expected=hmac(sessionSecret,payload);
  if (sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return null;
  return payload;
}
function cookies(req) { return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(s => {
  const i=s.indexOf('='); return [s.slice(0,i).trim(),decodeURIComponent(s.slice(i+1).trim())];
})); }
const cookieOptions = { httpOnly:true, secure:true, sameSite:'lax', path:'/' };
function setCookie(res,name,value,maxAgeSeconds) {
  res.cookie(name,value,{...cookieOptions,maxAge:maxAgeSeconds*1000});
}
async function requireUser(req,res,next) {
  try {
    const raw=verified(cookies(req).session);
    if (!raw) return res.status(401).json({error:'Sign in required'});
    const [id,exp] = raw.split(':'); if (Number(exp)<Date.now()) return res.status(401).json({error:'Session expired'});
    const {rows}=await db.query('SELECT id,login,avatar,token_encrypted FROM users WHERE id=$1',[id]);
    if (!rows.length) return res.status(401).json({error:'Unknown user'});
    req.user=rows[0]; next();
  } catch (e) { next(e); }
}
function apiError(res,status,message) { res.status(status).json({error:message}); }
async function github(method,route,token,body) {
  const response=await fetch('https://api.github.com'+route,{
    method, headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'abstrabit-automation-bot',Authorization:`Bearer ${token}`,
      ...(body ? {'Content-Type':'application/json'}:{})},
    ...(body ? {body:JSON.stringify(body)}:{})
  });
  const text=await response.text();
  let data; try { data=JSON.parse(text); } catch {data={message:text.slice(0,200)};}
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${data.message||'API error'}`);
  return data;
}
function repoPath(fullName) { return fullName.split('/').map(encodeURIComponent).join('/'); }
function validName(s) {return typeof s==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(s);}
function csrf(req) {return cookies(req).csrf && verified(cookies(req).csrf) === 'csrf';}
// GitHub requires raw bytes to verify the signed webhook.
app.post('/webhooks/github/:repoId', express.raw({type:'application/json',limit:'1mb'}), async (req,res,next)=>{
  try {
    if (!Buffer.isBuffer(req.body)) return apiError(res,415,'Expected application/json');
    const {rows}=await db.query('SELECT * FROM repos WHERE id=$1',[req.params.repoId]);
    if (!rows.length) return apiError(res,404,'Repo not found');
    const repo=rows[0], signature=req.get('X-Hub-Signature-256')||'';
    const expected='sha256='+crypto.createHmac('sha256',repo.webhook_secret).update(req.body).digest('hex');
    if (signature.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))
      return apiError(res,401,'Invalid signature');
    const delivery=req.get('X-GitHub-Delivery'), event=req.get('X-GitHub-Event');
    if (!delivery || !/^[a-f0-9-]{16,64}$/i.test(delivery)) return apiError(res,400,'Bad delivery ID');
    if (!['issues','pull_request','push','ping'].includes(event)) return res.status(202).json({ignored:true});
    const payload=JSON.parse(req.body.toString('utf8'));
    if (payload.repository?.id !== Number(repo.github_repo_id)) return apiError(res,400,'Repository mismatch');
    if (event==='ping') return res.status(200).json({pong:true});
    const action=payload.action||'';
    await db.query(`INSERT INTO events(repo_id,delivery_id,event_type,action,payload)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(delivery_id) DO NOTHING`,
      [repo.id,delivery,event,action,payload]);
    res.status(202).json({received:true});
  } catch(e) {next(e);}
});
app.use(express.json({limit:'100kb'}));
app.get('/health',async(_req,res)=>{
  try {await db.query('SELECT 1');res.json({ok:true});} catch {res.status(503).json({ok:false});}
});
app.get('/auth/github',(req,res)=>{
  const state=crypto.randomBytes(24).toString('hex');
  setCookie(res,'oauth_state',signed(state),600);
  const params=new URLSearchParams({
    client_id:process.env.GITHUB_CLIENT_ID,
    redirect_uri:APP_URL+'/auth/github/callback',
    scope:'repo read:user',
    state
  });
  res.redirect('https://github.com/login/oauth/authorize?'+params);
});
app.get('/auth/github/callback',async(req,res,next)=>{
  try {
    const state=verified(cookies(req).oauth_state);
    res.clearCookie('oauth_state',cookieOptions);
    if (!state || state!==req.query.state || typeof req.query.code!=='string') return apiError(res,403,'OAuth state mismatch');
    const r=await fetch('https://github.com/login/oauth/access_token',{
      method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,
        client_secret:process.env.GITHUB_CLIENT_SECRET,code:req.query.code,
        redirect_uri:APP_URL+'/auth/github/callback'})
    });
    const tokenData=await r.json(); if (!tokenData.access_token) throw new Error('GitHub OAuth exchange failed');
    const profile=await github('GET','/user',tokenData.access_token);
    await db.query(`INSERT INTO users(id,login,avatar,token_encrypted) VALUES($1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET login=$2,avatar=$3,token_encrypted=$4`,
      [profile.id,profile.login,profile.avatar_url,encrypt(tokenData.access_token)]);
    setCookie(res,'session',signed(`${profile.id}:${Date.now()+86400000}`),86400);
    setCookie(res,'csrf',signed('csrf'),86400);
    res.redirect('/');
  } catch(e) {next(e);}
});
app.post('/api/logout',requireUser,(req,res)=>{
  if (!csrf(req)) return apiError(res,403,'CSRF');
  res.clearCookie('session',cookieOptions);res.clearCookie('csrf',cookieOptions);
  res.json({ok:true});
});
app.get('/api/me',requireUser,(req,res)=>res.json({login:req.user.login,avatar:req.user.avatar}));
app.get('/api/available-repos',requireUser,async(req,res,next)=>{
  try {
    const data=await github('GET','/user/repos?per_page=100&affiliation=owner&sort=updated',decrypt(req.user.token_encrypted));
    res.json(data.filter(r=>r.permissions?.admin).map(r=>({name:r.full_name,id:r.id})));
  } catch(e){next(e);}
});
app.post('/api/repos',requireUser,async(req,res,next)=>{
  if (!csrf(req)) return apiError(res,403,'CSRF');
  const fullName=req.body.fullName;
  if (typeof fullName!=='string'||!fullName.includes('/')||fullName.split('/').some(s=>!validName(s)))
    return apiError(res,400,'Invalid repository name');
  try {
    const token=decrypt(req.user.token_encrypted);
    const remote=await github('GET','/repos/'+repoPath(fullName),token);
    if (remote.owner.id!==Number(req.user.id) || !remote.permissions?.admin)
      return apiError(res,403,'Connect a repository you own and administer');
    const exists=await db.query('SELECT id FROM repos WHERE github_repo_id=$1',[remote.id]);
    if (exists.rows.length) return apiError(res,409,'Repository already connected');
    const secret=crypto.randomBytes(32).toString('hex');
    const inserted=await db.query(`INSERT INTO repos(owner_id,full_name,github_repo_id,webhook_secret)
      VALUES($1,$2,$3,$4) RETURNING id`,[req.user.id,remote.full_name,remote.id,secret]);
    const id=inserted.rows[0].id;
    try {
      const hook=await github('POST',`/repos/${repoPath(remote.full_name)}/hooks`,token,{
        name:'web',active:true,events:['issues','pull_request','push'],
        config:{url:`${APP_URL}/webhooks/github/${id}`,content_type:'json',secret,insecure_ssl:'0'}
      });
      await db.query('UPDATE repos SET hook_id=$1 WHERE id=$2',[hook.id,id]);
      await db.query(`INSERT INTO rules(repo_id,keyword,label) VALUES($1,'bug','bug')`,[id]);
      res.status(201).json({ok:true,id});
    } catch(e) {
      await db.query('DELETE FROM repos WHERE id=$1',[id]);
      throw e;
    }
  } catch(e){next(e);}
});
app.get('/api/repos',requireUser,async(req,res,next)=>{
  try {
    const r=await db.query(`SELECT id,full_name,hook_id,created_at FROM repos WHERE owner_id=$1 ORDER BY id DESC`,[req.user.id]);
    res.json(r.rows);
  } catch(e){next(e);}
});
app.get('/api/rules',requireUser,async(req,res,next)=>{
  try {
    const r=await db.query(`SELECT ru.id,ru.repo_id,ru.keyword,ru.label,ru.slack_enabled,ru.enabled
      FROM rules ru JOIN repos r ON ru.repo_id=r.id WHERE r.owner_id=$1 ORDER BY ru.id DESC`,[req.user.id]);
    res.json(r.rows);
  }catch(e){next(e);}
});
app.post('/api/rules',requireUser,async(req,res,next)=>{
  if (!csrf(req)) return apiError(res,403,'CSRF');
  const {repoId,keyword,label,slackEnabled=true}=req.body;
  if (!Number.isSafeInteger(Number(repoId))||!validName(label)||typeof keyword!=='string'||!keyword.trim()||keyword.length>80)
    return apiError(res,400,'Provide valid repository, keyword, and label');
  try {
    const r=await db.query(`INSERT INTO rules(repo_id,keyword,label,slack_enabled)
      SELECT id,$2,$3,$4 FROM repos WHERE id=$1 AND owner_id=$5 RETURNING *`,
      [repoId,keyword.trim(),label,Boolean(slackEnabled),req.user.id]);
    if (!r.rows.length) return apiError(res,404,'Repo not found');
    res.status(201).json(r.rows[0]);
  }catch(e){next(e);}
});
app.delete('/api/rules/:id',requireUser,async(req,res,next)=>{
  if (!csrf(req)) return apiError(res,403,'CSRF');
  try {
    const r=await db.query(`DELETE FROM rules WHERE id=$1 AND repo_id IN
      (SELECT id FROM repos WHERE owner_id=$2) RETURNING id`,[req.params.id,req.user.id]);
    if (!r.rows.length) return apiError(res,404,'Rule not found');
    res.json({ok:true});
  }catch(e){next(e);}
});
app.get('/api/events',requireUser,async(req,res,next)=>{
  try {
    const r=await db.query(`SELECT e.id,e.delivery_id,e.event_type,e.action,e.status,e.attempts,
      e.error,e.received_at,e.processed_at, r.full_name,
      coalesce((SELECT json_agg(json_build_object('kind',a.kind,'status',a.status,'detail',a.detail))
        FROM actions a WHERE a.event_id=e.id),'[]'::json) AS actions
      FROM events e JOIN repos r ON r.id=e.repo_id WHERE r.owner_id=$1
      ORDER BY e.id DESC LIMIT 100`,[req.user.id]);
    res.json(r.rows);
  }catch(e){next(e);}
});
app.get('/api/stream',requireUser,async(req,res)=>{
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive'});
  res.flushHeaders();res.write(': connected\n\n');
  const interval=setInterval(()=>res.write('event: refresh\ndata: {}\n\n'),5000);
  req.on('close',()=>clearInterval(interval));
});
// Transactionally claim one event. A lease permits recovery following process termination.
async function claim() {
  const c=await db.connect();
  try {
    await c.query('BEGIN');
    const r=await c.query(`SELECT id FROM events WHERE
      ((status='pending' AND next_attempt_at<=now()) OR
       (status='processing' AND next_attempt_at<=now()))
       AND attempts < 8 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (!r.rows.length) {await c.query('COMMIT');return null;}
    const id=r.rows[0].id;
    await c.query(`UPDATE events SET status='processing',attempts=attempts+1,
      next_attempt_at=now()+interval '2 minutes' WHERE id=$1`,[id]);
    await c.query('COMMIT');return id;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function actionOnce(eventId,kind,fn) {
  const row=await db.query('SELECT status FROM actions WHERE event_id=$1 AND kind=$2',[eventId,kind]);
  if (row.rows[0]?.status==='ok') return;
  try {
    const detail=await fn();
    await db.query(`INSERT INTO actions(event_id,kind,status,detail) VALUES($1,$2,'ok',$3)
       ON CONFLICT(event_id,kind) DO UPDATE SET status='ok',detail=$3,created_at=now()`,
       [eventId,kind,detail||'Completed']);
  }catch(e) {
    await db.query(`INSERT INTO actions(event_id,kind,status,detail) VALUES($1,$2,'failed',$3)
       ON CONFLICT(event_id,kind) DO UPDATE SET status='failed',detail=$3,created_at=now()`,
       [eventId,kind,String(e.message).slice(0,250)]);
    throw e;
  }
}
async function processOne(id) {
  const r=await db.query(`SELECT e.*,r.full_name,u.token_encrypted FROM events e
    JOIN repos r ON r.id=e.repo_id JOIN users u ON u.id=r.owner_id WHERE e.id=$1`,[id]);
  if (!r.rows.length) return;
  const e=r.rows[0], p=e.payload;
  try {
    // We record pull requests and pushes, but only 'opened' issues trigger rule-based writes.
    if (e.event_type==='issues' && e.action==='opened') {
      const rs=await db.query(`SELECT * FROM rules WHERE repo_id=$1 AND enabled=true ORDER BY id`,[e.repo_id]);
      for (const rule of rs.rows) {
        if (!(p.issue?.title||'').toLowerCase().includes(rule.keyword.toLowerCase())) continue;
        // Unique per event+rule lets multiple rules coexist independently.
        await actionOnce(e.id,`label:${rule.id}`,async()=>{
          await github('POST',`/repos/${repoPath(e.full_name)}/issues/${p.issue.number}/labels`,
            decrypt(e.token_encrypted),{labels:[rule.label]});
          return `Added ${rule.label} to issue #${p.issue.number}`;
        });
        if (rule.slack_enabled && process.env.SLACK_WEBHOOK_URL) {
          await actionOnce(e.id,`slack:${rule.id}`,async()=>{
            const body={text:`GitHub issue matched "${rule.keyword}" in ${e.full_name}: ${p.issue.title} (${p.issue.html_url})`};
            const response=await fetch(process.env.SLACK_WEBHOOK_URL,{
              method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
            if (!response.ok) throw new Error(`Slack HTTP ${response.status}`);
            return 'Slack notification sent';
          });
        }
      }
    }
    await db.query(`UPDATE events SET status='done',error=NULL,processed_at=now() WHERE id=$1`,[id]);
  }catch(err) {
    const error=String(err.message).replace(/https:\/\/hooks\.slack\.com\/services\/\S+/g,'[REDACTED]').slice(0,250);
    const done=e.attempts>=8;
    await db.query(`UPDATE events SET status=$2,error=$3,
      next_attempt_at=now()+($4::integer * interval '1 second') WHERE id=$1`,
      [id,done?'failed':'pending',error,Math.min(300,2**Math.min(e.attempts,8))]);
    log('warn','event_failed',{eventId:id,attempts:e.attempts,error});
  }
}
let working=false;
async function tick() {
  if (working) return;working=true;
  try {for(let i=0;i<10;i++){const id=await claim();if(!id)break;await processOne(id);}}
  catch(e){log('error','worker_error',{error:String(e.message)});}
  finally{working=false;}
}
const dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(dirname,'../public')));
app.get('*',(_req,res)=>res.sendFile(path.join(dirname,'../public/index.html')));
app.use((err,req,res,_next)=>{
  log('error','request_failed',{path:req.path,error:String(err.message).slice(0,250)});
  res.status(500).json({error:'Request failed. Check server logs.'});
});
await init();
setInterval(tick,3000).unref();
tick();
app.listen(port,()=>log('info','started',{port}));
