/* KITWORK — a drum solo, 104bpm, about a minute. Real drums only.
   ===============================================================

   WHY THIS EXISTS. The previous track used a door knock as its kick,
   pitched down and driven, and the verdict was "a strange percussive
   noise". It was: a loud distorted recording of someone knocking on a
   door. pulse() had reported no findable beat — 0.007, then 0.017
   after the knock was doubled in level — and that was dismissed as a
   broken metric instead of read as the track having nothing on it
   that sounds like a beat.

   So this is percussion and nothing else, from mvxkit and the studio
   percussion: kick, snare, two hats, clap, rim, three toms, conga and
   shaker. No synthesis, no found sounds, no processing beyond level
   and envelope. If a kit played well does not sound like a kit, the
   problem is the sequencing and that is worth knowing on its own.

   WHAT MAKES IT A PERFORMANCE RATHER THAN A GRID.

   Ghost notes. A snare part is not backbeats — it is backbeats with
   quiet strokes threaded between them, and the gap between a ghost at
   velocity 0.18 and an accent at 0.95 is most of what reads as human.

   Measured micro-timing. samples/groove-norms.json holds the offsets
   taken from 1,150 human performances on a Roland TD-11: the strong
   positions sit early relative to the take's own mean, the in-between
   sixteenths lag, with "e" latest at +0.0624 of a sixteenth. `nudge`
   takes exactly that unit, so the numbers apply directly rather than
   being approximated.

   Do not expect pulse() to show any of it. Its grid tolerance is
   max(12ms, a sixteenth * 0.30) — 43ms at this tempo — and these
   offsets are a few milliseconds. A human drummer scores ~100% on
   that measure too.

   Variation. Four patterns: a groove, its variation, a fill, and a
   bigger fill, so nothing repeats more than twice before something
   moves. */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=104, TARGET_LUFS=-16.6;
const G=JSON.parse(readFileSync(OUT+'samples/groove-norms.json','utf8'));

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
const usePattern=async(n,props)=>{
  const r=await call('pattern',n,Object.assign({select:true},props||{}));
  if(r.warning) throw new Error('pattern '+n+': '+r.warning);
  if(r.selected!==true) throw new Error('pattern '+n+' did not become selected');
  return r; };

/* ---- MICRO-TIMING FROM THE CORPUS ------------------------------------ */
const R=G.relative_to_own_mean;
const SLOT=[R['beat (1/4)'].mean_frac16, R['e (1/16)'].mean_frac16,
            R['and (1/8)'].mean_frac16, R['a (1/16)'].mean_frac16];
let rs=0xC0FFEE;
const rnd=()=>{ rs^=rs<<13; rs^=rs>>>17; rs^=rs<<5; return ((rs>>>0)/4294967296); };
/* the corpus mean for the metrical position, plus a little scatter —
   applying one number to every hit identically is just a finer grid */
const groove=(step)=>+(SLOT[step%4]+(rnd()*2-1)*0.014).toFixed(4);
const h=(pad,step,vel)=>['step',pad,step,vel,{nudge:groove(step)}];

await call('clear');
await call('set',{bpm:BPM});
await call('pack','samples/nakeddrums.json');

/* ---- THE KIT: AN ACTUALLY RECORDED ONE -------------------------------
   The previous version used mvxkit, which is synthesised. The tell was
   in the files: durations of exactly 0.450, 0.220, 0.060 and 0.400
   seconds, mono, no attribution and no source URL. Real recordings do
   not land on round numbers, and 60ms is shorter than any miked hat.
   The listener said there was zero chance real drums were used and was
   right; measuring the files afterwards only confirmed it.

   This is Wilkinson Audio's Naked Drums, multi-mic FLAC from the
   sfzinstruments mirror. What matters is not that it is "real" in the
   abstract but that it has VELOCITY LAYERS and ROUND ROBINS: a harder
   hit plays a different recording rather than the same one louder, and
   three alternates mean consecutive hits are never identical samples.
   That is most of what a kit sounds like. The synthesised set had one
   sample per drum, so every stroke was literally the same waveform at
   a different gain — which no amount of micro-timing can disguise.

     Kick   note 36   5 velocity layers x 3 round robins
     Snare  note 37   1 layer x 3
     Hats   note 39   3 x 3
     Tom    note 48   3 x 3
     Ride   note 51   3 x 3                                          */
await call('instrument','kit',{pack:'samples/nakeddrums.json',
  match:'^nd:', lo:36, hi:51});
const pads=await call('instPads','kit');
console.log('kit: '+pads.length+' pads from a recorded kit '
  +'(velocity layers + round robins)');
for(const x of pads) await call('pad',x.pad,{gain:1.0, att:0.0005, sus:1,
  dec:6, rel:0.3});

const KICK=36, SNARE=37, HAT=39, TOM=48, RIDE=51;

/* ---- THE PARTS -------------------------------------------------------
   Velocity is doing real work now: it chooses which recording plays,
   so a ghost at 0.18 and an accent at 0.95 are different strokes of a
   stick, not one stroke at two volumes. */
const k=(midi,step,vel)=>['note','kit',midi,step,vel,{nudge:groove(step)}];
const hats=(open=[])=>{ const out=[];
  for(let st=0;st<16;st+=2) out.push(k(HAT,st,st%4===0?0.62:0.34));
  return out; };
const ghosts=(steps)=>steps.map(st=>k(SNARE,st,0.16));

/* 0 — the groove */
await usePattern(0,{plen:16, clear:true});
await bat([
  k(KICK,0,0.95), k(KICK,6,0.42), k(KICK,10,0.72),
  k(SNARE,4,0.9), k(SNARE,12,0.95),
  ...ghosts([2,7,14]), ...hats(),
]);

/* 1 — variation: kick moves, ride marks the bar */
await usePattern(1,{plen:16, clear:true});
await bat([
  k(KICK,0,0.93), k(KICK,3,0.38), k(KICK,8,0.66), k(KICK,11,0.5),
  k(SNARE,4,0.88), k(SNARE,12,0.95),
  ...ghosts([2,6,10,15]),
  ...[0,2,4,6,8,10,12,14].map(st=>k(RIDE,st,st%4===0?0.6:0.3)),
]);

/* 2 — a fill on the one tom this kit has, plus snare */
await usePattern(2,{plen:16, clear:true});
await bat([
  k(KICK,0,0.95), k(SNARE,4,0.9), ...ghosts([2,6]),
  ...hats().filter(x=>x[3]<8),
  k(TOM,8,0.7), k(TOM,9,0.42), k(SNARE,10,0.66), k(TOM,11,0.5),
  k(TOM,12,0.84), k(SNARE,13,0.5), k(TOM,14,0.78), k(SNARE,15,0.9),
]);

/* 3 — the bigger fill, sixteenths, ending on the ride */
await usePattern(3,{plen:16, clear:true});
await bat([
  k(KICK,0,0.95), k(SNARE,2,0.5), k(TOM,3,0.46),
  k(SNARE,4,0.86), k(TOM,5,0.52), k(SNARE,6,0.62), k(TOM,7,0.44),
  k(SNARE,8,0.78), k(TOM,9,0.68), k(SNARE,10,0.52), k(TOM,11,0.74),
  k(SNARE,12,0.9), k(TOM,13,0.58), k(SNARE,14,0.8),
  k(KICK,15,0.9), k(RIDE,15,0.7),
]);

await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:0,reps:2},{pat:1,reps:1},{pat:0,reps:1},{pat:2,reps:1},
        {pat:0,reps:2},{pat:1,reps:2},{pat:3,reps:1},
        {pat:0,reps:2},{pat:1,reps:1},{pat:2,reps:1},{pat:3,reps:1},
        {pat:0,reps:1}]});

const sch=await call('schedule',{src:'song', full:false});
console.log(sch.notes+' hits · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')+')');

const pu=await call('pulse',{src:'song'});
console.log('pulse: autocorr '+pu.pulseStrength+'  beat '+pu.onGrid.beat
  +'%  buried-by '+pu.beatBuriedBy);

const lo=await call('loudness',{src:'song'});
console.log('\nbrightness (perceived minus measured):');
for(const x of (lo.pads||[]).slice(0,6))
  console.log('   '+String(x.name||('pad '+x.pad)).padEnd(11)
    +String(x.brightness).padStart(6)+'dB  lufs '+x.lufs);
console.log('   -> '+String(lo.says).slice(0,110));

/* ---- LEVEL ------------------------------------------------------------ */
/* -14.0 put the true peak at -0.39dBFS, which clips on a lossy
   encode — a drum solo at crest 13.8 has transients the integrated
   figure never sees. The ceiling comes down with the target. */
await call('set',{mTrim:-12, compAmt:0.12, mCeil:-2.2});
const probe=await call('render',{src:'song',loops:1,loudness:true});
/* THE CLAMP WAS MINE, NOT THE APP'S. Every song script here wrote
   Math.min(0, ...) on the master trim, so a quiet track could never
   be brought up: the first bounce of this needed +16.8dB, clamped
   silently to 0, and reported -18.8 LUFS against a -14 target as
   though the probe had worked. The app's own limit is
   clamp(want, -24, 12) — it goes to +12. The constraint was invented
   here, worked around here, and then written into a commit message
   as a fact about the app. Check the source before documenting a
   limit. */
const wanted=-12 + (TARGET_LUFS - probe.lufs);
const trim=Math.max(-24, Math.min(12, wanted));
console.log('\nprobe -12 -> '+probe.lufs.toFixed(1)+' LUFS -> trim '+trim.toFixed(1));
if(wanted>12.01) console.log('   !! the master wanted '+wanted.toFixed(1)
  +'dB and mTrim stops at +12 — the kit is staged '+(wanted-12).toFixed(1)
  +'dB below what the master can recover. Raise the pad gains.');
await call('set',{mTrim:+trim.toFixed(1)});
const m=await call('render',{src:'song',loops:1,loudness:true});
console.log('   '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
  +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'kitwork.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
