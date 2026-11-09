import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyHand,GestureGate,mapLandmark,GunFlick,matchHands,framingPair,gestureEffects} from '../src/gestures.ts';
import {project3D,shotDestination} from '../src/fireworks3d.ts';

function hand(extended=[]){
 const p=Array.from({length:21},()=>({x:.5,y:.8}));p[0]={x:.5,y:.95};p[4]={x:.3,y:.68};
 for(const [i,tip]of [8,12,16,20].entries()){
  const x=.3+i*.15;p[tip-3]={x,y:.65};p[tip-2]={x,y:.55};p[tip-1]={x,y:extended.includes(tip)?.4:.72};p[tip]={x,y:extended.includes(tip)?.25:.82};
 }return p;
}
test('recognizes pointing, palm, folded hand and missing landmarks',()=>{
 const palm=hand([8,12,16,20]);palm[4]={x:.05,y:.65};
 assert.equal(classifyHand(hand([8])),'point');assert.equal(classifyHand(palm),'palm');assert.equal(classifyHand(hand()),'fist');assert.equal(classifyHand([]),'neutral');
});

test('separates gun, peace and L-frame poses, including rotated hands',()=>{
 const peace=hand([8,12]);assert.equal(classifyHand(peace),'victory');
 const gun=hand([8,12]);gun[4]={x:.05,y:.65};assert.equal(classifyHand(gun),'gun');
 const frame=hand([8]);frame[4]={x:.05,y:.65};assert.equal(classifyHand(frame),'frame');
 const rotated=gun.map(p=>({x:1-p.y,y:p.x}));assert.equal(classifyHand(rotated),'gun');
 assert.equal(new Set(Object.values(gestureEffects)).size,5);
});
test('keeps IDs when detector reorders hands and supports four wrists',()=>{
 const previous=[{id:1,wrist:{x:.2,y:.3}},{id:2,wrist:{x:.7,y:.4}}];
 const result=matchHands(previous,[{x:.72,y:.4},{x:.22,y:.3},{x:.4,y:.9},{x:.9,y:.9}],3);
 assert.deepEqual(result.ids,[2,1,3,4]);assert.equal(result.nextId,5);
 const missing=matchHands(previous,[{x:.72,y:.4}],3);assert.deepEqual(missing.ids,[2]);
});
test('gun requires charging, rejects jitter, fires on flick and respects cooldown',()=>{
 const gun=new GunFlick(),direction={x:0,y:-1};let state;
 for(let time=0;time<=600;time+=100)state=gun.update('gun',{x:100,y:200},{x:100,y:100},direction,70,time);
 assert.equal(state.charge,1);assert.equal(state.fire,false);
 assert.equal(gun.update('gun',{x:102,y:200},{x:102,y:100},direction,70,680).fire,false);
 assert.equal(gun.update('gun',{x:152,y:170},{x:152,y:70},direction,70,760).fire,true);
 assert.equal(gun.update('gun',{x:202,y:140},{x:202,y:40},direction,70,840).fire,false);
 gun.update('neutral',{x:200,y:100},{x:200,y:0},direction,70,900);
 assert.equal(gun.update('gun',{x:250,y:100},{x:250,y:0},direction,70,1000).charge,0);
});
test('gun tracks are independent and tracking gaps do not count as a flick',()=>{
 const a=new GunFlick(),b=new GunFlick(),direction={x:1,y:0};
 for(let time=0;time<=600;time+=100)a.update('gun',{x:100,y:200},{x:200,y:200},direction,70,time);
 assert.equal(b.update('gun',{x:100,y:200},{x:200,y:200},direction,70,600).charge,0);
 assert.equal(a.update('gun',{x:250,y:200},{x:350,y:200},direction,70,1100).fire,false);
});
test('framing requires two compatible separated hands and tolerates input order',()=>{
 const hands=[{id:2,gesture:'frame',aim:{x:400,y:200}},{id:1,gesture:'frame',aim:{x:100,y:200}}];
 assert.deepEqual(framingPair(hands,90).map(h=>h.id),[1,2]);
 assert.equal(framingPair(hands.slice(0,1),90),null);
 assert.equal(framingPair([{...hands[0],gesture:'gun'},hands[1]],90),null);
 assert.equal(framingPair([{...hands[0],aim:{x:120,y:210}},hands[1]],90),null);
});
test('3D perspective shrinks distant particles and rocket pop stays inside preview',()=>{
 const near=project3D({x:100,y:0,z:0},800,600),far=project3D({x:100,y:0,z:300},800,600);
 assert.ok(far.scale<near.scale);assert.ok(far.x<near.x);
 const destination=shotDestination({x:790,y:10},{x:1,y:-1},800,600);
 assert.ok(destination.x<=788&&destination.y>=12);
 const normal=shotDestination({x:300,y:300},{x:1,y:0},800,600);assert.equal(normal.x,480);
});
test('pinch uses palm scale and hysteresis',()=>{
 const p=hand([8]);p[4]={...p[8]};assert.equal(classifyHand(p),'pinch');
 p[4]={x:p[8].x+.13,y:p[8].y};assert.notEqual(classifyHand(p,false),'pinch');assert.equal(classifyHand(p,true),'pinch');
 const scaled=p.map(q=>({x:q.x*2,y:q.y*2}));assert.equal(classifyHand(scaled,true),'pinch');
});
test('maps cover-cropped video and mirrored front camera precisely',()=>{
 assert.deepEqual(mapLandmark({x:.5,y:.5},1920,1080,400,600,false),{x:200,y:300});
 const a=mapLandmark({x:.6,y:.3},1920,1080,400,600,false),b=mapLandmark({x:.6,y:.3},1920,1080,400,600,true);
 assert.equal(a.x+b.x,400);assert.equal(a.y,b.y);
});
test('holds gestures, fires once, re-arms on release and enforces cooldown',()=>{
 const gate=new GestureGate();assert.equal(gate.update('pinch',0),false);assert.equal(gate.update('pinch',100),false);assert.equal(gate.update('pinch',130),true);assert.equal(gate.update('pinch',1000),false);
 gate.update('neutral',1100);gate.update('pinch',1200);assert.equal(gate.update('pinch',1330),true);
 gate.update('neutral',1340);gate.update('palm',1350);assert.equal(gate.update('palm',1800),false);assert.equal(gate.update('palm',2000),true);
 gate.reset();assert.equal(gate.update('point',3000),false);assert.equal(gate.update('point',3699),false);assert.equal(gate.update('point',3701),true);
});
