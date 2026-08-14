import {spawn} from 'node:child_process';
import {mkdtemp, cp, mkdir, rm, readFile, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';

const root=fileURLToPath(new URL('..',import.meta.url));
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22 || (major===22 && minor<19)){
  console.error(`Lighthouse BLOCKED: Node ${process.versions.node}; se requiere Node >=22.19.`);
  process.exit(2);
}
const bin=join(root,'node_modules','.bin','lighthouse');
try { await access(bin); } catch {
  console.error('Lighthouse BLOCKED: ejecuta npm install --no-package-lock.');
  process.exit(2);
}
const chrome=process.env.CHROMIUM_PATH||'/usr/bin/chromium';
try { await access(chrome); } catch {
  console.error(`Lighthouse BLOCKED: Chromium no encontrado en ${chrome}.`);
  process.exit(2);
}

const qa=join(root,'.qa'); await mkdir(qa,{recursive:true});
const port=await new Promise((resolvePort,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolvePort(p));});s.on('error',reject);});
const stage=await mkdtemp(join(tmpdir(),'cr404-lh-'));
await cp(root,join(stage,'comic-reader-404'),{recursive:true,filter:(src)=>!src.includes('/node_modules')&&!src.includes('/.qa')});
const server=spawn(process.execPath,['-e',`const http=require('http'),fs=require('fs'),path=require('path');const root=${JSON.stringify(stage)};const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){r.statusCode=404;return r.end('404')}r.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');r.end(d)})}).listen(${port},'127.0.0.1')`],{stdio:'ignore'});
const url=`http://127.0.0.1:${port}/comic-reader-404/`;
const report=join(qa,'lighthouse.json');
try{
  await new Promise(r=>setTimeout(r,500));
  const args=[url,`--chrome-path=${chrome}`,'--chrome-flags=--headless --no-sandbox --disable-gpu','--only-categories=performance,accessibility,best-practices,seo','--output=json',`--output-path=${report}`,'--quiet'];
  const code=await new Promise((resolveCode)=>{const p=spawn(bin,args,{stdio:'inherit'});p.on('close',resolveCode);p.on('error',()=>resolveCode(127));});
  if(code!==0) throw new Error(`Lighthouse terminó con código ${code}.`);
  const data=JSON.parse(await readFile(report,'utf8'));
  const scores=Object.fromEntries(Object.entries(data.categories).map(([k,v])=>[k,Math.round(v.score*100)]));
  const limits={performance:90,accessibility:95,'best-practices':95,seo:90};
  const failures=Object.entries(limits).filter(([k,v])=>(scores[k]??0)<v);
  console.log('Lighthouse:',scores);
  if(failures.length) throw new Error(`Umbrales no alcanzados: ${failures.map(([k,v])=>`${k} ${scores[k]}<${v}`).join(', ')}`);
  console.log('lighthouse.mjs: PASS');
} finally { server.kill(); await rm(stage,{recursive:true,force:true}); }
