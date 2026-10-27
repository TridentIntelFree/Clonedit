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
const OUT='/home/user/Clonedit/', BPM=104, TARGET_LUFS=-15.2;
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
await call('pack','samples/real-cc0-full.json');

/* ---- THE KIT ---------------------------------------------------------- */
const KICK=0, SNARE=1, HAT=2, OPEN=3, CLAP=4, RIM=5,
      TOMH=6, TOMM=7, TOML=8, CONGA=9, SHAKE=10;
const kit=[
  [KICK,'mvxkit:kick01',      {gain:1.80, dec:0.30, eqLo:+2}],
  [SNARE,'mvxkit:snare01',    {gain:1.40, dec:0.26}],
  [HAT,'mvxkit:hatclosed01',  {gain:0.62, dec:0.06, eqLo:-10}],
  [OPEN,'mvxkit:hatopen01',   {gain:0.58, dec:0.30, eqLo:-10}],
  [CLAP,'mvxkit:clap01',      {gain:1.28, dec:0.20, eqLo:-6}],
  [RIM,'mvxkit:rim01',        {gain:0.80, dec:0.10, eqLo:-8}],
  [TOMH,'mvxkit:tomhi01',     {gain:1.25, dec:0.34}],
  [TOMM,'mvxkit:tommid01',    {gain:0.72, dec:0.38}],
  [TOML,'mvxkit:tomlo01',     {gain:1.32, dec:0.44}],
  [CONGA,'studio:perc_conga', {gain:0.88, dec:0.24, eqLo:-5}],
  [SHAKE,'studio:perc_shaker2',{gain:0.52, dec:0.08, eqLo:-12}],
];
for(const [pad,id,props] of kit){
  await call('sound',id,pad);
  await call('pad',pad,Object.assign({inst:'kit', att:0.001, sus:0.0, rel:0.06},props,
    {name:id.split(':')[1]}));
}
console.log('kit: '+kit.length+' real drums loaded');

/* ---- THE PARTS -------------------------------------------------------- */
/* hats on eighths with a breath of dynamic, the way a hand moves */
const hats=(open=[])=>{
  const out=[];
  for(let s=0;s<16;s+=2){
    if(open.includes(s)) out.push(h(OPEN,s,0.55));
    else out.push(h(HAT,s,s%4===0?0.62:0.42));
  }
  return out;
};
/* ghost notes are the point: quiet strokes between the backbeats */
const ghosts=(steps)=>steps.map(s=>h(SNARE,s,0.18));

/* 0 — the groove */
await usePattern(0,{plen:16, clear:true});
await bat([
  h(KICK,0,0.98), h(KICK,6,0.55), h(KICK,10,0.80),
  h(SNARE,4,0.92), h(SNARE,12,0.95),
  ...ghosts([2,7,14]),
  ...hats([]),
  h(SHAKE,3,0.3), h(SHAKE,11,0.3),
]);

/* 1 — the variation: kick moves, open hat on the and of 4, a conga */
await usePattern(1,{plen:16, clear:true});
await bat([
  h(KICK,0,0.96), h(KICK,3,0.5), h(KICK,8,0.72), h(KICK,11,0.6),
  h(SNARE,4,0.9), h(SNARE,12,0.95),
  ...ghosts([2,6,10,15]),
  ...hats([14]),
  h(CONGA,7,0.5), h(SHAKE,5,0.28), h(RIM,13,0.4),
]);

/* 2 — a fill: toms down the kit across the last half-bar */
await usePattern(2,{plen:16, clear:true});
await bat([
  h(KICK,0,0.96), h(SNARE,4,0.9), ...ghosts([2,6]),
  ...hats([]).filter(x=>x[2]<8),
  h(TOMH,8,0.72), h(TOMH,9,0.5), h(TOMM,10,0.78), h(TOMM,11,0.54),
  h(TOML,12,0.85), h(TOML,13,0.6), h(SNARE,14,0.8), h(TOML,15,0.9),
]);

/* 3 — the bigger fill: sixteenths round the kit, ending open */
await usePattern(3,{plen:16, clear:true});
await bat([
  h(KICK,0,0.95), h(SNARE,2,0.6), h(TOMH,3,0.55),
  h(SNARE,4,0.88), h(TOMH,5,0.6), h(TOMM,6,0.7), h(TOMM,7,0.5),
  h(SNARE,8,0.8), h(TOML,9,0.72), h(TOML,10,0.6), h(TOMM,11,0.78),
  h(SNARE,12,0.9), h(TOMH,13,0.66), h(TOML,14,0.82),
  h(CLAP,15,0.8), h(OPEN,15,0.6),
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
await call('set',{mTrim:-12, compAmt:0.12, mCeil:-1.6});
const probe=await call('render',{src:'song',loops:1,loudness:true});
/* THE CLAMP HAS TO SPEAK. mTrim stops at 0, so a track staged too
   quietly cannot be brought up by the master at all — the first
   bounce of this needed +16.8dB, got clamped to 0, and reported
   -18.8 LUFS against a -14 target as though the probe had worked. A
   clamped value looks exactly like a chosen one. */
const wanted=-12 + (TARGET_LUFS - probe.lufs);
const trim=Math.max(-30, Math.min(0, wanted));
console.log('\nprobe -12 -> '+probe.lufs.toFixed(1)+' LUFS -> trim '+trim.toFixed(1));
if(wanted>0.01) console.log('   !! the master wanted '+wanted.toFixed(1)
  +'dB and mTrim stops at 0 — the kit is staged '+wanted.toFixed(1)
  +'dB too quiet and no master setting can fix that. Raise the pad gains.');
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
