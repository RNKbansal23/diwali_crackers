// Synthetic landmark integration test. Real hand detection still needs device testing.
// Requires a running Vite server and Chrome on Windows (or CHROME_PATH).
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const browser=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless','--no-sandbox','--in-process-gpu','--disable-gpu','--disable-gpu-sandbox','--no-first-run','--no-default-browser-check',
 '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required',
 '--remote-debugging-port=0',`--user-data-dir=${resolve('.browser-check-smoke')}`,'about:blank'
],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
try{
 const endpoint=await new Promise((yes,no)=>{
  const timer=setTimeout(()=>no(new Error('Chrome startup timeout')),20000);
  browser.on('error',no);browser.stderr.on('data',data=>{const match=data.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);yes(match[1])}});
 });
 const base=new URL(endpoint);const pages=await fetch(`http://${base.host}/json/list`).then(r=>r.json());
 socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((yes,no)=>{socket.onopen=yes;socket.onerror=no});
 const pending=new Map();let id=0;
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const result=pending.get(m.id);pending.delete(m.id);m.error?result.reject(new Error(m.error.message)):result.resolve(m.result)}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}))});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text+JSON.stringify(result.exceptionDetails.exception));return result.result.value};
 const wait=async expression=>{for(let i=0;i<180;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100))}throw new Error(`Timed out: ${expression}`)};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
  window.__hands=[];window.__sounds=0;
  const originalSound=AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource=function(...args){window.__sounds++;return originalSound.apply(this,args)};
  const NativeWorker=window.Worker;
  window.Worker=class {
   constructor(url,options){if(!String(url).includes('hand-tracker'))return new NativeWorker(url,options);this.closed=false}
   postMessage(message){if(this.closed)return;if(message.type==='init')setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),20);else{message.bitmap.close();setTimeout(()=>{if(!this.closed)this.onmessage?.({data:{type:'result',hands:window.__hands}})},5)}}
   terminate(){this.closed=true}
  };
 `});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://localhost:5173/'});
 await wait("Boolean(document.querySelector('.primary'))");
 await evaluate("document.querySelector('.primary').click()");
 await wait("document.querySelector('.mode-pill')?.textContent.includes('LIVE CAMERA')");
 await evaluate("document.querySelector('.gesture-toggle').click()");
 await wait("document.querySelector('.tracking-status')?.textContent.includes('Show your hands')");
 // Two open palms, safely inside the cover-cropped camera view.
 const makeHand=(cx)=>{
  const p=Array.from({length:21},()=>({x:cx,y:.6,z:0}));p[0]={x:cx,y:.78,z:0};p[4]={x:cx-.12,y:.48,z:0};
  for(const [i,tip]of [8,12,16,20].entries()){
   const x=cx-.065+i*.045;p[tip-3]={x,y:.58,z:0};p[tip-2]={x,y:.46,z:0};p[tip-1]={x,y:.35,z:0};p[tip]={x,y:.25,z:0};
  }return p;
 };
 const hands=[makeHand(.27),makeHand(.73)];
 await evaluate(`window.__hands=${JSON.stringify(hands)}`);
 await wait("document.querySelector('.tracking-status')?.textContent.includes('Happy Diwali')");
 await evaluate("document.querySelector('.photo-button').click()");
 await wait("document.querySelector('.gallery-button span')?.textContent==='01'");
 await evaluate("document.querySelector('.gallery-button').click()");
 await wait("Boolean(document.querySelector('.gallery-grid img'))");
 assert.ok(await evaluate("document.querySelector('.gallery-grid img').src.startsWith('blob:')"));
 await evaluate("document.querySelector('.modal-close').click()");
 await wait("document.querySelector('.tracking-status')?.textContent.includes('Happy Diwali')");
 // More than two simultaneous hands must reach the independent-hand pipeline.
 await evaluate(`window.__hands=${JSON.stringify([...hands,makeHand(.47)])}`);
 await wait("document.querySelector('.tracking-status')?.textContent.startsWith('3 hands')");
 await evaluate(`window.__hands=${JSON.stringify([makeHand(.15),makeHand(.38),makeHand(.62),makeHand(.85)])}`);
 await wait("document.querySelector('.tracking-status')?.textContent.startsWith('4 hands')");
 const gun=makeHand(.38);
 for(const tip of [16,20]){gun[tip-2].y=.6;gun[tip-1].y=.68;gun[tip].y=.71}
 await evaluate(`window.__hands=${JSON.stringify([gun])}`);
 await wait("document.querySelector('.tracking-status')?.textContent.includes('Finger rocket')");
 await evaluate('new Promise(resolve=>setTimeout(resolve,750))');
 const beforeShot=await evaluate('window.__sounds');
 const flicked=gun.map(p=>({...p,x:p.x+.1,y:p.y-.04}));
 await evaluate(`window.__hands=${JSON.stringify([flicked])}`);
 await wait(`window.__sounds>${beforeShot}`);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 console.log('PASS: camera startup, synthetic two-hand banner, four hands, gun charge/flick/projectile pop, photo capture, gallery, modal pause/resume, 390px overflow');
}finally{socket?.close();browser.kill()}
