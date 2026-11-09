import {useEffect,useRef,useState,type RefObject} from 'react';
import {classifyHand,GestureGate,GunFlick,framingPair,gestureEffects,mapLandmark,matchHands,type Landmark,type Gesture,type Vec2} from './gestures';

export type HandVisual={id:number;points:Vec2[];aim:Vec2;gesture:Gesture;charge:number;direction:Vec2;depth:number};
export type BannerVisual={left:Vec2;right:Vec2;depth:number};
export type HandOverlay={hands:HandVisual[];banner:BannerVisual|null;updatedAt:number};
export type Shot={origin:Vec2;direction:Vec2;depth:number};
type Track={id:number;wrist:Vec2;lastSeen:number;gate:GestureGate;gun:GunFlick;pinching:boolean;aim:Vec2|null;anchor:Vec2|null;candidate:Gesture;candidateSince:number;stable:Gesture};
const labels:Record<Gesture,string>={neutral:'Choose a gesture',gun:'Finger rocket: hold to charge, then flick',frame:'L-frame: add your other hand for a banner',point:'Point: sparkler',pinch:'Pinch: flowerpot',palm:'Palm: sky bloom',victory:'Peace sign: chakri',fist:'Fist: pop cracker'};

export function useHandGestures({enabled,cameraOn,paused,video,canvas,facing,sensitivity=1,onLaunch,onShoot}:{enabled:boolean;cameraOn:boolean;paused:boolean;video:RefObject<HTMLVideoElement|null>;canvas:RefObject<HTMLCanvasElement|null>;facing:string;sensitivity?:number;onLaunch:(x:number,y:number,kind?:string)=>void;onShoot:(shot:Shot)=>void}){
 const [status,setStatus]=useState('Gestures off');
 const overlay=useRef<HandOverlay|null>(null),actions=useRef({onLaunch,onShoot,sensitivity});actions.current={onLaunch,onShoot,sensitivity};
 useEffect(()=>{
  overlay.current=null;
  if(!enabled){setStatus('Gestures off');return}
  if(!cameraOn){setStatus('Enable camera to use gestures');return}
  if(paused){setStatus('Gestures paused');return}
  setStatus('Loading hand tracking…');
  let stopped=false,ready=false,pending=false,lastFrame=-1,lastSent=0,raf=0,nextId=1;
  let tracks:Track[]=[],frameSince=0,frameKey='';
  let worker:Worker;
  try{worker=new Worker(`${import.meta.env.BASE_URL}hand-tracker.js?v=4`)}catch(error){setStatus(`Could not start hand tracker: ${String(error)}`);return}
  const startupTimeout=setTimeout(()=>{ready=false;overlay.current=null;worker.terminate();setStatus('Hand tracker startup timed out. Toggle gestures to retry.')},75000);
  const input=document.createElement('canvas');input.width=640;input.height=480;const ctx=input.getContext('2d')!;
  worker.onmessage=e=>{
   if(stopped)return;
   if(e.data.type==='progress'){setStatus(e.data.message);return}
   if(e.data.type==='ready'){clearTimeout(startupTimeout);ready=true;setStatus('Show your hands · up to 4 hands supported');return}
   if(e.data.type==='error'){clearTimeout(startupTimeout);ready=false;pending=false;overlay.current=null;setStatus(e.data.message);worker.terminate();return}
   pending=false;
   const detected=(e.data.hands||[]) as Landmark[][];
   const v=video.current,c=canvas.current,now=performance.now();
   if(!v||!c||!v.videoWidth)return;
   tracks=tracks.filter(t=>now-t.lastSeen<450);
   const matched=matchHands(tracks,detected.map(p=>p[0]),nextId);nextId=matched.nextId;
   const visuals:HandVisual[]=[];
   for(let i=0;i<detected.length;i++){
    const points=detected[i];if(points.length!==21)continue;
    const id=matched.ids[i];let t=tracks.find(t=>t.id===id);
    if(!t){t={id,wrist:points[0],lastSeen:now,gate:new GestureGate(),gun:new GunFlick(),pinching:false,aim:null,anchor:null,candidate:'neutral',candidateSince:now,stable:'neutral'};tracks.push(t)}
    if(now-t.lastSeen>220){t.gate.reset();t.gun.reset();t.aim=null;t.anchor=null;t.stable='neutral'}
    t.wrist=points[0];t.lastSeen=now;
    const rawGesture=classifyHand(points,t.pinching);t.pinching=rawGesture==='pinch';
    if(rawGesture!==t.candidate){t.candidate=rawGesture;t.candidateSince=now}
    // A brief consensus window avoids one noisy frame changing a pose or firing.
    if(now-t.candidateSince>=85)t.stable=rawGesture;
    const gesture=t.stable;
    const mapped=points.map(p=>mapLandmark(p,v.videoWidth,v.videoHeight,c.clientWidth,c.clientHeight,facing==='user'));
    const raw=gesture==='palm'||gesture==='fist'?mapped[9]:gesture==='pinch'?{x:(mapped[4].x+mapped[8].x)/2,y:(mapped[4].y+mapped[8].y)/2}:gesture==='gun'?{x:(mapped[8].x+mapped[12].x)/2,y:(mapped[8].y+mapped[12].y)/2}:mapped[8];
    const aim=t.aim?{x:t.aim.x*.25+raw.x*.75,y:t.aim.y*.25+raw.y*.75}:raw;t.aim=aim;
    const dx=raw.x-mapped[5].x,dy=raw.y-mapped[5].y,length=Math.hypot(dx,dy)||1,direction={x:dx/length,y:dy/length};
    const palmSize=Math.max(Math.hypot(mapped[0].x-mapped[9].x,mapped[0].y-mapped[9].y),20);
    const depth=Math.max(-100,Math.min(200,(.19-Math.hypot(points[0].x-points[9].x,points[0].y-points[9].y))*650));
    const visible=aim.x>=0&&aim.x<=c.clientWidth&&aim.y>=0&&aim.y<=c.clientHeight;
    // Use raw positions for flick velocity; smoothed positions are only for the reticle.
    const shot=t.gun.update(visible?gesture:'neutral',mapped[0],raw,direction,palmSize,now,actions.current.sensitivity);
    if(shot.fire)actions.current.onShoot({origin:raw,direction,depth});
    visuals.push({id,points:mapped,aim,gesture,charge:shot.charge,direction,depth});
    if(!visible){t.gate.reset();t.anchor=null;continue}
    if(gesture==='point'){
     if(!t.anchor||Math.hypot(aim.x-t.anchor.x,aim.y-t.anchor.y)>Math.max(24,palmSize*.35)){t.gate.reset();t.anchor=aim}
    }else t.anchor=null;
   }
   const pair=framingPair(visuals,Math.max(90,c.clientWidth*.16));
   const key=pair?pair.map(h=>h.id).sort((a,b)=>a-b).join('-'):'';
   if(key!==frameKey){frameKey=key;frameSince=now}
   const banner=pair&&now-frameSince>400?{left:pair[0].aim,right:pair[1].aim,depth:(pair[0].depth+pair[1].depth)/2}:null;
   for(const h of visuals){
    const t=tracks.find(t=>t.id===h.id)!;
    // Framing takes priority over individual palm fireworks.
    if(pair?.some(p=>p.id===h.id)){t.gate.reset();continue}
    if(h.aim.x<0||h.aim.x>c.clientWidth||h.aim.y<0||h.aim.y>c.clientHeight)continue;
    const effect=gestureEffects[h.gesture];
    if(t.gate.update(h.gesture,now)&&effect)actions.current.onLaunch(h.aim.x,h.aim.y,effect);
   }
   overlay.current={hands:visuals,banner,updatedAt:now};
   setStatus(banner?`${visuals.length} hands · Happy Diwali! Move your hands to resize.`:visuals.length?`${visuals.length} hand${visuals.length===1?'':'s'} · ${labels[visuals[0].gesture]}`:'Show your hands · keep fingers separated and well lit');
  };
  worker.onerror=error=>{clearTimeout(startupTimeout);ready=false;pending=false;overlay.current=null;setStatus(`Hand tracker: ${error.message||'Worker could not start.'} Toggle gestures to retry.`);worker.terminate()};
  worker.postMessage({type:'init'});
  async function tick(now:number){
   if(stopped)return;raf=requestAnimationFrame(tick);const v=video.current;
   if(!ready||pending||document.hidden||!v||v.readyState<2||v.currentTime===lastFrame||now-lastSent<60)return;
   pending=true;lastSent=now;lastFrame=v.currentTime;
   input.height=Math.max(1,Math.round(input.width*v.videoHeight/v.videoWidth));ctx.drawImage(v,0,0,input.width,input.height);
   try{const bitmap=await createImageBitmap(input);if(stopped){bitmap.close();return}worker.postMessage({type:'frame',bitmap,time:now},[bitmap])}
   catch{pending=false;ready=false;overlay.current=null;setStatus('Frame processing unavailable. Toggle gestures to retry.')}
  }
  raf=requestAnimationFrame(tick);
  return()=>{stopped=true;clearTimeout(startupTimeout);cancelAnimationFrame(raf);worker.terminate();overlay.current=null};
 },[enabled,cameraOn,paused,facing,video,canvas]);
 return {status,overlay};
}
