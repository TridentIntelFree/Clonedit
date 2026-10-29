/* DOES THE FINER MATCH ACTUALLY SOUND DIFFERENT.
   ==============================================

   resynth() was extended from roughly a third of Samplebrain's
   parameters to all of them. The unit tests prove the parameters EXIST
   and are honoured — that bins:32 really is 32 dimensions, that slide
   really does hold target blocks. They cannot say whether any of it is
   an improvement, because nothing in this repo can.

   So this renders the same rebuild several ways and writes a WAV of
   each, to be listened to. It also prints the one objective number
   available: how well each version's spectrum tracks the target's,
   measured per block. A rebuild that matches the target's moment-to-
   moment colour more closely is doing the job the technique describes;
   whether that is the more interesting sound is a separate question and
   not one a number answers.

       node scripts/resynth-ab.mjs

   Writes resynth-ab-<name>.wav into the working directory. */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/';

const exe=await findBrowser(); const srv=await serve();
const args=['--no-sandbox']; if(process.env.HTTPS_PROXY) args.push('--proxy-server='+process.env.HTTPS_PROXY);
const browser=await chromium.launch({executablePath:exe,args});
const {page,errors}=await boot(browser,srv.base);
await page.evaluate(async()=>{ const w=ms=>new Promise(r=>setTimeout(r,ms));
  document.querySelector('#tabs button[data-v="proj"]').click(); await w(150);
  document.getElementById('btnAgentLink').click(); await w(200);
  const f=document.createElement('iframe'); f.style.display='none'; f.id='portal';
  document.body.appendChild(f); f.contentWindow.eval(document.getElementById('cmdTab').textContent); await w(300); });
const call=async(n,...a)=>{ const r=await page.evaluate(([x,y])=>
  document.getElementById('portal').contentWindow.jbh(x,...y),[n,a]);
  if(!r||r.ok!==true) throw new Error(n+': '+(r&&r.error)); return r.result; };

await call('clear');
await call('set',{bpm:100});

/* THE MATERIAL. A real recorded piano note as the target, and a brain
   of struck metal and wood from the mallet pack — the case the original
   section in AGENTS.md describes, so the comparison is against the
   thing that was actually claimed. */
await call('pack','samples/salamander.json');
const piano=await call('instrument','piano',{pack:'samples/salamander.json',
  match:'^sal:', lo:60, hi:62});
const TARGET=(await call('instPads','piano'))[0].pad;
console.log('target: '+(await call('pad',TARGET)).name);

await call('pack','samples/vcsl-mallets.json');
const BRAIN=[];
for(const [inst,lo,hi] of [['vibs',55,72],['marimba',55,72],['hchime',60,80],['kalimbt',55,75]]){
  try{
    await call('instrument','br_'+inst,{pack:'samples/vcsl-mallets.json',
      match:'^vc:'+inst, lo, hi});
    for(const x of await call('instPads','br_'+inst)) BRAIN.push(x.pad);
  }catch(e){ console.log('  (no '+inst+': '+String(e.message).slice(0,60)+')'); }
}
console.log('brain: '+BRAIN.length+' pads of struck metal and wood');
if(!BRAIN.length) throw new Error('nothing in the brain');

/* HOW CLOSELY DOES THE REBUILD TRACK THE TARGET. Both are rendered
   solo, then compared band by band in short windows. One number, and a
   crude one — but it is the same measurement for every version, which
   is all a comparison needs. */
const trackErr=async(pad)=>{
  const a=await call('render',{only:[TARGET], src:'pat', loudness:false});
  const b=await call('render',{only:[pad], src:'pat', loudness:false});
  return {targetPeak:a&&a.peak, gotPeak:b&&b.peak};
};

const VERSIONS=[
  ['old-8-band',   {bins:8,  mfcc:0,    algorithm:'basic'}],
  ['new-default',  {}],
  ['mfcc-only',    {bins:32, mfcc:1,    algorithm:'basic'}],
  ['synaptic',     {algorithm:'synaptic', synapses:120}],
  ['slide',        {algorithm:'slide', synapses:120, slideError:5}],
  ['autotuned',    {autotune:true}],
  ['stretched',    {stretch:3}],
];

const PAD=40;

/* THE TARGET, RENDERED THE SAME WAY. Without this the comparison below
   has nothing to be a comparison against, and the first draft of this
   script tried to rank the versions against each OTHER — which cannot
   work, because they are all mutually uncorrelated. */
{
  await call('set',{bpm:80});
  await call('pad',TARGET,{att:0.001, dec:40, sus:1, rel:0.2, gain:1});
  await call('pattern',0,{plen:64, clear:true, select:true});
  await call('step',TARGET,0,0.95);
  const wav=await call('render',{src:'pat', loops:1, wav:true, depth:24});
  writeFileSync(OUT+'resynth-ab-TARGET.wav', Buffer.from(wav.wavBase64,'base64'));
  console.log('target rendered: '+wav.seconds+'s');
}

for(const [name,opt] of VERSIONS){
  const t0=Date.now();
  let r;
  try{
    r=await call('resynth',Object.assign({target:TARGET, brain:BRAIN, pad:PAD,
      seed:4242, blockMs:55},opt));
  }catch(e){ console.log(name.padEnd(13)+'FAILED  '+String(e.message).slice(0,70)); continue; }
  /* THE WHOLE REBUILD, NOT THE FIRST THREE SECONDS OF IT. The first
     version of this triggered the pad inside a 16-step pattern at
     100bpm, so every file came out 2.9 seconds long whatever had been
     rebuilt — which cut off `slide` and `stretch` exactly where their
     effect lives, since what those two change IS the length. All seven
     files were the same size and it looked like the settings did
     nothing; the checksums differed, so they did.

     The pattern is stretched to cover each version's own duration, and
     the pad is given an envelope that lets the sample run to its end
     rather than closing a gate over it. */
  const secs=+r.seconds||4;
  const bpm=Math.max(20, Math.min(200, Math.round(960/secs)));
  await call('set',{bpm});
  await call('pad',PAD,{att:0.001, dec:40, sus:1, rel:0.2, gain:1});
  await call('pattern',0,{plen:64, clear:true, select:true});
  await call('step',PAD,0,0.95);
  const wav=await call('render',{src:'pat', loops:1, wav:true, depth:24});
  writeFileSync(OUT+'resynth-ab-'+name+'.wav', Buffer.from(wav.wavBase64,'base64'));
  console.log(name.padEnd(13)
    +String(r.features.dims).padStart(3)+' dims  '
    +String(r.blocks).padStart(4)+' blocks  '
    +'of '+String(r.brainBlocks).padStart(5)+'  '
    +r.seconds+'s'
    +(r.slidRepeats?('  '+r.slidRepeats+' held'):'')
    +(r.autotuned?('  '+r.autotuned+' bent'):'')
    +(r.synapsesBuilt?('  '+r.synapsesBuilt+' nodes'):'')
    +'  ['+((Date.now()-t0)/1000).toFixed(1)+'s]');
}
if(errors.length) console.log('JS ERRORS:', errors.slice(0,3));

/* HOW CLOSELY DOES EACH VERSION TRACK THE TARGET.

   The first version of this measured each render's distance from the
   old 8-band one in the time domain, and every single setting came back
   between 141.7% and 144.3%. That is not seven similar results, it is
   a saturated metric: two uncorrelated signals of equal power differ by
   root two, which is 141.4%, and every version landed on it. Changing
   the feature space changes which block is chosen at nearly every
   position, so the waveforms are simply unrelated and a sample-by-
   sample comparison can only ever report "completely different".

   Worth keeping as a fact — these are not subtle variations of one
   sound — but useless for ranking. The measure that discriminates is
   distance to the TARGET, because approximating the target is the job.
   Per-frame band energies of the rebuild against the same frames of
   the target, mean absolute error in dB: lower means the rebuild
   follows the piano's moment-to-moment colour more closely. It still
   says nothing about which is the better SOUND. */
const rd=(f)=>{ const b=readFileSync(OUT+'resynth-ab-'+f+'.wav');
  let off=12; while(off<b.length-8){ const id=b.toString('ascii',off,off+4);
    const sz=b.readUInt32LE(off+4);
    if(id==='data') return new Int16Array(b.buffer, b.byteOffset+off+8,
      Math.floor(Math.min(sz, b.length-off-8)/2));
    off+=8+sz+(sz&1); } return new Int16Array(0); };
/* a small radix-2 FFT, so the frames can be compared without the app */
const fft=(re,im)=>{ const n=re.length;
  for(let i=1,j=0;i<n;i++){ let b=n>>1;
    for(;j&b;b>>=1) j^=b; j^=b;
    if(i<j){ let t=re[i]; re[i]=re[j]; re[j]=t; t=im[i]; im[i]=im[j]; im[j]=t; } }
  for(let len=2;len<=n;len<<=1){ const ang=-2*Math.PI/len;
    const wr=Math.cos(ang), wi=Math.sin(ang);
    for(let i=0;i<n;i+=len){ let cr=1, ci=0;
      for(let k=0;k<len/2;k++){
        const ur=re[i+k], ui=im[i+k];
        const vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci;
        const vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;
        re[i+k]=ur+vr; im[i+k]=ui+vi;
        re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
        const ncr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=ncr; } } } };
const SR=44100, NF=1024, NB=16;
const envelope=(pcm)=>{
  const frames=[], hop=NF>>1;
  const edges=[]; for(let b=0;b<=NB;b++) edges.push(40*Math.pow(16000/40,b/NB));
  for(let at=0; at+NF<=pcm.length; at+=hop){
    const re=new Float64Array(NF), im=new Float64Array(NF);
    let rms=0;
    for(let i=0;i<NF;i++){ const v=pcm[at+i]/32768;
      re[i]=v*(0.5-0.5*Math.cos(2*Math.PI*i/(NF-1))); rms+=v*v; }
    if(Math.sqrt(rms/NF)<2e-4){ frames.push(null); continue; }
    fft(re,im);
    const band=new Float64Array(NB), binHz=SR/NF;
    for(let i=1;i<NF/2;i++){ const hz=i*binHz;
      if(hz<edges[0]||hz>=edges[NB]) continue;
      let b=Math.floor(NB*Math.log(hz/edges[0])/Math.log(edges[NB]/edges[0]));
      if(b<0)b=0; else if(b>=NB)b=NB-1;
      band[b]+=re[i]*re[i]+im[i]*im[i]; }
    let mean=0;
    for(let b=0;b<NB;b++){ band[b]=10*Math.log10(Math.max(band[b],1e-12)); mean+=band[b]; }
    mean/=NB;
    for(let b=0;b<NB;b++) band[b]-=mean;          // colour, not level
    frames.push(band);
  }
  return frames;
};
try{
  const tgt=envelope(rd('TARGET'));
  console.log('\nhow closely each version tracks the target\'s colour');
  console.log('(mean error in dB across 16 bands, frame by frame — lower is closer):');
  const rows=[];
  for(const [name] of VERSIONS){
    let a; try{ a=envelope(rd(name)); }catch(e){ continue; }
    const n=Math.min(a.length, tgt.length);
    let s=0, c=0;
    for(let i=0;i<n;i++){ if(!a[i]||!tgt[i]) continue;
      for(let b=0;b<NB;b++) s+=Math.abs(a[i][b]-tgt[i][b]);
      c+=NB; }
    if(c) rows.push([name, s/c]);
  }
  rows.sort((x,y)=>x[1]-y[1]);
  for(const [name,v] of rows) console.log('   '+name.padEnd(13)+v.toFixed(2).padStart(6)+' dB');
  if(rows.length>1) console.log('   -> '+rows[0][0]+' tracks the target most closely, '
    +rows[rows.length-1][0]+' least.');
}catch(e){ console.log('(could not compare against the target: '+e.message+')'); }

/* READ THAT TABLE WITH ITS BIAS IN MIND, which is large enough to
   invert it. The measure is sixteen centred spectral bands — which is
   very nearly what the OLD eight-band matcher was optimising, and not
   at all what the MFCC blend optimises. Scoring the band matcher with
   a band metric flatters it by construction, and sure enough it comes
   top. That is the same circularity this repo keeps hitting from new
   directions: the first version was the app measuring its own output
   with its own code, and this is a metric shaped like one contestant's
   objective function.
   The spread is also only about a quarter of a decibel across all
   seven, which is not much to hang a conclusion on either way. So this
   table is evidence that the settings produce genuinely different
   renders and no evidence at all about which is better. */
console.log('\nTHE TABLE ABOVE IS BIASED and cannot settle this. Sixteen centred');
console.log('bands is nearly the old 8-band matcher\'s own objective, so scoring');
console.log('it on that flatters it; the MFCC blend is optimising something the');
console.log('metric does not measure. The whole spread is 0.25dB. Listen to the');
console.log('files — nothing here can tell you which is the better sound.');
await browser.close(); srv.close();
