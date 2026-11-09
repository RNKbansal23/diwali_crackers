export type Landmark = {x:number;y:number;z?:number};
export type Gesture = 'point'|'pinch'|'palm'|'gun'|'victory'|'frame'|'fist'|'neutral';
const distance=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y);

// Distances are relative to palm size, so thresholds follow the hand's distance from the camera.
export function classifyHand(points:Landmark[], wasPinching=false):Gesture {
 if(points.length!==21)return 'neutral';
 const palm=Math.max(distance(points[0],points[9]),distance(points[5],points[17]),.001);
 if(distance(points[4],points[8])/palm < (wasPinching?.42:.28))return 'pinch';
 const extended=[8,12,16,20].map(tip=>distance(points[tip],points[0])>distance(points[tip-2],points[0])*1.16 && distance(points[tip],points[tip-3])>palm*.43);
 const thumbOut=distance(points[4],points[5])>palm*.5;
 if(extended.every(Boolean)&&distance(points[4],points[5])>palm*.48)return 'palm';
 if(extended[0]&&extended[1]&&!extended[2]&&!extended[3])return thumbOut?'gun':'victory';
 if(extended[0]&&!extended[1]&&!extended[2]&&!extended[3])return thumbOut?'frame':'point';
 if(!extended.some(Boolean)&&!thumbOut)return 'fist';
 return 'neutral';
}

export function mapLandmark(point:Landmark, videoWidth:number, videoHeight:number, width:number, height:number, mirrored:boolean){
 const scale=Math.max(width/videoWidth,height/videoHeight);
 const x=point.x*videoWidth*scale+(width-videoWidth*scale)/2;
 return {x:mirrored?width-x:x,y:point.y*videoHeight*scale+(height-videoHeight*scale)/2};
}

export class GestureGate {
 private candidate:Gesture='neutral';private since=0;private fired=false;private lastFire=-Infinity;
 reset(){this.candidate='neutral';this.since=0;this.fired=false}
 update(gesture:Gesture,now:number):boolean {
  if(gesture!==this.candidate){this.candidate=gesture;this.since=now;this.fired=false}
  const hold=gesture==='palm'?450:gesture==='pinch'?120:700;
  if(gesture==='neutral'||gesture==='gun'||gesture==='frame'||this.fired||now-this.since<hold||now-this.lastFire<650)return false;
  this.fired=true;this.lastFire=now;return true;
 }
}

export const gestureEffects:Partial<Record<Gesture,string>>={point:'sparkler',pinch:'fountain',palm:'bloom',victory:'wheel',fist:'burst'};
export type Vec2={x:number;y:number};
export type TrackedHand={id:number;wrist:Vec2};
// Globally match nearest wrists; array order and left/right labels are not stable IDs.
export function matchHands(previous:TrackedHand[],wrists:Vec2[],nextId:number){
 const pairs=previous.flatMap(old=>wrists.map((w,index)=>({id:old.id,index,d:distance(old.wrist,w)}))).sort((a,b)=>a.d-b.d);
 const used=new Set<number>(),assigned=new Map<number,number>();
 for(const pair of pairs)if(pair.d<.3&&!used.has(pair.id)&&!assigned.has(pair.index)){assigned.set(pair.index,pair.id);used.add(pair.id)}
 const ids=wrists.map((_,index)=>assigned.get(index)??nextId++);
 return {ids,nextId};
}

export class GunFlick {
 private start:number|null=null;private previous:{time:number;wrist:Vec2;aim:Vec2;direction:Vec2}|null=null;private lastShot=-Infinity;private filteredSpeed=0;
 reset(){this.start=null;this.previous=null;this.filteredSpeed=0}
 update(gesture:Gesture,wrist:Vec2,aim:Vec2,direction:Vec2,palmSize:number,now:number,sensitivity=1){
  if(gesture!=='gun'){this.reset();return {charge:0,fire:false}}
  if(this.start===null)this.start=now;
  let charge=Math.min(1,(now-this.start)/550);
  let fire=false;
  if(this.previous){
   const dt=(now-this.previous.time)/1000;
   if(dt>.025&&dt<.3){
    const translation=distance(wrist,this.previous.wrist)/Math.max(palmSize,20)/dt;
    const tipSpeed=distance(aim,this.previous.aim)/Math.max(palmSize,20)/dt;
    const dot=Math.max(-1,Math.min(1,direction.x*this.previous.direction.x+direction.y*this.previous.direction.y));
    const rotation=Math.acos(dot)/dt;
    const speed=Math.max(translation,tipSpeed*.75,rotation*.65);
    this.filteredSpeed=this.filteredSpeed*.3+speed*.7;
    if(charge===1&&now-this.lastShot>900&&this.filteredSpeed>3.2/sensitivity){fire=true;this.lastShot=now;this.start=now;this.filteredSpeed=0}
   }else if(dt>=.3){this.start=now;this.filteredSpeed=0;charge=0}
  }
  this.previous={time:now,wrist,aim,direction};return {charge:fire?0:charge,fire};
 }
}

export function framingPair<T extends {id:number;gesture:Gesture;aim:Vec2}>(hands:T[],minimumDistance:number){
 const candidates=hands.filter(h=>h.gesture==='frame'||h.gesture==='palm');
 let pair:typeof candidates|null=null,best=minimumDistance;
 for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
  const a=candidates[i],b=candidates[j],gap=distance(a.aim,b.aim);
  if(a.gesture===b.gesture&&gap>best&&Math.abs(a.aim.y-b.aim.y)<gap*.7){best=gap;pair=[a,b]}
 }
 return pair?.sort((a,b)=>a.aim.x-b.aim.x)||null;
}
