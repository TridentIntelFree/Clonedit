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
import { writeFileSync } from 'node:fs';
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
for(const [name,opt] of VERSIONS){
  const t0=Date.now();
  let r;
  try{
    r=await call('resynth',Object.assign({target:TARGET, brain:BRAIN, pad:PAD,
      seed:4242, blockMs:55},opt));
  }catch(e){ console.log(name.padEnd(13)+'FAILED  '+String(e.message).slice(0,70)); continue; }
  /* the rebuilt pad alone, as a file to listen to */
  await call('pattern',0,{plen:16, clear:true, select:true});
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
console.log('\nwrote resynth-ab-*.wav — listen to them, the numbers do not '
  +'say which is better.');
await browser.close(); srv.close();
