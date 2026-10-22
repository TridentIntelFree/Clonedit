/* SUBSIDENCE — dark, heavy, and the bass is the tune.

   No piano. The low end is three synthesised layers per note — a sine
   sub for the weight, a Reese for the movement, an FM growl for the
   teeth — and everything percussive is still a field recording: thunder
   for the impact, breaking glass for the snare, a door creak for the
   detail, a helicopter rotor for the thump underneath.

   HI-FI MEANS DECISIONS, not a setting. The sub is folded to mono below
   120Hz so it stays tight and the width lives above it; 300Hz is cut so
   the low mids do not pile up behind the bass; the top is lifted with a
   shelf above 12k rather than by brightening anything; and the limiter
   is left enough room that the crest stays near twelve instead of being
   squeezed to eight. */
import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=168;
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
const bat=async l=>{ const r=await call('batch',l);
  if(r.failed) throw new Error(JSON.stringify(r.results.filter(x=>!x.ok).slice(0,2)));
  return r; };
await call('clear');

const dk=await call('instrument','dk',{pack:'samples/darkkit.json',match:'^dk:'});
const padsOf=async n=>await call('instPads',n);
const D={}; for(const p of await padsOf('dk')) D[p.note]=p.pad;
const THUD=D[36], GLASS=D[38], CREAK=D[39], TRAIN=D[41], ROTOR=D[43],
      BELL=D[51], ENG=D[60], SEA=D[61], SAW=D[62];
/* a water drop and a mouse click from the other kit, for the fine detail */
const fk=await call('instrument','fk',{pack:'samples/foundkit.json',match:'^fk:(hat|click)'});
const FK={}; for(const p of await padsOf('fk')) FK[p.note]=p.pad;
const DROP=FK[42], CLICK=FK[39];

/* ---- THE BASS: three layers per note, each synthesised at its own pitch */
const BN=[26,29,31,33,34];                       // D1 F1 G1 A1 Bb1
const SUB={}, REE={};
for(let i=0;i<BN.length;i++){
  await call('preset','bsub',16+i,BN[i]); SUB[BN[i]]=16+i;
  await call('preset','breese',24+i,BN[i]+12); REE[BN[i]]=24+i;
}
/* THE HARMONY LAYER. Measured, 190-420Hz sat 5-6dB below the rest of the
   bass: the sub is lowpassed at 147 and the dirty Reese bandpassed at
   900, so nothing lived between them — and that band is what makes a
   bass penetrate rather than rumble. Two octaves above the root puts a
   clean fundamental at ~147Hz for D1 with its own harmonics landing at
   294 and 440, straight into the trough. Clean on purpose: the Reese is
   already the dirt, this is the part that has to be heard clearly. */
const OCT={};
for(let i=0;i<BN.length;i++){ await call('preset','b808',48+i,BN[i]+24); OCT[BN[i]]=48+i; }
const GROWL=32, KSUB=33;
await call('preset','bfm',GROWL,38);
await call('preset','dkick',KSUB,30);
console.log('dark kit '+dk.pads.length+' · bass '+(BN.length*2+2)+' voices');

await bat([
  /* weight: pure sine, mono, nothing above 90Hz */
  ...BN.map(n=>['pad',SUB[n],{inst:'sub', att:0.004,dec:2.8,sus:0.75,rel:0.26,
    ftype:'lowpass', fcut:0.17, fres:0.6, drv:0.10, gain:0.50, pan:0, rev:0}]),
  /* movement: the Reese an octave up, filter breathing underneath */
  ...BN.map(n=>['pad',REE[n],{inst:'reese', att:0.012,dec:2.2,sus:0.6,rel:0.22,
    ftype:'bandpass', fcut:0.54, fres:0.9, drv:0.82, crush:11, gain:1.30,
    pan:0.04, rev:0.07, gainTrim:0,
    lfoOn:true, lfoTgt:'cutoff', lfoShape:'tri', lfoRate:0.42, lfoDepth:0.40}]),
  /* the octave: clear, present, and the reason the note reads as a note */
  ...BN.map(n=>['pad',OCT[n],{inst:'oct', att:0.004,dec:1.8,sus:0.5,rel:0.22,
    ftype:'bandpass', fcut:0.42, fres:0.7, drv:0.34, gain:1.45, pan:0, rev:0.06}]),
  /* teeth: the FM growl, short and only on accents */
  ['pad',GROWL,{inst:'growl', att:0.004,dec:0.9,sus:0.3,rel:0.18, ftype:'bandpass', fcut:0.38,
    fres:2.6, drv:0.62, gain:0.70, pan:-0.06, rev:0.12}],
  ['pad',KSUB,{inst:'sub', att:0.001,dec:0.42,sus:0,rel:0.12, ftype:'lowpass', fcut:0.20,
    drv:0.22, gain:0.40, pan:0, rev:0.02}],
  /* ---- percussion, all of it found ---- */
  ['pad',THUD, {start:0.936,end:0.985, pitch:-5, att:0.001,dec:0.40,sus:0,rel:0.14,
    drv:0.34, crush:9, ftype:'lowpass', fcut:0.34, fres:1.2, gain:1.25, pan:0, rev:0.10, vary:0.08}],
  ['pad',GLASS,{start:0.124,end:0.190, pitch:-2, att:0.001,dec:0.22,sus:0,rel:0.10,
    drv:0.20, ftype:'highpass', fcut:0.20, gain:1.30, pan:0.04, rev:0.30, vary:0.14}],
  ['pad',CREAK,{start:0.016,end:0.070, pitch:4, att:0.001,dec:0.14,sus:0,rel:0.06,
    ftype:'bandpass', fcut:0.58, fres:2.4, gain:2.00, pan:-0.30, rev:0.22, vary:0.26}],
  ['pad',TRAIN,{start:0.202,end:0.280, pitch:-3, att:0.002,dec:0.30,sus:0,rel:0.12,
    crush:10, ftype:'bandpass', fcut:0.47, fres:1.1, gain:1.60, pan:0.26, rev:0.26, vary:0.18}],
  ['pad',ROTOR,{start:0.926,end:0.990, pitch:-7, att:0.002,dec:0.26,sus:0,rel:0.10,
    ftype:'lowpass', fcut:0.30, drv:0.18, gain:0.80, pan:0.12, rev:0.14, vary:0.12}],
  ['pad',BELL, {start:0.678,end:0.860, pitch:-12, att:0.003,dec:2.2,sus:0.25,rel:0.8,
    ftype:'lowpass', fcut:0.46, fres:1.4, gain:0.85, pan:-0.10, rev:0.52, vary:0.04}],
  ['pad',DROP, {start:0.252,end:0.276, pitch:12, att:0.001,dec:0.05,sus:0,rel:0.03,
    ftype:'highpass', fcut:0.46, gain:1.50, pan:0.30, rev:0.10, vary:0.26}],
  ['pad',CLICK,{start:0.902,end:0.918, pitch:17, att:0.001,dec:0.04,sus:0,rel:0.02,
    ftype:'highpass', fcut:0.52, gain:1.20, pan:-0.34, rev:0.08, vary:0.30}],
  /* ---- texture ---- */
  ['pad',ENG,  {mode:'grain', grSize:0.22, grDens:16, grSpread:0.26, grPitch:3,
    grBurst:2.2, start:0.10,end:0.90, pitch:-10, ftype:'lowpass', fcut:0.34, fres:1.0,
    gain:1.90, pan:-0.08, rev:0.34}],
  ['pad',SEA,  {start:0,end:1, att:0.03,dec:2.4,sus:0,rel:0.5, pitch:-2,
    ftype:'highpass', fcut:0.30, gain:1.30, pan:0.20, rev:0.40, reverse:true}],
  ['pad',SAW,  {start:0,end:1, att:0.004,dec:0.5,sus:0,rel:0.08, pitch:-8,
    ftype:'bandpass', fcut:0.44, fres:3.0, crush:8, gain:1.15, pan:0.30, rev:0.20}],
]);
/* HI-FI: bass mono under 120, 300Hz cut, air above 12k, limiter left room */
await call('set',{bpm:BPM, swing:0, human:0.045, humanDrift:0.26,
  revType:'plate', revSize:2.2, revLvl:0.40, dlyMode:'digital', delayFb:0.30, dlyTone:6200,
  compAmt:0.12, mWidth:1.18, mMono:120, mCeil:-3.4, mAir:2.4, mMud:-2.6, mEqMid:0,
  scOn:true, scTrig:THUD, scDepth:0.48, scRel:0.17, masterVol:1.0, mTrim:0});

/* ---- through-composed, seeded ---------------------------------------- */
let _s=86753099;
const rnd=()=>{ _s=(_s*1103515245+12345)&0x7fffffff; return _s/0x7fffffff; };
const chance=p=>rnd()<p;
const pickOf=a=>a[Math.floor(rnd()*a.length)%a.length];
const GL=[0.124,0.133,0.145,0.158,0.170,0.182];
const CR=[0.016,0.030,0.044,0.058];
const SAWP=[0.12,0.21,0.33,0.41,0.52,0.60,0.71,0.80];
const B=(bar,st)=>bar*16+st;
const P=i=>call('set',{pattern:i});
for(let i=0;i<8;i++) await call('pattern',i,{plen:64,clear:true});

/* the hook: D phrygian, the flat second is where the dark comes from */
const HOOK=[[B(0,0),26,2.2],[B(0,11),26,0.5],[B(1,6),29,1.2],[B(1,14),27===27?26:26,0.4],
            [B(2,0),31,1.8],[B(2,10),29,0.6],[B(3,4),33,1.0],[B(3,12),34,1.4]];
const HOOK2=[[B(0,0),26,1.6],[B(0,9),31,0.6],[B(1,0),29,1.4],[B(1,11),26,0.5],
             [B(2,0),34,1.6],[B(2,12),33,0.6],[B(3,0),31,1.2],[B(3,9),29,0.8],[B(3,14),26,0.5]];
const lowline=async(rows,k=1,ree=true)=>{
  const o=[];
  for(const [st,n,bt] of rows){
    o.push(['step',SUB[n],st,0.92*k,{len:bt*(60/BPM)*1.25}]);
    o.push(['step',KSUB,st,0.80*k]);
    o.push(['step',OCT[n],st,0.80*k,{len:bt*(60/BPM)*0.9}]);
    if(ree) o.push(['step',REE[n],st,0.82*k,{len:bt*(60/BPM)*1.0}]);
    if(ree && chance(0.45)) o.push(['step',GROWL,st,0.42*k,{len:bt*(60/BPM)*0.5}]);
  }
  await bat(o);
};
function barOf(bar,d){
  const o=[]; const add=(pad,st,v,lk)=>o.push([pad,B(bar,st),v,lk||{}]);
  /* halftime skeleton at 168: the glass lands on step 8, which reads as 84 */
  add(THUD,0,0.96);
  add(GLASS,8,0.90,{start:pickOf(GL), rat: chance(0.18*d)?pickOf([2,3]):undefined});
  if(chance(0.5)) add(THUD,pickOf([3,5,11,13]),0.55+0.2*rnd());
  /* rotor thump doubling the low pulse */
  add(ROTOR,pickOf([4,6,12,14]),0.42+0.2*rnd());
  /* the fine detail layer — this is where the hi-fi lives */
  for(let st=0;st<16;st++){
    if(chance(0.20*d)) add(DROP,st,0.26+0.26*rnd(),
      {nudge:(rnd()*2-1)*0.10, rat: chance(0.22)?pickOf([2,3,4]):undefined});
    if(chance(0.14*d)) add(CLICK,st,0.22+0.22*rnd(),{nudge:(rnd()*2-1)*0.12});
    if(chance(0.09*d)) add(CREAK,st,0.28+0.24*rnd(),{start:pickOf(CR)});
    if(chance(0.17*d)) add(TRAIN,st,0.30+0.24*rnd(),
      {nudge:(rnd()*2-1)*0.09, rat: chance(0.15)?2:undefined});
  }
  if(bar===3){
    for(let st=9;st<16;st++) if(chance(0.5+0.22*d))
      add(pickOf([GLASS,THUD,DROP,SAW]),st,0.38+0.4*rnd(),
        {start: chance(0.5)?pickOf(GL.concat(SAWP)):undefined,
         rat: chance(0.5)?pickOf([2,3,4]):undefined, nudge:(rnd()*2-1)*0.14});
  }
  return o;
}
const drums=async(d=1)=>{
  const rows=[]; for(let b=0;b<4;b++) rows.push(...barOf(b,d));
  await bat(rows.map(([pad,st,v,lk])=>{ const L={};
    for(const k in lk) if(lk[k]!==undefined) L[k]=lk[k];
    return ['step',pad,st,v,L]; }));
};

/* 0 — the ground opening */
await P(0);
await bat([['automate','mvol',[[0,0.26],[48,0.40],[63,0.50]]],
  ['step',ENG,0,0.55],['step',ENG,B(2,0),0.5],
  ['step',BELL,B(0,0),0.6,{pitch:-12}],['step',BELL,B(2,8),0.5,{pitch:-17}],
  ['step',SEA,B(1,0),0.42,{start:0.2,len:2.2}],
  ['step',SUB[26],B(3,0),0.7,{len:2.0}]]);
/* 1 — the pulse */
await P(1); await drums(0.55);
await lowline([[B(0,0),26,2.2],[B(2,0),29,2.2]],0.9,false);
await bat([['step',ENG,0,0.45]]);
/* 2 — the hook */
await P(2); await drums(0.9);
await lowline(HOOK,1);
await bat([['step',ENG,0,0.42],['step',BELL,B(0,0),0.42,{pitch:-12}]]);
/* 3 — detail layer up, saw stabs, second hook */
await P(3); await drums(1.35);
await lowline(HOOK2,1);
await bat([['step',ENG,0,0.40],
  ['step',SAW,B(1,4),0.44,{start:0.21,len:0.16}],
  ['step',SAW,B(3,2),0.48,{start:0.52,len:0.12,rat:2}],
  ['step',GROWL,B(2,0),0.6,{len:0.5}],
  ['step',BELL,B(0,0),0.40,{pitch:-12}],['step',BELL,B(2,12),0.36,{pitch:-19}]]);
/* 4 — it opens out: no drums, the filter closing on everything */
await P(4);
await bat([['step',ENG,0,0.34],['step',SEA,B(0,0),0.30,{start:0.15,len:3.4}],
  ['step',BELL,B(1,0),0.32,{pitch:-12}],['step',BELL,B(3,0),0.28,{pitch:-17}],
  ['step',SUB[26],B(0,0),0.40,{len:3.0}],['step',OCT[26],B(0,0),0.30,{len:2.6}],
  ['step',SUB[29],B(2,0),0.36,{len:3.0}],
  /* and the last bar empties entirely, so the return lands */
  ['automate','mfilt',[[0,0.92],[36,0.34],[52,0.22],[63,0.55]]],
  ['automate','mvol',[[0,0.46],[40,0.30],[56,0.18],[63,0.40]]]]);
/* 5 — hardest */
await P(5); await drums(1.9);
await lowline(HOOK2,1);
await bat([['step',GROWL,B(0,8),0.62,{len:0.4}],['step',GROWL,B(2,8),0.62,{len:0.4}],
  ['step',GROWL,B(3,12),0.58,{len:0.3,rat:2}],
  ['step',ENG,0,0.38],
  ['step',SAW,B(0,14),0.5,{start:0.33,len:0.10,rat:3}],
  ['automate','mfilt',[[0,0.66],[44,0.98],[63,0.78]]],
  ['automate','mvol',[[0,0.62],[30,0.74],[63,0.78]]]]);
/* 6 — the rotor takes a metre of its own: five against four */
await P(6); await drums(0.8);
await lowline(HOOK,0.9);
await call('poly',ROTOR,{on:true,bpm:BPM*5/4,cells:5,lock:true,trig:'step',
  row:[[0,.46],[1,.26],[2,.34],[3,.22],[4,.30]]});
await bat([0,1,2,3].flatMap(b=>[[B(b,0),0.5],[B(b,8),0.42]])
  .map(([st,v])=>['step',ROTOR,st,v]));
await bat([['step',BELL,B(1,0),0.44,{pitch:-12}],['step',BELL,B(3,8),0.40,{pitch:-19}]]);
/* 7 — down */
await P(7); await call('pattern',7,{plen:32,bpm:132});
await bat([['step',THUD,0,0.9],['step',KSUB,0,0.9],['step',SUB[26],0,0.95,{len:2.6}],
  ['step',ENG,0,0.5],['step',GLASS,B(1,0),0.6,{rat:3}],
  ['step',BELL,B(1,8),0.6,{pitch:-24}],
  ['step',SEA,B(0,8),0.42,{start:0.3,len:2.6}]]);
await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:0,reps:1},{pat:1,reps:1},{pat:2,reps:2},{pat:3,reps:2},
        {pat:5,reps:1},{pat:4,reps:1},{pat:6,reps:2},{pat:5,reps:2},
        {pat:3,reps:1},{pat:2,reps:1},{pat:7,reps:1}]});

/* ---- check ------------------------------------------------------------ */
await call('set',{pattern:5, songOn:false});
console.log('\ncritique():');
const cr=await call('critique',{src:'pat'});
for(const f of cr.found) console.log('   ['+f.area+'/'+f.severity+'] '+f.says);
if(!cr.found.length) console.log('   (nothing)');
const tr=await call('translate',{src:'pat'});
console.log('\ntranslate(): '+tr.says);
for(const sy of tr.systems) console.log('   '+sy.says.padEnd(22)+' loses '+sy.lostDb+' dB');
for(const v of tr.voices) console.log('   voice '+v.instrument.padEnd(6)+' loses '+v.lostDb+' dB on a phone');
console.log('\nbalance:');
const grp={ perc:[THUD,GLASS,CREAK,TRAIN,ROTOR,BELL,DROP,CLICK,SAW],
            bass:[...BN.map(n=>SUB[n]),...BN.map(n=>REE[n]),GROWL,KSUB],
            tex:[ENG,SEA] };
for(const n of ['perc','bass','tex']){
  await bat(Array.from({length:64},(_,i)=>['pad',i,{mute:!grp[n].includes(i)}]));
  const r=await call('render',{src:'pat',loops:1});
  console.log('   '+n.padEnd(5)+' peak '+(20*Math.log10(Math.max(r.peak,1e-6))).toFixed(1).padStart(6)
    +' dB   rms '+(20*Math.log10(Math.max(r.rms,1e-6))).toFixed(1).padStart(6)+' dB'); }
await bat(Array.from({length:64},(_,i)=>['pad',i,{mute:false}]));
await call('set',{pattern:0, songOn:true});
const sch=await call('schedule',{src:'song',full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s · stretched '+JSON.stringify(sch.stretched));
let best=null;
for(const [trim,amt] of [[-9,0.10],[-6,0.13],[-3,0.16],[0,0.20]]){
  await call('set',{mTrim:trim, compAmt:amt});
  const m=await call('render',{src:'song',loops:1,loudness:true});
  console.log('   trim '+trim+' comp '+amt+' → '+m.lufs.toFixed(1)+' LUFS  tp '
    +m.truePeakDb.toFixed(2)+'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
  const miss=Math.abs(m.lufs+12.5);
  if(!m.clipping && m.truePeakDb<=-1.0 && m.crestDb>=10 && (!best||miss<best.miss))
    best={trim,amt,miss,m}; }
if(!best) throw new Error('nothing cleared both the ceiling and the crest floor');
console.log('   chosen trim '+best.trim+' → '+best.m.lufs.toFixed(1)+' LUFS, crest '+best.m.crestDb.toFixed(1));
await call('set',{mTrim:best.trim, compAmt:best.amt});
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'subsidence.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
