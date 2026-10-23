/* MERIDIAN — ambient with a pulse. 84bpm, ~2:20, target -16.2 LUFS.
   ==================================================================

   THE BRIEF, WHICH IS THE PART THAT HAS ALWAYS BEEN MISSING.

   Every AI music generator is conditioned on a stated intent: a text
   prompt, genre tags, a length. Every song script in this repo has
   begun from "make a track" and discovered what it was afterwards.
   So this one states it first, and every number below is chosen
   against it rather than by taste:

     genre      ambient / downtempo, with an audible pulse
     tempo      84bpm
     length     about two and a half minutes
     loudness   -16.2 LUFS, crest ~16 — taken from the reference
     shape      mid-centred. Modest sub, rolled top.
     reference  samples/ref-ambient-hall.json

   WHY AMBIENT AND NOT SOMETHING WITH MORE IN IT. Because that profile
   is the only real reference this project has, and TENEMENT proved
   what happens without one: every pad owned its own band, place() said
   so, and the finished mix was still +18.6dB of sub against a 9dB
   midrange hole. A mix can pass every per-element check and be the
   wrong shape overall. Building to the genre we can actually measure
   is the point; other genres follow when there are profiles for them.

   WHAT THIS USES THAT NOTHING HERE HAS USED BEFORE.

   reference() + compare()  — TENEMENT's review printed "could not run:
     compare — no reference loaded" and it was logged as skipped. It
     was the check that mattered. It runs here.

   balance()  — refuses outright without instrument groups, so every
     pad is tagged with pad(i,{inst}). sound() does not tag pads, which
     silently disabled balance(), motif() and counterpoint() on every
     found-sound track written here.

   per-step nudge, from measured norms  — samples/groove-norms.json,
     derived from 1,150 human drum performances. The offsets are in
     fractions of a sixteenth and `nudge` takes exactly that unit, so
     they apply directly. Do not expect pulse() to show this: its grid
     tolerance is 53.6ms at this tempo and these offsets are 3-11ms,
     so it reads 100% either way — as it would for a human drummer.

   sidechain, bass-mono, slow LFO  — all three have been in the app the
     whole time and no track has used any of them.

   AND THE TRAP IT IS BUILT AROUND. TENEMENT split one train across a
   lowpass and a resonant bandpass; being the same recording they were
   time-aligned, but the filters' differing group delay made them
   cancel by 2.7dB where the skirts met. So the bass here is ONE
   painted sound carrying its own harmonics in 150-800Hz — the phone
   problem solved by construction rather than by a second layer that
   has to be phase-matched against the first. */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=84, TARGET_LUFS=-16.2;
const REF=JSON.parse(readFileSync(OUT+'samples/ref-ambient-hall.json','utf8'));
const GROOVE=JSON.parse(readFileSync(OUT+'samples/groove-norms.json','utf8'));

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
/* select, then write — and prove it took, because the opposite of this
   is three bounced tracks of silence */
const usePattern=async(n,props)=>{
  const r=await call('pattern',n,Object.assign({select:true},props||{}));
  if(r.warning) throw new Error('pattern '+n+': '+r.warning);
  if(r.selected!==true) throw new Error('pattern '+n+' did not become selected');
  return r; };
/* the exotic calls are flourishes, not structure: if one fails the
   track must still bounce, and the log must say which one went */
const tryTo=async(label,fn)=>{ try{ const r=await fn(); console.log('  + '+label+': '
  +String((r&&r.says)||'ok').slice(0,88)); return r; }
  catch(e){ console.log('  ! '+label+' FAILED: '+String(e.message||e).slice(0,100)); return null; } };

/* ---- MICRO-TIMING, FROM THE CORPUS ------------------------------------ */
/* rel.mean per metrical position, in fractions of a sixteenth, which is
   the unit `nudge` already takes. Strong positions push, the in-between
   sixteenths lag. A seeded wobble on top because a corpus mean applied
   to every hit identically is just a different grid. */
const R=GROOVE.relative_to_own_mean;
const SLOT=[R['beat (1/4)'].mean_frac16, R['e (1/16)'].mean_frac16,
            R['and (1/8)'].mean_frac16, R['a (1/16)'].mean_frac16];
let rs=0x5EED1;
const rnd=()=>{ rs^=rs<<13; rs^=rs>>>17; rs^=rs<<5; return ((rs>>>0)/4294967296); };
const groove=(step,spread=0.012)=>
  +(SLOT[step%4] + (rnd()*2-1)*spread).toFixed(4);
/* a step with human timing on it */
const g=(pad,step,vel,extra)=>['step',pad,step,vel,
  Object.assign({nudge:groove(step)}, extra||{})];

const CLIP=5.0;
const ONSET={'fk:knock2':0.14,'fk:rain':0.422,'fk:can':0.1,'dk:glass':0.128,'dk:creak':0.02};
const startOf=id=>+((ONSET[id]||0)/CLIP).toFixed(4);

const stage=async(pad,targetDb,label)=>{
  const cur=await call('pad',pad);
  const r=await call('render',{only:[pad], src:'pat', loops:1});
  const now=20*Math.log10(Math.max(r.peak,1e-6));
  const want=(cur.gain==null?1:cur.gain)*Math.pow(10,(targetDb-now)/20);
  const gg=Math.max(0.005,Math.min(2,want));
  await call('pad',pad,{gain:+gg.toFixed(3)});
  console.log('  stage '+label.padEnd(6)+' solo '+now.toFixed(1).padStart(6)
    +'dB -> '+String(targetDb).padStart(4)+'dB  gain '+gg.toFixed(2)
    +(want>2?'   CANNOT REACH — needs '+want.toFixed(1)+', cap 2. Wrong sound for the job.':''));
};
const placed=async(pad,label)=>{
  const r=await call('place',pad);
  const top=[...r.bands].sort((a,b)=>b.pad-a.pad).slice(0,3)
    .map(b=>b.band+' '+b.pad).join('  ');
  console.log('  place '+label.padEnd(6)+' owns '+String(r.owns||'NOTHING').padEnd(9)
    +'by '+String(r.ownsBy==null?'--':r.ownsBy).padStart(6)+'dB | loudest: '+top);
  if(r.findings.length) console.log('         '+r.findings[0].slice(0,110));
};

await call('clear');
await call('set',{bpm:BPM});
/* THE REFERENCE, BEFORE ANYTHING IS JUDGED. */
const ref=await call('reference',{shape:REF.shape, lufs:REF.lufs,
  crestDb:REF.crestDb, name:'ambient hall'});
console.log('reference loaded: '+(ref&&ref.name||'?')+'  '+REF.lufs+' LUFS, crest '+REF.crestDb);

const BASS=0, KICK=1, AIR=2, BELL=3, GHOST=4, PERC=5;
const PLEN=32;
await usePattern(0,{plen:PLEN, clear:true});

/* ---- 1. BASS — one painted sound, its own harmonics ------------------- */
/* 55Hz fundamental with partials deliberately placed through 150-800Hz,
   so a phone reproduces the harmonics and the ear supplies the octave
   it cannot hear. One sound, so nothing can cancel against it. */
{
  const f=55;
  await call('paint',{pad:BASS, midi:33, seconds:3.2, name:'bass', seed:11,
    partials:[
      {hz:f,     level:1.00, at:0, dur:1.00},
      {hz:f*2,   level:0.62, at:0, dur:0.92},
      {hz:f*3,   level:0.40, at:0, dur:0.80},   /* 165Hz — phone territory */
      {hz:f*4,   level:0.30, at:0, dur:0.70},
      {hz:f*6,   level:0.20, at:0, dur:0.55},   /* 330Hz */
      {hz:f*8,   level:0.13, at:0, dur:0.42},   /* 440Hz */
      {hz:f*11,  level:0.07, at:0, dur:0.30}]});/* 605Hz */
}
await call('pad',BASS,{inst:'bass', ftype:'lowpass', fcut:0.52, fres:0.5, drv:0.18,
  att:0.03, dec:1.6, sus:0.6, rel:0.9, gain:1.0, name:'bass'});
await bat([g(BASS,0,0.95), g(BASS,12,0.72), g(BASS,20,0.85)]);
console.log('\n1. BASS — painted, harmonics through 150-800Hz by construction');
await stage(BASS,-8,'bass'); await placed(BASS,'bass');

/* ---- 2. KICK — a door knock, transient-shaped ------------------------- */
/* sharp attack, short tail, so it cuts without needing high boost —
   and it is the sidechain trigger, so it takes an unducked path. */
await call('pack','samples/foundkit.json');
await call('sound','fk:knock2',KICK);
await call('pad',KICK,{inst:'drums', pitch:-4, start:startOf('fk:knock2'),
  ftype:'lowpass', fcut:0.58, drv:0.38,
  att:0.001, dec:0.24, sus:0.0, rel:0.10, gain:1.0, eqMid:+2, name:'kick'});
await bat([g(KICK,0,1.0), g(KICK,8,0.5), g(KICK,16,0.92), g(KICK,24,0.55)]);
console.log('\n2. KICK — door knock, sharp attack and no tail');
await stage(KICK,-5,'kick'); await placed(KICK,'kick');

/* ---- 3. AIR — rain frozen, with a slow filter drifting over it -------- */
/* 0.18Hz is a cycle every five and a half seconds: slower than the bar,
   so the texture never lines up with the music and never repeats. */
await call('sound','fk:rain',AIR);
await tryTo('freeze rain', ()=>call('freeze',AIR,{pad:AIR, at:0.55, seconds:8,
  partials:56, shimmer:9, name:'air'}));
await call('pad',AIR,{inst:'air', ftype:'lowpass', fcut:0.72, fres:1.1,
  lfoOn:true, lfoTgt:'cutoff', lfoShape:'sine', lfoRate:0.18, lfoDepth:0.55,
  att:1.4, dec:2.6, sus:0.85, rel:2.8, gain:1.0, eqLo:-9, rev:0.40, name:'air'});
await bat([['step',AIR,0,0.6],['step',AIR,16,0.45]]);
console.log('\n3. AIR — frozen rain under a 0.18Hz filter sweep');
await stage(AIR,-13,'air'); await placed(AIR,'air');

/* ---- 4. BELL — painted at real inharmonic ratios, then to tape -------- */
{
  const hz=293.66;  /* D4 */
  await call('paint',{pad:BELL, midi:62, seconds:4.0, name:'bell', seed:77,
    partials:[
      {hz:hz,      level:1.00, at:0.00, dur:1.00},
      {hz:hz*2.00, level:0.42, at:0.00, dur:0.72},
      {hz:hz*2.73, level:0.33, at:0.01, dur:0.52},
      {hz:hz*4.39, level:0.20, at:0.02, dur:0.34},
      {hz:hz*7.12, level:0.10, at:0.03, dur:0.20}]});
}
await tryTo('bell to tape', ()=>call('tape',BELL,{pad:BELL, wow:17, wowHz:0.6,
  flutter:5, flutterHz:6.1, drift:11, sat:0.3, hiLossHz:9000, name:'bell'}));
await call('pad',BELL,{inst:'lead', keepTime:true, att:0.004, dec:1.3, sus:0.3,
  rel:1.1, gain:1.0, eqLo:-7, rev:0.34, dly:0.22, name:'bell'});
const ROOT=62, LINE=[62,65,69,67,62,70,69,65];
await bat(LINE.map((n,k)=>g(BELL,k*4,k===0||k===5?0.88:0.6,{pitch:n-ROOT})));
console.log('\n4. BELL — painted at bell ratios, run to tape');
await stage(BELL,-11,'bell'); await placed(BELL,'bell');

/* ---- 5. GHOST — the bell rebuilt out of the found sounds -------------- */
/* the shape is the bell's, the substance is rain and glass and a can */
await call('pack','samples/darkkit.json');
await call('sound','dk:glass',6);
await call('pad',6,{start:startOf('dk:glass'), gain:0.5, name:'glass src'});
await tryTo('resynth bell through found sounds', ()=>call('resynth',
  {target:BELL, brain:[6,AIR], pad:GHOST, blockMs:70, stickiness:0.25,
   name:'ghost', seed:5}));
await call('pad',GHOST,{inst:'air', att:0.02, dec:1.6, sus:0.4, rel:1.4,
  gain:1.0, eqLo:-8, rev:0.42, name:'ghost'});
await bat([['step',GHOST,8,0.5],['step',GHOST,24,0.42]]);
console.log('\n5. GHOST — the bell rebuilt from glass and rain');
await stage(GHOST,-17,'ghost'); await placed(GHOST,'ghost');

/* ---- 6. PERC — a can, on its own clock -------------------------------- */
/* poly() gives the pad its own BPM: 126 against 84 is three against two,
   a real cross-rhythm rather than a figure written on the same grid. */
await call('pack','samples/foundkit.json');
await call('sound','fk:can',PERC);
await call('pad',PERC,{inst:'perc', pitch:3, start:startOf('fk:can'),
  ftype:'highpass', fcut:0.40, att:0.002, dec:0.30, sus:0.0, rel:0.12,
  gain:1.0, eqLo:-10, dly:0.26, rev:0.20, name:'can'});
await bat([2,10,18,26].map(s=>g(PERC,s,0.5)));
await tryTo('poly 126 against 84 (3:2)', ()=>call('poly',PERC,
  {bpm:126, cells:6, trig:true}));
console.log('\n6. PERC — a can at 126 against the grid at 84');
await stage(PERC,-18,'perc'); await placed(PERC,'perc');

/* ---- 7. THE THINGS NO TRACK HERE HAS EVER SWITCHED ON ----------------- */
/* bass-mono below 90Hz so the low end cannot drift off-centre, and the
   kick ducks everything else by a little — 0.35, not a pump. */
await call('set',{mMono:90, scOn:true, scTrig:KICK, scDepth:0.35, scRel:0.22});
console.log('\n7. bass-mono at 90Hz; sidechain ducking off the kick at 0.35');

const q=await call('review',{quick:true});
console.log('\nQUICK — '+String(q.says||'').slice(0,150));

/* ---- 8. ARRANGEMENT --------------------------------------------------- */
const ALL=[...[0,12,20].map((s,i)=>g(BASS,s,[0.95,0.72,0.85][i])),
  ...[[0,1.0],[8,0.5],[16,0.92],[24,0.55]].map(([s,v])=>g(KICK,s,v)),
  ['step',AIR,0,0.6],['step',AIR,16,0.45],
  ['step',GHOST,8,0.5],['step',GHOST,24,0.42],
  ...[2,10,18,26].map(s=>g(PERC,s,0.5))];

/* 1 — air and bass only: the opening */
await usePattern(1,{plen:PLEN, clear:true});
await bat([g(BASS,0,0.8), g(BASS,20,0.7), ['step',AIR,0,0.55]]);

/* 2 — add the kick and the bell */
await usePattern(2,{plen:PLEN, clear:true});
await bat([...[0,12,20].map((s,i)=>g(BASS,s,[0.9,0.7,0.8][i])),
  ...[[0,1.0],[16,0.9]].map(([s,v])=>g(KICK,s,v)),
  ['step',AIR,0,0.6]]);
await bat(LINE.map((n,k)=>g(BELL,k*4,k===0?0.85:0.55,{pitch:n-ROOT})));

/* 3 — everything, the line inverted */
await usePattern(3,{plen:PLEN, clear:true});
await bat(ALL);
await bat(LINE.map((n,k)=>g(BELL,k*4,k===3?0.9:0.58,{pitch:(ROOT*2-n)-ROOT})));

/* 0 gets the line the right way up */
await usePattern(0,{});
await bat(LINE.map((n,k)=>g(BELL,k*4,k===0||k===5?0.88:0.6,{pitch:n-ROOT})));

await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:1,reps:2},{pat:2,reps:2},{pat:0,reps:2},{pat:3,reps:2},
        {pat:2,reps:1},{pat:0,reps:2},{pat:3,reps:2},{pat:1,reps:2}]});

const sch=await call('schedule',{src:'song', full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')
  +') · stretched '+JSON.stringify(sch.stretched||[]));

/* ---- 9. THE CHECK TENEMENT COULD NOT RUN ------------------------------ */
const cmp=await call('compare',{src:'song'});
console.log('\nCOMPARE against the reference:');
for(const b of (cmp.bands||[])) console.log('   '+String(b.band).padEnd(10)
  +'mix '+String(b.mix).padStart(7)+'  ref '+String(b.ref).padStart(7)
  +'  delta '+String(b.delta).padStart(6));
console.log('   -> '+String(cmp.says||'').slice(0,160));

const bal=await tryTo('balance against the reference', ()=>call('balance',{src:'song'}));
/* the rows are `pads`, not `moves`. Guessing a field name is how
   compare() once printed nine NaNs in this repo; the shape is
   {instrument, gain, suggested, changeDb, owns, ownsShare}. */
if(bal && bal.pads) for(const m of bal.pads)
  console.log('   suggest '+String(m.instrument).padEnd(8)
    +String(m.changeDb).padStart(7)+'dB   gain '+m.gain+' -> '+m.suggested
    +'   owns '+m.owns+' ('+m.ownsShare+'%)');
for(const c of (bal&&bal.capped)||[]) console.log('   CAPPED: '+String(c).slice(0,110));
if(bal && bal.fit){ console.log('   fit after the suggested moves:');
  for(const f of bal.fit) console.log('     '+String(f.band).padEnd(10)
    +'got '+String(f.got).padStart(7)+'  want '+String(f.want).padStart(7)
    +'  '+((f.got-f.want)>=0?'+':'')+(f.got-f.want).toFixed(1)); }

/* ---- 9b. APPLY THE SOLVER, THEN ASK AGAIN ----------------------------- */
/* balance() suggests and never applies, which is right — but a
   suggestion nobody tests is just an opinion. This applies the gains
   it proposed and re-runs compare(), so the log says whether the
   solver actually closed the gap or only claimed it would. Set
   APPLY=false to get the suggestion without the experiment. */
const APPLY=true;
if(APPLY && bal && bal.pads && bal.pads.length){
  const padsOfInst={};
  for(let i=0;i<64;i++){ const p=await call('pad',i).catch(()=>null);
    if(p && p.inst) (padsOfInst[p.inst]=padsOfInst[p.inst]||[]).push(i); }
  for(const m of bal.pads){
    const list=padsOfInst[m.instrument]||[];
    for(const i of list) await call('pad',i,{gain:m.suggested});
    console.log('   applied '+String(m.instrument).padEnd(8)+' gain -> '+m.suggested
      +'  ('+(m.changeDb>=0?'+':'')+m.changeDb+'dB, '+list.length+' pad'
      +(list.length===1?'':'s')+')');
  }
  const cmp2=await call('compare',{src:'song'});
  console.log('\n   COMPARE AFTER balance():');
  let before=0, after=0, n=0;
  for(const b of (cmp2.bands||[])){
    const was=(cmp.bands||[]).find(x=>x.band===b.band);
    if(was){ before+=Math.abs(was.delta); after+=Math.abs(b.delta); n++; }
    console.log('     '+String(b.band).padEnd(10)+'delta '+String(b.delta).padStart(7)
      +(was?('   was '+String(was.delta).padStart(7)):''));
  }
  if(n) console.log('   mean |delta| '+(before/n).toFixed(1)+'dB -> '+(after/n).toFixed(1)
    +'dB  '+(after<before?'BETTER':'WORSE — the solver did not help'));
}

const lo=await call('loudness',{src:'song'});
console.log('\nbrightness (perceived minus measured):');
for(const x of (lo.pads||[]).slice(0,8))
  console.log('   '+String(x.name||('pad '+x.pad)).padEnd(10)+String(x.brightness).padStart(6)
    +'dB  lufs '+x.lufs);
console.log('   -> '+String(lo.says).slice(0,120));

const pu=await call('pulse',{src:'song'});
console.log('\npulse: autocorr '+pu.pulseStrength+'  beat '+pu.onGrid.beat
  +'%  sixteenth '+pu.onGrid.sixteenth+'%  buried-by '+pu.beatBuriedBy);
console.log('   (sixteenth% cannot see humanisation: the tolerance is '
  +(Math.max(0.012,(60/BPM/4)*0.30)*1000).toFixed(0)+'ms at '+BPM+'bpm and the '
  +'applied nudges are 3-11ms. A human drummer scores 100% here too.)');
const tr=await call('translate',{src:'song'});
console.log('small speaker: '+String(tr.says).slice(0,140));

/* ---- 10. LEVEL BY MEASUREMENT ----------------------------------------- */
await call('set',{mTrim:-12, compAmt:0.10});
const probe=await call('render',{src:'song',loops:1,loudness:true});
const trim=Math.max(-30, Math.min(0, -12 + (TARGET_LUFS - probe.lufs)));
console.log('\nprobe -12 -> '+probe.lufs.toFixed(1)+' LUFS crest '+probe.crestDb.toFixed(1)
  +' -> trim '+trim.toFixed(1));
await call('set',{mTrim:+trim.toFixed(1)});
const m=await call('render',{src:'song',loops:1,loudness:true});
console.log('   '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
  +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':'')
  +'   (reference: '+REF.lufs+' LUFS, crest '+REF.crestDb+')');
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'meridian.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
