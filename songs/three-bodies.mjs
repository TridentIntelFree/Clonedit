/* THREE BODIES — contrapuntal, C dorian, 140bpm.

   Three voices that are actually three voices. Each runs on its own
   cycle length — 3, 5 and 8 steps — so they almost never change
   together, which is the whole mechanism: measured on Palestrina, 68%
   of moves between a pair of voices are OBLIQUE, one holding while the
   other goes somewhere. Everything written here before put every part
   on the same grid positions and read 0%.

   NOTHING IS CUT SHORT. Every previous track gated its percussion to
   between forty and four hundred milliseconds, which makes a grid of
   separate events rather than a room. Here the tails are long and
   deliberately overlap: the decay of one hit colours the attack of the
   next, which is where micro-timing and ambience actually come from.

   And the palette is built rather than borrowed — no field recordings
   this time. Synthesised sources put through resonant filters, grain
   clouds, reverse and crushing until they are their own instruments,
   with a common saturation and one shared space to tie them together. */
import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=140;
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

/* ---- BUILD THE INSTRUMENTS -------------------------------------------
   C dorian: C D Eb F G A Bb. Each voice gets its own pads, rendered at
   its own pitches so nothing is transposed far. */
const UPPER=[72,74,75,77,79,81,82];        // C5 D5 Eb5 F5 G5 A5 Bb5
const MIDDLE=[60,62,63,65,67,69,70];       // C4 ...
const LOWER=[36,38,39,41,43,45,46];        // C2 ...
const U={}, M={}, L={};
for(let i=0;i<UPPER.length;i++){ await call('preset','lpluck',i,UPPER[i]);  U[UPPER[i]]=i; }
for(let i=0;i<MIDDLE.length;i++){ await call('preset','kep',8+i,MIDDLE[i]); M[MIDDLE[i]]=8+i; }
for(let i=0;i<LOWER.length;i++){ await call('preset','bsub',16+i,LOWER[i]); L[LOWER[i]]=16+i; }
/* percussion, also synthesised and then taken somewhere else */
const TICK=24, SHELL=25, WASH=26, THUMP=27, GLASSY=28;
await call('preset','drim',TICK,60);
await call('preset','dcow',SHELL,67);
await call('preset','dshk',WASH,60);
await call('preset','dkick',THUMP,33);
await call('preset','dcong',GLASSY,72);
console.log('voices built: '+UPPER.length+' upper, '+MIDDLE.length+' middle, '+LOWER.length+' lower');

/* long tails everywhere, a common drive, one shared room */
await bat([
  ...UPPER.map(n=>['pad',U[n],{inst:'upper', att:0.002, dec:2.6, sus:0.22, rel:1.10,
    ftype:'bandpass', fcut:0.60, fres:1.3, drv:0.20, gain:0.40, pan:-0.22, rev:0.46,
    lfoOn:true, lfoTgt:'cutoff', lfoShape:'sine', lfoRate:0.19, lfoDepth:0.30}]),
  ...MIDDLE.map(n=>['pad',M[n],{inst:'middle', att:0.004, dec:3.4, sus:0.30, rel:1.40,
    ftype:'lowpass', fcut:0.46, fres:2.1, drv:0.26, crush:13, gain:0.34, pan:0.20, rev:0.42}]),
  ...LOWER.map(n=>['pad',L[n],{inst:'lower', att:0.006, dec:3.8, sus:0.52, rel:0.90,
    ftype:'lowpass', fcut:0.22, fres:0.9, drv:0.22, gain:0.30, pan:0, rev:0.14}]),
  /* a second, dirtier copy of the bass an octave up so the line carries */
  ['pad',TICK,  {inst:'perc', att:0.001, dec:0.9, sus:0, rel:0.55, pitch:5,
    ftype:'bandpass', fcut:0.66, fres:2.8, crush:9, gain:0.70, pan:0.32, rev:0.40, vary:0.22}],
  ['pad',SHELL, {inst:'perc', att:0.001, dec:1.6, sus:0, rel:0.90, pitch:-7,
    ftype:'bandpass', fcut:0.50, fres:3.4, crush:8, drv:0.34, gain:0.26, pan:-0.34, rev:0.52, vary:0.18}],
  ['pad',WASH,  {inst:'perc', mode:'grain', grSize:0.16, grDens:20, grSpread:0.30,
    grPitch:7, grBurst:1.4, pitch:-5, ftype:'highpass', fcut:0.34,
    gain:0.26, pan:0.08, rev:0.54}],
  ['pad',THUMP, {inst:'perc', att:0.001, dec:0.70, sus:0, rel:0.34, pitch:-3,
    ftype:'lowpass', fcut:0.26, drv:0.30, gain:0.42, pan:0, rev:0.12, vary:0.08}],
  ['pad',GLASSY,{inst:'perc', att:0.001, dec:2.2, sus:0, rel:1.30, pitch:12, reverse:true,
    ftype:'bandpass', fcut:0.72, fres:2.2, gain:1.05, pan:-0.12, rev:0.58, vary:0.24}],
]);
/* the glue: one room, moderate bus compression, a shared high shelf */
await call('set',{bpm:BPM, swing:0, human:0.055, humanDrift:0.34,
  revType:'hall', revSize:2.8, revLvl:0.56, dlyMode:'digital', delayFb:0.34, dlyTone:5600,
  compAmt:0.26, mWidth:1.14, mMono:110, mCeil:-3.0, mAir:1.8, mMud:-2.0, mEqMid:0,
  scOn:false, masterVol:1.0, mTrim:0});

/* ---- THE VOICES -------------------------------------------------------
   Each on its own cycle so they rarely land together. Lengths overlap
   the next entry on purpose — that is the bleed. */
const B=(bar,st)=>bar*16+st;
const SC=[0,2,3,5,7,9,10];                        // dorian degrees
const deg=(base,d)=>{ const o=Math.floor(d/7), k=((d%7)+7)%7; return base+12*o+SC[k]; };
let _s=31415926;
const rnd=()=>{ _s=(_s*1103515245+12345)&0x7fffffff; return _s/0x7fffffff; };

/* and they MEET at the bar line: 94% oblique on the first attempt was
   three unrelated lines, where the measured norm is 68% — real voices
   arrive together at cadences and that is what makes them one piece. */
const CADENCE=[0,16,32,48];
/* upper: moves on a 3-step cycle, so it is almost never with the others */
const upperLine=(bars,seed)=>{ const o=[]; let d=4;
  for(let st=0; st<bars*16; st+=3){
    if(rnd()<0.40){ continue; }                    // it rests, and the others carry
    const step=[-2,-1,-1,1,1,2,3][Math.floor(rnd()*7)];
    d=Math.max(0,Math.min(6,d+step));
    const m=deg(72,d);
    if(U[m]==null) continue;
    o.push(['step',U[m],st,0.40+0.30*rnd(),{len:(60/BPM)*(1.4+1.6*rnd())}]);
  }
  for(const c of CADENCE) if(c<bars*16 && rnd()<0.8){
    const m=deg(72,[0,2,4][Math.floor(rnd()*3)]);
    if(U[m]!=null) o.push(['step',U[m],c,0.52,{len:(60/BPM)*2.2}]); }
  return o; };
/* middle: a 5-step cycle, longer notes, often holding through two upper moves */
const middleLine=(bars)=>{ const o=[]; let d=2;
  for(let st=0; st<bars*16; st+=5){
    if(rnd()<0.34) continue;
    const step=[-2,-1,0,1,2][Math.floor(rnd()*5)];
    d=Math.max(0,Math.min(6,d+step));
    const m=deg(60,d);
    if(M[m]==null) continue;
    o.push(['step',M[m],st,0.42+0.26*rnd(),{len:(60/BPM)*(2.4+2.2*rnd())}]);
  }
  for(const c of CADENCE) if(c<bars*16 && rnd()<0.8){
    const m=deg(60,[0,2,4][Math.floor(rnd()*3)]);
    if(M[m]!=null) o.push(['step',M[m],c,0.50,{len:(60/BPM)*2.6}]); }
  return o; };
/* lower: an 8-step cycle, the slowest, mostly holding */
const lowerLine=(bars)=>{ const o=[]; let d=0;
  for(let st=0; st<bars*16; st+=8){
    if(rnd()<0.18) continue;
    const step=[-3,-2,0,0,2,3,4][Math.floor(rnd()*7)];
    d=Math.max(-1,Math.min(6,d+step));
    const m=deg(36,Math.max(0,d));
    if(L[m]==null) continue;
    o.push(['step',L[m],st,0.60+0.22*rnd(),{len:(60/BPM)*(3.0+3.0*rnd())}]);
  }
  return o; };
/* percussion: sparse, long-tailed, and nudged off the grid */
const percLine=(bars,d=1)=>{ const o=[];
  for(let bar=0;bar<bars;bar++){
    o.push(['step',THUMP,B(bar,0),0.86]);
    if(rnd()<0.55*d) o.push(['step',THUMP,B(bar,[6,9,11][Math.floor(rnd()*3)]),0.52]);
    o.push(['step',SHELL,B(bar,8),0.56,{nudge:(rnd()*2-1)*0.10}]);
    for(let st=0;st<16;st++){
      if(rnd()<0.16*d) o.push(['step',TICK,B(bar,st),0.24+0.26*rnd(),
        {nudge:(rnd()*2-1)*0.13, rat: rnd()<0.14?[2,3][Math.floor(rnd()*2)]:undefined}]);
      if(rnd()<0.07*d) o.push(['step',GLASSY,B(bar,st),0.26+0.20*rnd(),{nudge:(rnd()*2-1)*0.12}]);
    }
    if(rnd()<0.35*d) o.push(['step',WASH,B(bar,[2,7,12][Math.floor(rnd()*3)]),0.40]);
  }
  return o.map(r=>{ const lk=r[4]||{}; const c={};
    for(const k in lk) if(lk[k]!==undefined) c[k]=lk[k];
    return ['step',r[1],r[2],r[3],c]; }); };

const P=i=>call('set',{pattern:i});
for(let i=0;i<8;i++) await call('pattern',i,{plen:64,clear:true});
/* 0 — lower and middle only, finding each other */
await P(0); await bat(lowerLine(4)); await bat(middleLine(4));
await bat([['step',WASH,0,0.42],['step',WASH,B(2,4),0.36]]);
/* 1 — the upper voice enters */
await P(1); await bat(lowerLine(4)); await bat(middleLine(4)); await bat(upperLine(4));
await bat(percLine(4,0.5));
/* 2 — all three with the beat under them */
await P(2); await bat(lowerLine(4)); await bat(middleLine(4)); await bat(upperLine(4));
await bat(percLine(4,1.0));
/* 3 — denser */
await P(3); await bat(lowerLine(4)); await bat(middleLine(4)); await bat(upperLine(4));
await bat(percLine(4,1.5));
await bat([['automate','mfilt',[[0,0.64],[40,0.95],[63,0.76]]]]);
/* 4 — the voices alone again, no percussion, filter closing */
await P(4); await bat(lowerLine(4)); await bat(middleLine(4)); await bat(upperLine(4));
await bat([['automate','mfilt',[[0,0.90],[36,0.38],[63,0.62]]],
  ['automate','mvol',[[0,0.52],[40,0.34],[63,0.48]]]]);
/* 5 — the hardest the rhythm gets, voices still independent */
await P(5); await bat(lowerLine(4)); await bat(middleLine(4)); await bat(upperLine(4));
await bat(percLine(4,2.0));
await bat([['automate','mvol',[[0,0.64],[30,0.76],[63,0.80]]]]);
/* 6 — thinned, the middle voice carrying */
await P(6); await bat(lowerLine(4)); await bat(middleLine(4));
await bat(percLine(4,0.7));
/* 7 — out, long tails left to ring */
await P(7); await call('pattern',7,{plen:32,bpm:112});
await bat([['step',L[36],0,0.8,{len:4.0}],['step',M[63],B(0,6),0.6,{len:3.0}],
  ['step',U[79],B(1,0),0.5,{len:3.0}],['step',U[75],B(1,8),0.46,{len:4.0}],
  ['step',THUMP,0,0.8],['step',WASH,B(1,0),0.44],['step',GLASSY,B(1,10),0.34]]);
await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:0,reps:1},{pat:1,reps:1},{pat:2,reps:2},{pat:3,reps:2},
        {pat:4,reps:1},{pat:5,reps:2},{pat:6,reps:1},{pat:3,reps:1},{pat:7,reps:1}]});

/* ---- did it work? ----------------------------------------------------- */
await call('set',{pattern:3, songOn:false});
const cp=await call('counterpoint',['upper','middle','lower'],{src:'pat'});
console.log('\ncounterpoint (Palestrina: oblique 68.0 contrary 17.6 parallel 3.6):');
console.log('   oblique '+cp.motion.oblique+'%  contrary '+cp.motion.contrary
  +'%  similar '+cp.motion.similar+'%  parallel '+cp.motion.parallel
  +'%   5ths '+cp.motion.par5+'%  8ves '+cp.motion.par8+'%');
for(const f of cp.findings) console.log('   · '+f);
if(!cp.findings.length) console.log('   · '+cp.says);
const ld=await call('loudness',{src:'pat'});
console.log('\nperceived loudness: '+ld.says);
for(const r of ld.pads.slice(0,5)) console.log('   '+(r.name||('pad '+r.pad)).padEnd(14)
  +' '+String(r.lufs).padStart(6)+' LUFS   brightness '+r.brightness);
const tr=await call('translate',{src:'pat'});
console.log('\ntranslate: '+tr.says.slice(0,110));
const cr=await call('critique',{src:'pat'});
console.log('\ncritique:'); for(const f of cr.found) console.log('   ['+f.severity+'] '+f.says.slice(0,110));
if(!cr.found.length) console.log('   (nothing)');
await call('set',{pattern:0, songOn:true});
const sch=await call('schedule',{src:'song',full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s · stretched '+JSON.stringify(sch.stretched));
let best=null;
for(const [trim,amt] of [[-14,0.10],[-11,0.12],[-8,0.15],[-5,0.18]]){
  await call('set',{mTrim:trim, compAmt:amt});
  const m=await call('render',{src:'song',loops:1,loudness:true});
  console.log('   trim '+trim+' → '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
    +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
  const miss=Math.abs(m.lufs+12.5);
  if(!m.clipping && m.truePeakDb<=-1.0 && m.crestDb>=9 && (!best||miss<best.miss)) best={trim,amt,miss,m}; }
if(!best) throw new Error('nothing cleared the ceiling and crest floor');
console.log('   chosen trim '+best.trim+' → '+best.m.lufs.toFixed(1)+' LUFS, crest '+best.m.crestDb.toFixed(1));
await call('set',{mTrim:best.trim, compAmt:best.amt});
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'three-bodies.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
