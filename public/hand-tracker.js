// Use a classic worker: MediaPipe's WASM loader calls importScripts.
// The distributed runtime is CommonJS, not a UMD global called `vision`.
let tracker=null;
const base=new URL('vendor/mediapipe/',self.location.href).href;
const modelUrl='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
function detail(error){return error?.message||String(error)}
self.onmessage=async e=>{
 if(e.data.type==='init'){
  let stage='runtime';
  try{
   self.postMessage({type:'progress',message:'Loading local hand-tracking runtime…'});
   self.exports={};
   importScripts(`${base}vision-runtime.js`);
   const {FilesetResolver,HandLandmarker}=self.exports;
   if(!FilesetResolver||!HandLandmarker)throw new Error('The hand-tracking runtime did not export the expected API.');
   const files=await FilesetResolver.forVisionTasks(`${base}wasm`);
   stage='model';self.postMessage({type:'progress',message:'Downloading hand model (first use can take a moment)…'});
   const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),45000);
   let model;
   try{
    const response=await fetch(modelUrl,{signal:abort.signal,cache:'force-cache'});
    if(!response.ok)throw new Error(`Model download returned HTTP ${response.status}.`);
    model=new Uint8Array(await response.arrayBuffer());
    if(!model.length)throw new Error('The downloaded hand model is empty.');
   }catch(error){if(abort.signal.aborted)throw new Error('The model download timed out after 45 seconds.');throw error}
   finally{clearTimeout(timeout)}
   stage='initialization';self.postMessage({type:'progress',message:'Starting hand detection…'});
   tracker=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:model,delegate:'CPU'},runningMode:'VIDEO',numHands:4,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5});
   self.postMessage({type:'ready'});
  }catch(error){console.error(`Hand tracker ${stage} failed`,error);self.postMessage({type:'error',stage,message:`Hand tracker ${stage}: ${detail(error)} Turn gestures off and on to retry.`})}
 }else if(e.data.type==='frame'){
  const bitmap=e.data.bitmap;
  try{const result=tracker?.detectForVideo(bitmap,e.data.time);self.postMessage({type:'result',hands:result?.landmarks||[]})}
  catch(error){console.error('Hand detection failed',error);self.postMessage({type:'error',stage:'detection',message:`Hand detection: ${detail(error)} Turn gestures off and on to retry.`})}
  finally{bitmap.close()}
 }
};
