// === index.html dan ajratildi (XOLERIC SEO) ===
(() => {
'use strict';

const video = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d', {willReadFrequently:false});
const mask = document.getElementById('mask');
const mctx = mask.getContext('2d', {willReadFrequently:true});
const start = document.getElementById('start');
const statusEl = document.getElementById('status');
const dot = document.getElementById('dot');
const notice = document.getElementById('notice');

let stream=null, running=false, invisible=true, facing='user';
let background=null, bgCanvas=null, lastMask=null, segmenter=null;
let W=1280,H=720, raf=0, busy=false;

const settings = {
  threshold:50, blur:3, blend:100, mirror:true, mode:'remove'
};

function say(text){
  notice.textContent=text; notice.style.display='block';
  clearTimeout(say.t); say.t=setTimeout(()=>notice.style.display='none',2400);
}

function resize(){
  const vw=video.videoWidth||1280, vh=video.videoHeight||720;
  const ratio=vw/vh, cw=innerWidth, ch=innerHeight;
  if(cw/ch > ratio){ W=Math.round(ch*ratio); H=ch; } else { W=cw; H=Math.round(cw/ratio); }
  canvas.width=W; canvas.height=H; mask.width=W; mask.height=H;
  if(bgCanvas){ bgCanvas.width=W; bgCanvas.height=H; }
}
addEventListener('resize', resize);

async function startCamera(){
  try{
    if(stream) stream.getTracks().forEach(t=>t.stop());
    stream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:facing,width:{ideal:1280},height:{ideal:720}},
      audio:false
    });
    video.srcObject=stream;
    await video.play();
    resize();
    running=true;
    start.style.display='none';
    statusEl.textContent='LIVE';
    dot.classList.add('live');
    say('Kamera ishga tushdi. Avval bo‘sh fonni saqlang.');
    if(!segmenter) initSegmenter();
    render();
  }catch(e){
    console.error(e);
    say('Kamera ochilmadi: HTTPS yoki localhost va kamera ruxsatini tekshiring.');
  }
}

function initSegmenter(){
  if(typeof SelfieSegmentation==='undefined'){
    say('AI segmentatsiya kutubxonasi yuklanmadi.');
    return;
  }
  segmenter = new SelfieSegmentation({
    locateFile: file => 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/'+file
  });
  segmenter.setOptions({modelSelection:1});
  segmenter.onResults(onResults);
}

function drawVideo(target){
  target.save();
  if(settings.mirror && facing==='user'){
    target.translate(W,0); target.scale(-1,1);
  }
  target.drawImage(video,0,0,W,H);
  target.restore();
}

function snapshotBackground(){
  if(!video.videoWidth){say('Kamera hali tayyor emas.');return;}
  bgCanvas=document.createElement('canvas'); bgCanvas.width=W; bgCanvas.height=H;
  const b=bgCanvas.getContext('2d');
  drawVideo(b);
  background=b.getImageData(0,0,W,H);
  say('Bo‘sh fon saqlandi. Endi kamera oldiga kiring.');
}

function onResults(results){
  if(!running || !video.videoWidth) return;
  const personMask=results.segmentationMask;
  mctx.clearRect(0,0,W,H);
  mctx.drawImage(personMask,0,0,W,H);
  lastMask=mctx.getImageData(0,0,W,H);
  composite(lastMask);
}

function composite(maskData){
  ctx.clearRect(0,0,W,H);
  const mode=settings.mode;

  if(mode==='normal' || !background || !invisible){
    drawVideo(ctx);
    return;
  }

  // Draw current frame into a temporary pixel buffer.
  const tmp=document.createElement('canvas');
  tmp.width=W; tmp.height=H;
  const tctx=tmp.getContext('2d');
  drawVideo(tctx);
  const cur=tctx.getImageData(0,0,W,H);
  const out=ctx.createImageData(W,H);
  const p=maskData.data, c=cur.data, b=background.data, o=out.data;
  const threshold=settings.threshold/100;
  const blend=settings.blend/100;

  for(let i=0;i<o.length;i+=4){
    // MediaPipe mask is grayscale: brighter means person.
    let a=p[i]/255;
    a=Math.max(0,Math.min(1,(a-(threshold-.25))/.5));
    // Smooth-ish alpha without expensive per-pixel blur.
    if(settings.blur>0) a=Math.pow(a, 1/(1+settings.blur*.08));

    if(mode==='remove'){
      // Person -> captured background, everything else -> live frame.
      o[i]=c[i]*(1-a)+b[i]*a;
      o[i+1]=c[i+1]*(1-a)+b[i+1]*a;
      o[i+2]=c[i+2]*(1-a)+b[i+2]*a;
    }else if(mode==='ghost'){
      o[i]=c[i]*(1-a*.78);
      o[i+1]=c[i+1]*(1-a*.78);
      o[i+2]=c[i+2]*(1-a*.78);
    }else if(mode==='outline'){
      const x=(i/4)%W, y=Math.floor((i/4)/W);
      const idx=((Math.max(0,y-1)*W+x)|0)*4;
      const edge=Math.abs((p[i]||0)-(p[idx]||0))/255;
      o[i]=c[i]+edge*120; o[i+1]=c[i+1]+edge*240; o[i+2]=c[i+2]+edge*210;
    }
    o[i+3]=255;
  }
  ctx.putImageData(out,0,0);
}

async function render(){
  if(!running) return;
  if(segmenter && !busy && video.readyState>=2){
    busy=true;
    try{ await segmenter.send({image:video}); }catch(e){console.warn(e)}
    busy=false;
  }
  raf=requestAnimationFrame(render);
}

document.getElementById('startBtn').onclick=startCamera;
document.getElementById('capture').onclick=snapshotBackground;

document.getElementById('toggle').onclick=e=>{
  invisible=!invisible;
  e.currentTarget.textContent=invisible?'Invisible ON':'Invisible OFF';
  e.currentTarget.classList.toggle('active',invisible);
};

document.getElementById('swap').onclick=async()=>{
  facing=facing==='user'?'environment':'user';
  await startCamera();
};

document.getElementById('settings').onclick=()=>{
  document.getElementById('panel').classList.toggle('show');
};

document.getElementById('mode').onchange=e=>settings.mode=e.target.value;
document.getElementById('threshold').oninput=e=>settings.threshold=+e.target.value;
document.getElementById('blur').oninput=e=>settings.blur=+e.target.value;
document.getElementById('blend').oninput=e=>settings.blend=+e.target.value;
document.getElementById('mirror').onchange=e=>settings.mirror=e.target.checked;

window.addEventListener('beforeunload',()=>{
  if(stream) stream.getTracks().forEach(t=>t.stop());
  cancelAnimationFrame(raf);
});
})();