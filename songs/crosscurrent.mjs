/* CROSSCURRENT — A aeolian, 92bpm. Every lesson of the session in one
   piece, including the one that was sitting unused the whole time.

   THE THING THAT WAS ALWAYS THERE. poly() gives a pad its own BPM, and
   the test suite has proved since long before this session that it
   produces real cross-rhythm — three and five to the beat inside one
   bar. Six tracks were written here before anyone reached for it, every
   one of them on a single sixteen-step grid at a single tempo. At 92
   the main grid, a poly pad at 276 runs three against four and one at
   460 runs five against four, and nothing else in this app can make
   that happen. It is the centre of this piece rather than an ornament.

   WHAT EVERY OTHER PART OF IT IS FOR:

   paint() — twelve bells, one per scale degree, partials at bell ratios
   rather than harmonics. A painted instrument has no pitch gaps, so
   schedule() reports no transposition anywhere, by construction. The
   sampled glockenspiel this replaces could only play G, C and Ab.

   freeze() — a tin can and a church bell, each held at one instant and
   sustained. Neither is looping: there is no repetition in them at all,
   only what that moment was made of. A can became a four-second pad.

   tape() — the painted bells run to tape, because everything this app
   makes is otherwise perfectly in tune for the whole length of a note
   and nothing ever recorded was. Wow sags the pitch, flutter roughens
   it, drift wanders off and does not come back.

   mutate() — the found percussion evolved rather than chosen: variations
   measured against the original, the winner kept.

   resynth() — the painted bell rebuilt through fire, rain and sea, with
   stickiness low because on sustained material the default runs
   straight through one recording.

   AND THE REST IS THE LIST OF THINGS THAT WENT WRONG BEFORE. Levels
   staged from the atlas's measured peaks rather than by ear. Three bass
   layers, because a sine has weight and no pitch on a small speaker.
   The loudest things on the beat and never nudged. A subject stated
   and then developed — transposed, inverted, answered half a bar later
   rather than doubled in octaves, which measured as 28.7% parallel last
   time. Every pattern stating its own master filter value, because a
   lane left in one is inherited by all the rest. And 92bpm at three
   minutes and -15 LUFS, because the catalogue that prompted all this
   spans sixteen decibels and there is no single right loudness. */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=92, TARGET_LUFS=-15.0;
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

/* ---- 1. TWELVE PAINTED BELLS, GAPLESS ---------------------------------- */
const SCALE=[57,59,60,62,64,65,67,69,71,72,74,76];
for(let i=0;i<SCALE.length;i++){
  const hz=440*Math.pow(2,(SCALE[i]-69)/12);
  await call('paint',{pad:i, midi:SCALE[i], seconds:3.4, name:'bell '+SCALE[i], seed:600+i,
    partials:[
      {hz:hz,      level:1.00, at:0.00, dur:1.00},
      {hz:hz*2,    level:0.44, at:0.00, dur:0.76},
      {hz:hz*2.73, level:0.34, at:0.01, dur:0.50},
      {hz:hz*4.39, level:0.22, at:0.02, dur:0.32},
      {hz:hz*7.12, level:0.12, at:0.03, dur:0.18}]});
}
/* a drone whose partials each drift somewhere different */
await call('paint',{pad:12, seconds:8, name:'drift', midi:45, seed:31,
  partials:[
    {hz:110,   toHz:110.5, level:0.90, at:0, dur:1},
    {hz:164.8, toHz:164.1, level:0.60, at:0, dur:1},
    {hz:220.6, toHz:219.6, level:0.48, at:0, dur:0.95},
    {hz:329.2, toHz:330.7, level:0.32, at:0, dur:0.86},
    {hz:441.8, toHz:440.1, level:0.20, at:0, dur:0.78}]});
/* air from a grid of noise */
{
  let s=713; const rnd=()=>{ s^=s<<13; s^=s>>>17; s^=s<<5; return ((s>>>0)/4294967296); };
  const R=40, C=48, rows=[];
  for(let r=0;r<R;r++){ const row=[], bias=0.25+0.75*(r/(R-1));
    for(let c=0;c<C;c++) row.push(Math.max(0,(rnd()*0.9)*bias*Math.sin(Math.PI*c/(C-1))));
    rows.push(row); }
  await call('paint',{pad:13, seconds:5, lo:900, hi:15000, rows, name:'air', seed:9});
}

/* ---- 2. THE TWO RECORDED INSTRUMENTS THAT EARN IT ---------------------
   called here, before anything else is placed by hand, because
   instrument() takes whichever pads are free and will walk over
   anything assigned to a fixed index later. */
const MAL='samples/vcsl-mallets.json';
await call('instrument','vib',{pack:MAL, match:'^vc:vibh-',   lo:57, hi:84, max:6});
await call('instrument','hch',{pack:MAL, match:'^vc:hchime-', lo:60, hi:86, max:6});
const P=(n)=>call('instPads',n).then(l=>l.map(x=>x.pad));
const VIB=await P('vib'), HCH=await P('hch');

/* ---- 3. FOUND OBJECTS, FROZEN, TAPED AND MUTATED ----------------------- */
const FIRE=30, RAIN=31, SEA=32, CREAK=33, CAN=34, CHURCH=35;
await call('pack','samples/foundkit.json');
for(const [pd,id] of [[FIRE,'fk:fire'],[RAIN,'fk:rain'],[CAN,'fk:can'],[CHURCH,'fk:bell']])
  await call('sound', id, pd);
await call('pack','samples/darkkit.json');
for(const [pd,id] of [[SEA,'dk:sea'],[CREAK,'dk:creak']]) await call('sound', id, pd);

const RUST=36, FCAN=37, FBELL=38, TAPED=39;
const rust=await call('resynth',{target:4, brain:[FIRE,RAIN,SEA,CREAK], pad:RUST,
  blockMs:70, stickiness:0.06, novelty:0.55, boredom:0.3, name:'bell of weather'});
/* a tin can and a church bell, each held at one instant */
const fcan =await call('freeze',CAN,   {pad:FCAN,  at:0.20, seconds:5, shimmer:0.45, name:'held can'});
const fbell=await call('freeze',CHURCH,{pad:FBELL, at:0.30, seconds:6, shimmer:0.30, name:'held church'});
/* and one painted bell run to tape, so something in here is out of tune */
const taped=await call('tape',4,{pad:TAPED, wow:22, wowHz:0.9, flutter:5, drift:14,
  sat:0.3, hiLossHz:9000, name:'bell on tape'});
console.log('rust  : '+rust.says.slice(0,96));
console.log('frozen: can '+fcan.partials+' partials '+fcan.lowest+'-'+fcan.highest+'Hz · church '
  +fbell.partials+' partials '+fbell.lowest+'-'+fbell.highest+'Hz');
console.log('tape  : '+taped.says.slice(0,96));

/* percussion, one of which is evolved rather than chosen */
const KNOCK=40, DROP=41, KEYS=42, GLASSY=43;
await call('pack','samples/foundkit.json');
for(const [pd,id] of [[KNOCK,'fk:kick'],[DROP,'fk:hat'],[KEYS,'fk:type'],[GLASSY,'fk:snare']])
  await call('sound', id, pd);
await call('pattern',0,{plen:16,clear:true});
await bat([['step',GLASSY,0,0.9],['step',GLASSY,8,0.9]]);
const mut=await call('mutate',GLASSY,{want:'different', population:5, generations:3,
  amount:0.45, keep:true, seed:4});
console.log('mutate: '+mut.says.slice(0,110));

/* bass, three layers */
const KSB=50, SUBN=[33,35,36,38];
const SUB=[51,52,53,54], BAS=[55,56,57,58];
await call('preset','bsub',KSB,21);
for(let i=0;i<SUBN.length;i++){
  await call('preset','bsub',SUB[i],SUBN[i]);
  await call('preset','bsub',BAS[i],SUBN[i]+12);
}

/* ---- 4. LEVELS, FROM MEASURED PEAKS ------------------------------------ */
await bat([
  ...Array.from({length:12},(_,i)=>['pad',i,{inst:'bell', att:0.001, dec:3.2, sus:0.16, rel:1.4,
    ftype:'lowpass', fcut:0.94, gain:0.80, pan:-0.10, rev:0.38}]),
  ['pad',12,{inst:'drone', att:0.5, dec:9, sus:0.72, rel:4.5,
    ftype:'lowpass', fcut:0.50, gain:0.46, pan:0.08, rev:0.52}],
  ['pad',13,{inst:'air', att:0.3, dec:5, sus:0.5, rel:2.5,
    ftype:'highpass', fcut:0.20, gain:0.60, pan:0.26, rev:0.46}],
  ['pad',RUST, {inst:'rust', att:0.02, dec:4, sus:0.30, rel:2.2,
    ftype:'lowpass', fcut:0.80, gain:0.70, pan:-0.24, rev:0.54}],
  ['pad',FCAN, {inst:'held', att:0.25, dec:6, sus:0.55, rel:3.0,
    ftype:'lowpass', fcut:0.76, gain:0.56, pan:0.22, rev:0.50}],
  ['pad',FBELL,{inst:'held', att:0.40, dec:7, sus:0.60, rel:3.5,
    ftype:'lowpass', fcut:0.68, gain:0.52, pan:-0.18, rev:0.56}],
  ['pad',TAPED,{inst:'tape', att:0.002, dec:3.4, sus:0.18, rel:1.6,
    ftype:'lowpass', fcut:0.86, gain:0.62, pan:0.16, rev:0.44}],
  ...VIB.map(p=>['pad',p,{inst:'vib', att:0.001, dec:3.8, sus:0.20, rel:1.5,
    ftype:'lowpass', fcut:0.95, gain:0.92, pan:0.14, rev:0.32, eqMid:3}]),
  ...HCH.map(p=>['pad',p,{inst:'hch', att:0.03, dec:7, sus:0.45, rel:3,
    ftype:'lowpass', fcut:0.88, gain:1.35, pan:-0.30, rev:0.50, eqMid:3}]),
  ['pad',KNOCK, {inst:'perc', att:0.001, dec:0.55, sus:0, rel:0.30, pitch:-5,
    ftype:'lowpass', fcut:0.40, drv:0.26, gain:1.25, pan:0, rev:0.14}],
  ['pad',DROP,  {inst:'perc', att:0.001, dec:0.32, sus:0, rel:0.20, pitch:4,
    gain:1.00, pan:0.30, rev:0.32, eqHi:5, vary:0.26}],
  ['pad',KEYS,  {inst:'perc', att:0.001, dec:0.38, sus:0, rel:0.24, pitch:-2,
    gain:0.80, pan:-0.26, rev:0.28, eqHi:4, vary:0.32}],
  ['pad',KSB,{inst:'pulse', att:0.002, dec:0.42, sus:0, rel:0.24,
    ftype:'lowpass', fcut:0.10, gain:0.50, pan:0, rev:0}],
  ...SUB.map(p=>['pad',p,{inst:'bass', att:0.006, dec:3.0, sus:0.55, rel:0.80,
    ftype:'lowpass', fcut:0.13, drv:0.08, gain:0.26, pan:0, rev:0.05}]),
  ...BAS.map(p=>['pad',p,{inst:'bass', att:0.004, dec:2.2, sus:0.40, rel:0.60,
    ftype:'lowpass', fcut:0.44, fres:1.0, drv:0.58, crush:12,
    gain:0.24, pan:0, rev:0.12, eqLo:-4, eqMid:2}]),
]);
await call('set',{bpm:BPM, swing:0, human:0.022, humanDrift:0.13,
  revType:'hall', revSize:2.5, revLvl:0.40, dlyMode:'digital', delayFb:0.26, dlyTone:6600,
  compAmt:0.12, mWidth:1.12, mMono:90, mCeil:-3.0, mAir:3.0, mMud:0, mEqMid:1,
  scOn:false, masterVol:1.0, mTrim:0});

/* ---- 5. THE SUBJECT ---------------------------------------------------- */
const SC=[0,2,3,5,7,8,10];
const deg=(base,d)=>{ const o=Math.floor(d/7), k=((d%7)+7)%7; return base+12*o+SC[k]; };
const FIG=[0,3,2,5,4], FIG_R=[0,6,10,16,24];
const B=(bar,st)=>bar*16+st;
const say=(bar,base,{t=0, inv=false, aug=1, only=5, vel=0.70, inst='bell', at=0}={})=>{
  const o=[];
  for(let i=0;i<Math.min(only,FIG.length);i++){
    const d=(inv?-FIG[i]:FIG[i])+t;
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
  if(air>0) for(let st=4;st<16;st+=8) o.push(['step',DROP,B(bar,st),0.54]);
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

/* ---- 6. THE CROSS-RHYTHM ----------------------------------------------
   This is the part nothing else here can do. At 92 on the main grid, a
   poly pad at 276 lays three against the four, and one at 460 lays
   five. They are deliberately given to QUIET parts — keys and a water
   drop — because the loudest things have to stay on the beat or the
   metre stops being findable, which pulse() measures and which an
   earlier track failed. */
const crossOn=async(slot)=>{
  await call('set',{pattern:slot});
  await call('poly',KEYS,{on:true, bpm:BPM*3, cells:3, trig:'step',
    row:[0.52,0.34,0.40]});
  await call('poly',DROP,{on:true, bpm:BPM*5, cells:5, trig:'step',
    row:[0.40,0,0.30,0.26,0]});
};

/* 0 — the held objects, the drone, no pulse */
await mk(0,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    if(bar===0) o.push(['step',12,B(bar,0),0.68], ['step',13,B(bar,0),0.52]);
    if(bar===1) o.push(['step',FBELL,B(bar,0),0.58]);
    if(bar===2) o.push(['step',FCAN,B(bar,4),0.54], ['step',RUST,B(bar,8),0.50]);
    o.push(['step',GLASSY,B(bar,bar%2?12:6),0.40]);
  }
  return o; });

/* 1 — the subject, bass under it */
await mk(1,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar));
    if(bar%2===0) o.push(...say(bar,57,{vel:0.68}));
    o.push(['note','hch',deg(69,[0,2][bar%2]),B(bar,0),0.36,{beats:7}]);
    if(bar===3) o.push(['step',FCAN,B(bar,8),0.44]);
  }
  return o; });

/* 2 — the pulse, and THREE AGAINST FOUR arrives underneath it */
await mk(2,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar), ...pulseBar(bar,{air:1}));
    if(bar%2===0){ o.push(...say(bar,57,{vel:0.70}));
      o.push(...say(bar,69,{at:8, only:3, vel:0.50, inst:'vib'})); }
  }
  return o; });
await crossOn(2);

/* 3 — up a third, both cross-rhythms running */
await mk(3,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar+2), ...pulseBar(bar,{air:1}));
    if(bar%2===0){ o.push(...say(bar,57,{t:2, vel:0.70}));
      o.push(...say(bar,69,{at:8, t:2, only:3, vel:0.48, inst:'vib'})); }
    if(bar===0) o.push(['step',RUST,B(bar,0),0.52]);
    if(bar===2) o.push(['step',TAPED,B(bar,8),0.54]);
  }
  return o; });
await crossOn(3);

/* 4 — inverted, the taped bell answering out of tune */
await mk(4,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar+1), ...pulseBar(bar,{air:1}));
    if(bar%2===0) o.push(...say(bar,69,{inv:true, vel:0.66}));
    if(bar%2===1) o.push(['step',TAPED,B(bar,4),0.48]);
    o.push(['note','hch',deg(69,[0,3,5,4][bar]),B(bar,0),0.38,{beats:7}]);
  }
  return o; });
await crossOn(4);

/* 5 — open: held objects and long decays, no pulse at all */
await mk(5,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(['note','hch',deg(69,[0,2,4,3][bar]),B(bar,0),0.50,{beats:7.6}]);
    if(bar===0) o.push(['step',FBELL,B(bar,0),0.60], ['step',13,B(bar,0),0.48]);
    if(bar===2) o.push(['step',FCAN,B(bar,0),0.56], ['step',RUST,B(bar,8),0.46]);
    o.push(...say(bar,57,{only:2, vel:0.44, at:bar%2?8:0}));
    if(bar===3) o.push(['step',KNOCK,B(bar,12),0.68], ['step',KSB,B(bar,12),0.62]);
  }
  return o; });

/* 6 — everything, with the pulse walking back in and five against four */
await mk(6,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(['note','hch',deg(69,[0,2,5,4][bar]),B(bar,0),0.44,{beats:7.6}]);
    if(bar>=1) o.push(['step',KNOCK,B(bar,0),0.90], ['step',KSB,B(bar,0),0.84]);
    if(bar>=2) o.push(['step',KNOCK,B(bar,8),0.84], ['step',KSB,B(bar,8),0.78]);
    if(bar>=3) for(let b=0;b<4;b++) o.push(['step',KNOCK,B(bar,b*4),b?0.84:0.92],
      ['step',KSB,B(bar,b*4),b?0.78:0.86]);
    o.push(...bassBar(bar,bar));
    if(bar%2===0) o.push(...say(bar,57,{only:4, vel:0.64}));
  }
  return o; });
await crossOn(6);

/* 7 — thinning out, the weather returning */
await mk(7,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    if(bar<2) o.push(...pulseBar(bar,{half:bar===1, air:1}));
    o.push(...bassBar(bar,bar));
    if(bar%2===0) o.push(...say(bar,57,{only:bar<2?3:2, vel:0.60-0.10*bar}));
    if(bar===2) o.push(['step',12,B(bar,0),0.54], ['step',FCAN,B(bar,4),0.44]);
    if(bar===3) o.push(['step',RUST,B(bar,0),0.48]);
  }
  return o; });

for(let i=0;i<8;i++) await call('automate','mfilt',[[0,1.0]],{pattern:i});
await call('automate','mfilt',[[0,0.80],[48,0.96],[63,1.0]],{pattern:0});
await call('automate','mfilt',[[0,1.0],[40,0.95],[63,0.92]],{pattern:5});
await call('automate','mvol',[[0,0.56],[63,0.72]],{pattern:0});
for(const [p,v] of [[1,0.80],[2,0.88],[3,0.90],[4,0.92],[7,0.74]])
  await call('automate','mvol',[[0,v]],{pattern:p});
await call('automate','mvol',[[0,0.70],[63,0.68]],{pattern:5});
await call('automate','mvol',[[0,0.72],[63,0.92]],{pattern:6});

await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:0,reps:1},{pat:1,reps:1},{pat:2,reps:1},{pat:3,reps:1},
        {pat:2,reps:1},{pat:4,reps:1},
        {pat:5,reps:1},{pat:6,reps:1},
        {pat:3,reps:1},{pat:4,reps:1},
        {pat:5,reps:1},{pat:6,reps:1},{pat:7,reps:1}]});

/* ---- 7. EVERY CHECK ---------------------------------------------------- */
const sch=await call('schedule',{src:'song',full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')
  +') · stretched '+JSON.stringify(sch.stretched));
const rv=await call('review',{src:'song'});
console.log('\nREVIEW — '+rv.says);
for(const f of rv.findings.slice(0,10)) console.log('  ['+f.severity+'] '+f.says.slice(0,100));
for(const k of rv.skipped) console.log('  could not run: '+k);
const pu=await call('pulse',{src:'song'});
console.log('\npulse: autocorr '+pu.pulseStrength+'  beat '+pu.onGrid.beat
  +'%  sixteenth '+pu.onGrid.sixteenth+'%  buried-by '+pu.beatBuriedBy);
const tr=await call('translate',{src:'song'});
console.log('small speaker: '+tr.says.slice(0,120));

/* ---- 8. LEVEL, TWO RENDERS -------------------------------------------- */
await call('set',{mTrim:-12, compAmt:0.12});
const probe=await call('render',{src:'song',loops:1,loudness:true});
const trim=Math.max(-24, Math.min(12, -12 + (TARGET_LUFS - probe.lufs)));
console.log('\nprobe -12 → '+probe.lufs.toFixed(1)+' LUFS crest '+probe.crestDb.toFixed(1)
  +' → trim '+trim.toFixed(1));
await call('set',{mTrim:+trim.toFixed(1)});
const m=await call('render',{src:'song',loops:1,loudness:true});
console.log('   '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
  +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'crosscurrent.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
