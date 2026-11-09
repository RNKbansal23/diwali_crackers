import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/hand-tracker.js',import.meta.url),'utf8');
test('vendored runtime exports the real tracking API and both WASM variants are valid',()=>{
 const runtime=readFileSync(new URL('../public/vendor/mediapipe/vision-runtime.js',import.meta.url),'utf8');
 const context=vm.createContext({exports:{},self:{},console,TextDecoder,TextEncoder,WebAssembly,URL});
 vm.runInContext(runtime,context);
 assert.equal(typeof context.exports.FilesetResolver.forVisionTasks,'function');
 assert.equal(typeof context.exports.HandLandmarker.createFromOptions,'function');
 for(const name of ['vision_wasm_internal.wasm','vision_wasm_nosimd_internal.wasm']){
  const bytes=readFileSync(new URL(`../public/vendor/mediapipe/wasm/${name}`,import.meta.url));
  assert.equal(WebAssembly.validate(bytes),true,`${name} should be valid WebAssembly`);
 }
});
function boot({runtimeFailure=false,modelFailure=false,initFailure=false,hands=[]}={}){
 const messages=[];let options;
 const scope={location:{href:'https://example.test/hand-tracker.js'},postMessage:m=>messages.push(m)};
 const sandbox={self:scope,console:{error(){}},URL,Uint8Array,AbortController,setTimeout,clearTimeout,
  fetch:async()=>{if(modelFailure)throw new Error('Model server unavailable');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(32)}},
  importScripts:url=>{
   assert.match(url,/\/vendor\/mediapipe\/vision-runtime\.js$/);
   if(runtimeFailure)throw new Error('Runtime missing');
   scope.exports.FilesetResolver={forVisionTasks:async path=>{assert.match(path,/\/vendor\/mediapipe\/wasm\/?$/);return {}}};
   scope.exports.HandLandmarker={createFromOptions:async(_files,config)=>{options=config;if(initFailure)throw new Error('WASM initialization failed');return {detectForVideo:()=>({landmarks:hands})}}};
  }};
 Object.defineProperty(sandbox,'exports',{get:()=>scope.exports});
 const context=vm.createContext(sandbox);vm.runInContext(source,context);
 return {scope,messages,options:()=>options};
}
test('boots the local CJS runtime with an exports shim and passes model bytes to MediaPipe',async()=>{
 const app=boot();await app.scope.onmessage({data:{type:'init'}});
 assert.equal(app.messages.at(-1).type,'ready');
 assert.ok(app.options().baseOptions.modelAssetBuffer instanceof Uint8Array);
 assert.equal(app.options().baseOptions.modelAssetPath,undefined);
 assert.equal(app.options().numHands,4);
});
test('worker returns every detected hand and closes the transferred frame',async()=>{
 const hands=[Array.from({length:21},()=>({x:.2,y:.3})),Array.from({length:21},()=>({x:.7,y:.4}))];
 const app=boot({hands});await app.scope.onmessage({data:{type:'init'}});let closed=false;
 await app.scope.onmessage({data:{type:'frame',bitmap:{close(){closed=true}},time:100}});
 const result=app.messages.at(-1);assert.equal(result.type,'result');assert.deepEqual(result.hands,hands);assert.equal(result.hands.length,2);assert.equal(closed,true);
});
for(const [failure,stage,detail]of [['runtimeFailure','runtime','Runtime missing'],['modelFailure','model','Model server unavailable'],['initFailure','initialization','WASM initialization failed']]){
 test(`reports ${stage} failures with their actual reason`,async()=>{
  const app=boot({[failure]:true});await app.scope.onmessage({data:{type:'init'}});
  const error=app.messages.at(-1);assert.equal(error.type,'error');assert.match(error.message,new RegExp(detail));assert.equal(error.stage,stage);
 });
}
