import type {HandOverlay,Shot} from './useHandGestures';
type V3={x:number;y:number;z:number};
type Spark={p:V3;v:V3;life:number;max:number;color:string;size:number};
type Rocket={from:V3;to:V3;start:number;duration:number;color:string;tail:V3[]};
const palette=['#ffd18a','#ff957b','#c8b0ff','#9fe3d5','#fff3cd'];
const focal=650;
export function project3D(p:V3,width:number,height:number){const scale=focal/(focal+Math.max(-400,p.z));return {x:width/2+p.x*scale,y:height/2+p.y*scale,scale}}
export function shotDestination(origin:{x:number;y:number},direction:{x:number;y:number},width:number,height:number){
 const length=Math.hypot(direction.x,direction.y)||1,travel=Math.min(width,height)*.3;
 return {x:Math.max(12,Math.min(width-12,origin.x+direction.x/length*travel)),y:Math.max(12,Math.min(height-12,origin.y+direction.y/length*travel))};
}
function world(x:number,y:number,z:number,width:number,height:number):V3{const scale=focal/(focal+z);return {x:(x-width/2)/scale,y:(y-height/2)/scale,z}}

export class Fireworks3D {
 private sparks:Spark[]=[];private rockets:Rocket[]=[];private last=0;
 clear(){this.sparks=[];this.rockets=[]}
 burst(x:number,y:number,width:number,height:number,intensity=65,z=70,color?:string){
  const centre=world(x,y,z,width,height),count=Math.round(100*intensity/65);
  for(let i=0;i<count;i++){
   // Uniform sphere, rather than a flat circle: depth changes size, speed and order.
   const azimuth=Math.random()*Math.PI*2,vertical=Math.random()*2-1,ring=Math.sqrt(1-vertical*vertical),speed=1.4+Math.random()*4.5;
   const life=40+Math.random()*45;
   this.sparks.push({p:{...centre},v:{x:Math.cos(azimuth)*ring*speed,y:vertical*speed,z:Math.sin(azimuth)*ring*speed},life,max:life,color:color||palette[i%palette.length],size:Math.random()*2+1});
  }
  if(this.sparks.length>2400)this.sparks.splice(0,this.sparks.length-2400);
 }
 shoot(shot:Shot,width:number,height:number){
  const end=shotDestination(shot.origin,shot.direction,width,height);
  this.rockets.push({from:world(shot.origin.x,shot.origin.y,-40,width,height),to:world(end.x,end.y,200+shot.depth,width,height),start:performance.now(),duration:450,color:palette[this.rockets.length%palette.length],tail:[]});
  if(this.rockets.length>16)this.rockets.shift();
 }
 draw(ctx:CanvasRenderingContext2D,width:number,height:number,now:number,intensity:number,onPop:()=>void){
  const dt=Math.min(2,(now-this.last)/16.67)||1;this.last=now;
  ctx.save();ctx.globalCompositeOperation='lighter';
  this.rockets=this.rockets.filter(rocket=>{
   const t=Math.min(1,(now-rocket.start)/rocket.duration),ease=1-Math.pow(1-t,2);
   const p={x:rocket.from.x+(rocket.to.x-rocket.from.x)*ease,y:rocket.from.y+(rocket.to.y-rocket.from.y)*ease-Math.sin(t*Math.PI)*30,z:rocket.from.z+(rocket.to.z-rocket.from.z)*ease};
   rocket.tail.push(p);if(rocket.tail.length>14)rocket.tail.shift();
   ctx.strokeStyle=rocket.color;ctx.lineWidth=2;ctx.beginPath();rocket.tail.forEach((v,i)=>{const q=project3D(v,width,height);if(!i)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y)});ctx.stroke();
   const q=project3D(p,width,height);orb(ctx,q.x,q.y,Math.max(3,7*q.scale),rocket.color);
   if(t===1){this.burst(q.x,q.y,width,height,intensity,p.z,rocket.color);onPop();return false}return true;
  });
  this.sparks=this.sparks.filter(p=>p.life>0);
  this.sparks.sort((a,b)=>b.p.z-a.p.z);
  for(const s of this.sparks){
   s.life-=dt;const old=project3D(s.p,width,height);s.p.x+=s.v.x*dt;s.p.y+=s.v.y*dt;s.p.z+=s.v.z*dt;s.v.y+=.04*dt;s.v.x*=Math.pow(.985,dt);s.v.z*=Math.pow(.99,dt);
   const p=project3D(s.p,width,height);ctx.globalAlpha=Math.max(0,s.life/s.max);ctx.strokeStyle=s.color;ctx.lineWidth=Math.max(.5,s.size*p.scale);ctx.beginPath();ctx.moveTo(old.x,old.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.5,s.size*p.scale),0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
 }
}

function orb(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string){
 const glow=ctx.createRadialGradient(x,y,0,x,y,r*3);glow.addColorStop(0,color);glow.addColorStop(.3,color+'aa');glow.addColorStop(1,color+'00');ctx.fillStyle=glow;ctx.fillRect(x-r*3,y-r*3,r*6,r*6);
 const sphere=ctx.createRadialGradient(x-r*.3,y-r*.3,.1,x,y,r);sphere.addColorStop(0,'#ffffff');sphere.addColorStop(.35,color);sphere.addColorStop(1,'#7f4529');ctx.fillStyle=sphere;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
}

export function drawHands(ctx:CanvasRenderingContext2D,overlay:HandOverlay|null,now:number){
 if(!overlay||now-overlay.updatedAt>350)return;
 const edges=[[0,1,2,3,4],[0,5,6,7,8],[5,9,13,17,0],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
 for(const hand of overlay.hands){
  ctx.save();const color=palette[(hand.id-1)%palette.length];ctx.strokeStyle=color+'88';ctx.lineWidth=1;
  for(const chain of edges){ctx.beginPath();chain.forEach((index,j)=>{const p=hand.points[index];if(!j)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y)});ctx.stroke()}
  for(const p of hand.points){ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill()}
  const {x,y}=hand.aim;
  ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,hand.gesture==='palm'?26:17,0,Math.PI*2);ctx.stroke();
  if(hand.gesture==='gun'){
   const pulse=1+Math.sin(now*.009)*.08;
   orb(ctx,x,y,(3+hand.charge*10)*pulse,color);
   ctx.strokeStyle=hand.charge>=1?'#bafaaf':color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,23,-Math.PI/2,-Math.PI/2+hand.charge*Math.PI*2);ctx.stroke();
   ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(x+hand.direction.x*30,y+hand.direction.y*30);ctx.lineTo(x+hand.direction.x*90,y+hand.direction.y*90);ctx.stroke();ctx.setLineDash([]);
   ctx.font='600 10px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff1d5';ctx.fillText(hand.charge>=1?'FLICK TO FIRE':`CHARGING ${Math.round(hand.charge*100)}%`,x,y+40);
  }else{ctx.beginPath();ctx.moveTo(x-5,y);ctx.lineTo(x+5,y);ctx.moveTo(x,y-5);ctx.lineTo(x,y+5);ctx.stroke()}
  ctx.restore();
 }
 if(overlay.banner)drawBanner(ctx,overlay.banner,now);
}

function drawBanner(ctx:CanvasRenderingContext2D,banner:NonNullable<HandOverlay['banner']>,now:number){
 const {left,right}=banner,dx=right.x-left.x,dy=right.y-left.y,width=Math.hypot(dx,dy),height=Math.max(40,Math.min(105,width*.28));
 if(width<70)return;
 ctx.save();ctx.translate((left.x+right.x)/2,(left.y+right.y)/2);ctx.rotate(Math.atan2(dy,dx));
 // A floating ribbon plane with thickness, lighting and hand-controlled perspective.
 const tilt=Math.max(-.16,Math.min(.16,banner.depth*.0008));ctx.transform(1,0,tilt,1,0,0);
 ctx.shadowColor='#ffbf6366';ctx.shadowBlur=23;
 ctx.fillStyle='#664124';ctx.fillRect(-width/2+3,-height/2+6,width-6,height);
 const fill=ctx.createLinearGradient(0,-height/2,0,height/2);fill.addColorStop(0,'#fff1c2');fill.addColorStop(.48,'#edbd78');fill.addColorStop(1,'#b8793c');ctx.fillStyle=fill;
 ctx.beginPath();ctx.moveTo(-width/2,-height/2);ctx.lineTo(width/2,-height/2);ctx.lineTo(width/2-13,0);ctx.lineTo(width/2,height/2);ctx.lineTo(-width/2,height/2);ctx.lineTo(-width/2+13,0);ctx.closePath();ctx.fill();ctx.shadowBlur=0;
 ctx.strokeStyle='#fff5d8';ctx.lineWidth=1;ctx.strokeRect(-width/2+17,-height/2+5,width-34,height-10);
 const fontSize=Math.min(38,width/8.7);ctx.font=`italic 700 ${fontSize}px Georgia, serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff4d1';ctx.fillText('Happy Diwali',1,2,width-42);ctx.fillStyle='#62401f';ctx.fillText('Happy Diwali',0,0,width-42);
 ctx.font=`600 ${Math.max(7,fontSize*.24)}px sans-serif`;ctx.fillStyle='#674623';ctx.fillText('LET YOUR LIGHT SHINE',0,height*.32,width-45);
 for(let i=0;i<14;i++){const x=-width/2+width*i/13,y=Math.sin(i*2+now*.003)*8-height/2-8;ctx.globalAlpha=.5+Math.sin(now*.005+i)*.4;orb(ctx,x,y,1.5,'#ffe2a1')}
 ctx.restore();
}
