/* WEATHERING — A aeolian, 88bpm. Almost nothing in it is an instrument.

   The previous attempt reached for a sampled glockenspiel and hit the
   wall that sampling always ends at: that pack holds only G, C and Ab,
   seven semitones apart, so a five-note theme in A aeolian came back
   with notes dragged five semitones off their roots and schedule() said
   so. The reflex was to find a better-sampled instrument.

   The better answer is not to use one. A PAINTED sound has no coverage
   problem at all — no gaps, no stretching, no octave convention to get
   wrong, no 28dB spread in the level it arrives at. Every class of bug
   that has cost this session time is a property of recorded samples and
   simply does not exist for a sound synthesised from its own spectrum.

   So the lead voice here is twelve painted bells, one per scale degree
   from A3 to E5, each with partials at 1 : 2 : 2.73 : 4.39 : 7.12 —
   bell ratios, which are not harmonics and which no filter can impose
   on an oscillator. Zero transposition anywhere, by construction.

   WHAT ELSE IS MADE RATHER THAN LOADED:

   The drone is painted with GLIDING partials. Each one drifts a few
   cents over four seconds, in different directions, so the sound
   detunes against itself and never settles. A sample cannot do that;
   it can only be detuned as a whole.

   The air is painted from a grid of noise — forty rows of random
   levels high in the spectrum, which resynthesises as a shimmer that
   evolves rather than loops, because no two columns are the same.

   And the rust is the painted bell rebuilt through FIELD RECORDINGS:
   fire, rain, sea and a creaking door, chopped into blocks and
   reassembled into the bell's shape. A bell made of weather. That is
   the one that could not be made any other way — not by synthesis,
   because the grain is real, and not by sampling, because nothing was
   ever recorded that sounds like it.

   Percussion is a door knock, a water drop, keys and a can — real
   objects, CC0, from ESC-50.

   Two recorded instruments survive, and only where they earn it: the
   vibraphone for a struck grain that synthesis does badly, and the
   hand chimes because they ring for six seconds, which is what lets a
   piece this slow leave gaps without reverb pretending for it.

   Tempo, length and loudness follow the measurements rather than habit:
   88bpm and three minutes against the reflexive 130-170 and under two,
   and -15.5 LUFS against the -11.5 that every previous bounce aimed at
   regardless of what the music was. */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=88, TARGET_LUFS=-15.5;
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

/* ---- THE PAINTED BELL: TWELVE NOTES, NO GAPS -------------------------- */
const SCALE=[57,59,60,62,64,65,67,69,71,72,74,76];      // A aeolian, A3..E5
const BELLP=[];
for(let i=0;i<SCALE.length;i++){
  const pad=i, hz=440*Math.pow(2,(SCALE[i]-69)/12);
  await call('paint',{pad, midi:SCALE[i], seconds:3.6, name:'bell '+SCALE[i], seed:1000+i,
    partials:[
      {hz:hz,       level:1.00, at:0.00, dur:1.00},
      {hz:hz*2,     level:0.46, at:0.00, dur:0.78},
      {hz:hz*2.73,  level:0.36, at:0.01, dur:0.52},
      {hz:hz*4.39,  level:0.24, at:0.02, dur:0.34},
      {hz:hz*7.12,  level:0.13, at:0.03, dur:0.19}]});
  BELLP.push(pad);
}
console.log('painted bell: '+BELLP.length+' notes, '+SCALE[0]+'-'+SCALE[SCALE.length-1]+', no transposition possible');

/* ---- A DRONE THAT WILL NOT SETTLE -------------------------------------
   every partial glides somewhere slightly different, so it beats
   against itself. A sample can only be detuned as a whole. */
const DRONE=12;
await call('paint',{pad:DRONE, seconds:7.5, name:'drift drone', midi:45, seed:77,
  partials:[
    {hz:110,   toHz:110.4, level:0.90, at:0, dur:1.00},
    {hz:164.8, toHz:164.2, level:0.62, at:0, dur:1.00},
    {hz:220.6, toHz:219.7, level:0.50, at:0, dur:0.95},
    {hz:329.2, toHz:330.5, level:0.34, at:0, dur:0.88},
    {hz:441.8, toHz:440.3, level:0.22, at:0, dur:0.80},
    {hz:659.0, toHz:661.4, level:0.14, at:0, dur:0.66}]});

/* ---- AIR, PAINTED AS NOISE --------------------------------------------
   forty rows of random level high in the spectrum: it shimmers and
   never repeats, because no two columns are the same. */
const AIR=13;
{
  let s=20250101; const rnd=()=>{ s^=s<<13; s^=s>>>17; s^=s<<5; return ((s>>>0)/4294967296); };
  const R=40, C=48, rows=[];
  for(let r=0;r<R;r++){
    const row=[]; const bias=0.25+0.75*(r/(R-1));        // brighter rows louder
    for(let c=0;c<C;c++){
      const swell=Math.sin(Math.PI*c/(C-1));
      row.push(Math.max(0, (rnd()*0.9) * bias * swell));
    }
    rows.push(row);
  }
  await call('paint',{pad:AIR, seconds:5.0, lo:900, hi:15000, rows, name:'painted air', seed:5});
}

/* ---- A BELL MADE OF WEATHER -------------------------------------------
   the painted bell rebuilt out of fire, rain, sea and a creaking door.
   Stickiness is low here on purpose: on a sustained target the
   successor block is always "close enough", so at the default it ran
   straight through one recording and used 99 of 100 blocks from a
   single pad. Sustained material needs it almost off. */
const FK=[20,21,22,23];
await call('pack','samples/foundkit.json');
for(const [pd,id] of [[20,'fk:fire'],[21,'fk:rain'],[22,'fk:drone'],[23,'fk:can']])
  await call('sound', id, pd);
await call('pack','samples/darkkit.json');
const DK=[24,25];
for(const [pd,id] of [[24,'dk:sea'],[25,'dk:creak']]) await call('sound', id, pd);
const RUST=14;
const rust=await call('resynth',{target:BELLP[4], brain:[...FK,...DK], pad:RUST,
  blockMs:70, stickiness:0.06, novelty:0.55, boredom:0.3, name:'bell of weather'});
console.log('rust        : '+rust.says.slice(0,120));

/* ---- THE TWO RECORDED INSTRUMENTS THAT EARN THEIR PLACE ---------------- */
const MAL='samples/vcsl-mallets.json';
await call('instrument','vib',{pack:MAL, match:'^vc:vibh-',   lo:57, hi:84, max:8});
await call('instrument','hch',{pack:MAL, match:'^vc:hchime-', lo:60, hi:86, max:7});
const P=(n)=>call('instPads',n).then(l=>l.map(x=>x.pad));
const VIB=await P('vib'), HCH=await P('hch');

/* percussion: real objects */
await call('pack','samples/foundkit.json');
const KNOCK=48, DROP=49, KEYS=50, GLASSY=51;
for(const [pd,id] of [[KNOCK,'fk:kick'],[DROP,'fk:hat'],[KEYS,'fk:type'],[GLASSY,'fk:snare']])
  await call('sound', id, pd);

/* bass: three layers, because a sine has weight and no pitch */
const KSB=52, SUBN=[33,35,36,38];
const SUB=[53,54,55,56], BAS=[57,58,59,60];
await call('preset','bsub',KSB,21);
for(let i=0;i<SUBN.length;i++){
  await call('preset','bsub',SUB[i],SUBN[i]);
  await call('preset','bsub',BAS[i],SUBN[i]+12);
}
console.log('players     : 12 painted bells · drone · air · rust · vib '+VIB.length+' · hch '+HCH.length+' · 4 found objects');

/* ---- LEVELS ------------------------------------------------------------
   The painted sounds all arrive at the same peak because paint()
   normalises them, which is the other quiet advantage of making a
   sound rather than finding one: no staging correction is needed at
   all. The recorded things still need theirs, from the atlas. */
await bat([
  ...BELLP.map(p=>['pad',p,{inst:'bell', att:0.001, dec:3.4, sus:0.16, rel:1.5,
    ftype:'lowpass', fcut:0.94, gain:0.80, pan:-0.10, rev:0.40}]),
  ['pad',DRONE,{inst:'drone', att:0.40, dec:8.0, sus:0.70, rel:4.0,
    ftype:'lowpass', fcut:0.52, gain:0.50, pan:0.08, rev:0.52}],
  ['pad',AIR,  {inst:'air', att:0.30, dec:5.0, sus:0.50, rel:2.5,
    ftype:'highpass', fcut:0.20, gain:0.62, pan:0.26, rev:0.48}],
  ['pad',RUST, {inst:'rust', att:0.02, dec:4.0, sus:0.30, rel:2.2,
    ftype:'lowpass', fcut:0.80, gain:0.74, pan:-0.24, rev:0.56}],
  ...VIB.map(p=>['pad',p,{inst:'vib', att:0.001, dec:4.0, sus:0.20, rel:1.5,
    ftype:'lowpass', fcut:0.95, gain:0.95, pan:0.14, rev:0.34, eqMid:3}]),
  ...HCH.map(p=>['pad',p,{inst:'hch', att:0.03, dec:7.0, sus:0.45, rel:3.0,
    ftype:'lowpass', fcut:0.88, gain:1.40, pan:-0.30, rev:0.52, eqMid:3}]),
  /* found objects, staged from their own peaks */
  ['pad',KNOCK, {inst:'perc', att:0.001, dec:0.55, sus:0, rel:0.30, pitch:-5,
    ftype:'lowpass', fcut:0.40, drv:0.26, gain:1.30, pan:0, rev:0.14}],
  ['pad',DROP,  {inst:'perc', att:0.001, dec:0.35, sus:0, rel:0.22, pitch:3,
    gain:1.10, pan:0.30, rev:0.34, eqHi:5, vary:0.22}],
  ['pad',KEYS,  {inst:'perc', att:0.001, dec:0.40, sus:0, rel:0.25, pitch:-2,
    gain:0.85, pan:-0.26, rev:0.30, eqHi:4, vary:0.30}],
  ['pad',GLASSY,{inst:'perc', att:0.001, dec:1.1, sus:0, rel:0.70, pitch:-4,
    ftype:'bandpass', fcut:0.62, fres:1.4, gain:0.95, pan:0.18, rev:0.46, vary:0.18}],
  ['pad',KSB,{inst:'pulse', att:0.002, dec:0.42, sus:0, rel:0.24,
    ftype:'lowpass', fcut:0.10, gain:0.50, pan:0, rev:0}],
  ...SUB.map(p=>['pad',p,{inst:'bass', att:0.006, dec:3.2, sus:0.55, rel:0.80,
    ftype:'lowpass', fcut:0.13, drv:0.08, gain:0.26, pan:0, rev:0.05}]),
  ...BAS.map(p=>['pad',p,{inst:'bass', att:0.004, dec:2.4, sus:0.40, rel:0.60,
    ftype:'lowpass', fcut:0.44, fres:1.0, drv:0.58, crush:12,
    gain:0.24, pan:0, rev:0.12, eqLo:-4, eqMid:2}]),
]);

await call('set',{bpm:BPM, swing:0, human:0.024, humanDrift:0.14,
  revType:'hall', revSize:2.6, revLvl:0.42, dlyMode:'digital', delayFb:0.28, dlyTone:6400,
  compAmt:0.12, mWidth:1.12, mMono:90, mCeil:-3.0, mAir:3.0, mMud:0, mEqMid:1,
  scOn:false, masterVol:1.0, mTrim:0});

/* ---- THE SUBJECT ------------------------------------------------------- */
const SC=[0,2,3,5,7,8,10];
const deg=(base,d)=>{ const o=Math.floor(d/7), k=((d%7)+7)%7; return base+12*o+SC[k]; };
const FIG=[0,3,2,5,4], FIG_R=[0,6,10,16,24];
const B=(bar,st)=>bar*16+st;
const say=(bar,base,{t=0, inv=false, aug=1, only=5, vel=0.70, inst='bell', at=0}={})=>{
  const o=[];
  for(let i=0;i<Math.min(only,FIG.length);i++){
    const d=(inv? -FIG[i] : FIG[i]) + t;
    const abs=B(bar,0)+at+Math.round(FIG_R[i]*aug);
    if(abs>=64) break;
    o.push(['note', inst, deg(base,d), abs, vel, {beats:(aug>1?2.6:1.8)}]);
  }
  return o;
};
const pulseBar=(bar,{half=false, air=1}={})=>{
  const o=[];
  for(let b=0;b<4;b++){
    if(half && b%2===1) continue;
    const v=b===0?0.94:0.82;
    o.push(['step',KNOCK,B(bar,b*4),v], ['step',KSB,B(bar,b*4),v*0.88]);
  }
  if(air>0) for(let st=4;st<16;st+=8) o.push(['step',DROP,B(bar,st),0.58]);
  if(air>1) for(let st=2;st<16;st+=4) o.push(['step',KEYS,B(bar,st),0.40]);
  return o;
};
const bassBar=(bar,i)=>{
  const n=[0,0,3,2][i%4]%SUB.length;
  const o=[['step',SUB[n],B(bar,0),0.82], ['step',BAS[n],B(bar,0),0.82]];
  if(i%4===3) o.push(['step',SUB[1],B(bar,8),0.56], ['step',BAS[1],B(bar,8),0.56]);
  return o;
};
const mk=async(slot,fn)=>{ await call('pattern',slot,{plen:64,clear:true});
  await call('set',{pattern:slot}); await bat(fn()); };

/* 0 — weather only: the drone drifting, the painted air, the rust */
await mk(0,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    if(bar===0) o.push(['step',DRONE,B(bar,0),0.70], ['step',AIR,B(bar,0),0.56]);
    if(bar===2) o.push(['step',RUST,B(bar,4),0.60], ['step',AIR,B(bar,8),0.48]);
    o.push(['step',GLASSY,B(bar,bar%2?12:6),0.40]);
  }
  return o; });

/* 1 — the subject on painted bells, bass underneath */
await mk(1,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar));
    if(bar===0) o.push(['step',DRONE,B(bar,0),0.56]);
    if(bar%2===0) o.push(...say(bar,57,{vel:0.68}));
    o.push(['note','hch',deg(69,[0,2][bar%2]),B(bar,0),0.38,{beats:7}]);
    for(let st=4;st<16;st+=8) o.push(['step',DROP,B(bar,st),0.44]);
  }
  return o; });

/* 2 — the vibraphone answers half a bar later: shared material,
       separate motion, and not in octaves */
await mk(2,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar), ...pulseBar(bar,{air:1}));
    if(bar%2===0){ o.push(...say(bar,57,{vel:0.70}));
      o.push(...say(bar,69,{at:8, only:3, vel:0.52, inst:'vib'})); }
    o.push(['note','hch',deg(69,[0,4][bar%2]),B(bar,0),0.36,{beats:7}]);
  }
  return o; });

/* 3 — up a third, the rust underneath, the air lifting */
await mk(3,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar+2), ...pulseBar(bar,{air:2}));
    if(bar%2===0){ o.push(...say(bar,57,{t:2, vel:0.70}));
      o.push(...say(bar,69,{at:8, t:2, only:3, vel:0.50, inst:'vib'})); }
    if(bar===0) o.push(['step',RUST,B(bar,0),0.56], ['step',AIR,B(bar,8),0.44]);
  }
  return o; });

/* 4 — inverted */
await mk(4,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar+1), ...pulseBar(bar,{air:2}));
    if(bar%2===0) o.push(...say(bar,69,{inv:true, vel:0.66}));
    o.push(['note','hch',deg(69,[0,3,5,4][bar]),B(bar,0),0.40,{beats:7}]);
    if(bar===2) o.push(['step',GLASSY,B(bar,10),0.52]);
  }
  return o; });

/* 5 — THE OPEN SECTION: weather and long decays, no pulse */
await mk(5,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(['note','hch',deg(69,[0,2,4,3][bar]),B(bar,0),0.52,{beats:7.6}]);
    if(bar===0) o.push(['step',DRONE,B(bar,0),0.66], ['step',AIR,B(bar,0),0.52]);
    if(bar===2) o.push(['step',RUST,B(bar,0),0.62]);
    o.push(...say(bar,57,{only:2, aug:1, vel:0.46, at:bar%2?8:0}));
    o.push(['step',GLASSY,B(bar,12),0.38]);
    if(bar===3) o.push(['step',KNOCK,B(bar,12),0.68], ['step',KSB,B(bar,12),0.62]);
  }
  return o; });

/* 6 — the open section with the pulse walking back in */
await mk(6,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(['note','hch',deg(69,[0,2,5,4][bar]),B(bar,0),0.46,{beats:7.6}]);
    if(bar>=1) o.push(['step',KNOCK,B(bar,0),0.88], ['step',KSB,B(bar,0),0.82]);
    if(bar>=2) o.push(['step',KNOCK,B(bar,8),0.82], ['step',KSB,B(bar,8),0.76]);
    if(bar>=3) for(let b=0;b<4;b++) o.push(['step',KNOCK,B(bar,b*4),b?0.82:0.90],
      ['step',KSB,B(bar,b*4),b?0.76:0.84]);
    o.push(...bassBar(bar,bar));
    if(bar%2===0) o.push(...say(bar,57,{only:4, vel:0.64}));
    for(let st=4;st<16;st+=8) o.push(['step',DROP,B(bar,st),0.40+0.04*bar]);
  }
  return o; });

/* 7 — thinning to the fragment, and the weather returning */
await mk(7,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    if(bar<2) o.push(...pulseBar(bar,{half:bar===1, air:1}));
    o.push(...bassBar(bar,bar));
    if(bar%2===0) o.push(...say(bar,57,{only:bar<2?3:2, vel:0.60-0.10*bar}));
    if(bar===2) o.push(['step',DRONE,B(bar,0),0.56], ['step',AIR,B(bar,4),0.46]);
    if(bar===3) o.push(['step',RUST,B(bar,0),0.52]);
  }
  return o; });

for(let i=0;i<8;i++) await call('automate','mfilt',[[0,1.0]],{pattern:i});
await call('automate','mfilt',[[0,0.78],[48,0.96],[63,1.0]],{pattern:0});
await call('automate','mfilt',[[0,1.0],[40,0.95],[63,0.92]],{pattern:5});
await call('automate','mvol',[[0,0.56],[63,0.72]],{pattern:0});
for(const [p,v] of [[1,0.80],[2,0.88],[3,0.90],[4,0.94],[7,0.74]])
  await call('automate','mvol',[[0,v]],{pattern:p});
await call('automate','mvol',[[0,0.70],[63,0.68]],{pattern:5});
await call('automate','mvol',[[0,0.72],[63,0.92]],{pattern:6});

await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:0,reps:1},{pat:1,reps:1},{pat:2,reps:1},{pat:3,reps:1},
        {pat:2,reps:1},{pat:4,reps:1},
        {pat:5,reps:1},{pat:6,reps:1},
        {pat:3,reps:1},{pat:4,reps:1},
        {pat:5,reps:1},{pat:6,reps:1},
        {pat:2,reps:1},{pat:7,reps:1},{pat:0,reps:1}]});

/* ---- EVERY CHECK ------------------------------------------------------- */
const sch=await call('schedule',{src:'song',full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')
  +') · stretched '+JSON.stringify(sch.stretched));

const rv=await call('review',{src:'song'});
console.log('\nREVIEW — '+rv.says);
for(const f of rv.findings.slice(0,12)) console.log('  ['+f.severity+'] '+f.says.slice(0,104));
for(const k of rv.skipped) console.log('  could not run: '+k);
const tr=await call('translate',{src:'song'});
console.log('\nsmall speaker: '+tr.says.slice(0,130));
const pu=await call('pulse',{src:'song'});
console.log('pulse: autocorr '+pu.pulseStrength+'  beat '+pu.onGrid.beat+'%  buried-by '+pu.beatBuriedBy);

/* ---- LEVEL, IN TWO RENDERS -------------------------------------------- */
await call('set',{mTrim:-12, compAmt:0.12});
const probe=await call('render',{src:'song',loops:1,loudness:true});
const trim=Math.max(-24, Math.min(12, -12 + (TARGET_LUFS - probe.lufs)));
console.log('\nprobe at -12 → '+probe.lufs.toFixed(1)+' LUFS, crest '+probe.crestDb.toFixed(1)
  +' → trim '+trim.toFixed(1)+' for '+TARGET_LUFS);
await call('set',{mTrim:+trim.toFixed(1)});
const m=await call('render',{src:'song',loops:1,loudness:true});
console.log('   '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
  +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'weathering.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
