/* NOCTURNE IN F# MINOR — 56bpm, 18 bars, about 1:17. Solo piano.
   ==============================================================

   WHY THIS ONE EXISTS. The previous track, HOLLOWAY, was built by
   running the checks and fixing whatever they named. It passed all of
   them and the listener's verdict was "worse than previous bad
   samples: timing bad, chord progression bad, levels bad". Every
   fault traced to a measurement being served instead of a decision
   being made — see lesson 5 at the top of AGENTS.md.

   So this one starts from a decision. It is a NOCTURNE: slow,
   pedalled, lyrical, and mostly space. Every technical choice below
   follows from that word rather than from a number that wanted
   improving. The analysers are run once at the end to catch
   BREAKAGE, and nothing here is adjusted to improve a figure.

   WHAT MAKES A SAMPLED PIANO SOUND LIKE A PIANO, none of which the
   previous track did, and all of which this app already had:

   1. HELD NOTE LENGTHS. `note(..., {beats: 4})` keeps the gate open
      for four beats and then lets the release close it. That is a
      damper lifting and falling. HOLLOWAY gave every note the same
      fixed 1.6s decay whatever it was doing, which is a sampler
      firing one-shots — and then spent hours computing which pitch
      should ring into the next bar while the ringing itself was
      wrong.

   2. SOFT WRITING, so the velocity layers do their job. Salamander
      carries six recordings per note at velocities 0.03 to 0.97. Most
      of this piece sits between 0.18 and 0.46, which reaches the
      bottom three — a genuinely different recording of a quieter
      hammer, not the same one turned down. HOLLOWAY wrote 0.54-0.82
      throughout and never touched the soft half of the library.

   3. ONE INSTRUMENT ACROSS THE WHOLE RANGE. 18 roots from A1 to C6,
      every minor third, so the worst pitch-shift any note asks for is
      2 semitones. Past a few semitones a stretched sample stops
      sounding like a piano. instrument() RETURNS `worstBend` and it
      is asserted below, because the previous track never read it.

   4. THE ROOM IS PART OF THE INSTRUMENT. A piano in a dry box is a
      sampler. Long reverb, a quiet delay underneath, and the pads
      panned by register the way the strings actually lie under the
      lid. HOLLOWAY used three of eighteen master controls and panned
      nothing.

   5. RELEASE SAMPLES. instrument() hangs the damper recordings on
      every pad automatically when the pack carries them, which
      salamander does.

   THE MUSIC. Three voices on one piano:
     - a bass that takes the root for the whole bar and its octave
       halfway through, so the bar has a floor that never restrikes;
     - an inner voice holding the third and the seventh — the guide
       tones, which is what tells you the chord is minor or major;
     - a melody with gaps in it.

   Phrase lengths are 4, 4, 4+2 and 4 bars. Not all equal, because
   four-square is audible as four-square, and the 2-bar turn before
   the return is the point at which it stops being a loop. */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=56, TARGET_LUFS=-17.5;

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

await call('clear');
await call('set',{bpm:BPM});

/* ---- THE INSTRUMENT -------------------------------------------------- */
const inf=await call('instrument','pf',{pack:'samples/salamander.json',
  match:'^sal:', lo:33, hi:84});
console.log('piano: '+inf.pads.length+' roots '+inf.lo+'-'+inf.hi
  +'  worst bend '+inf.worstBend+' semitones'
  +'  dynamics '+inf.dynamics+' layers'
  +'  release samples '+(inf.releases||0));
if(inf.worstBend>2) throw new Error('bends of '+inf.worstBend
  +' semitones — past about two a stretched sample stops sounding like a piano');
if(inf.dynamics<4) throw new Error('only '+inf.dynamics+' velocity layers reached');

/* THE ENVELOPE IS A DAMPER. sus:0 with a nine-second decay is how a
   struck string behaves — it starts dying immediately and takes a long
   time about it. The note's written length closes the gate, and the
   release is the damper felt landing. Together that is a pedal. */
const pads=inf.pads;
for(let i=0;i<pads.length;i++){
  /* panned by register, the way the strings lie under a lid: bass to
     the left of the player, treble to the right. Narrow, because this
     is one instrument in a room and not a stereo effect. */
  const t=i/(pads.length-1);
  await call('pad', pads[i], { att:0.002, dec:9, sus:0, rel:0.9,
    gain:0.75, pan:-0.3+t*0.6, rev:0.5, dly:0.1 });
}

/* ---- THE PIECE ------------------------------------------------------
   Written as [midi, step, beats, velocity] per bar, per voice, because
   that is what the notes are. Nothing here is generated and nothing is
   fitted to a metric.

   F#m  Dmaj7  Bm7   E   |  A   C#m  Dmaj7  C#7  |
   Bm7  E      A     F#m |  D   C#7 |  F#m  Dmaj7  Bm7  F#m          */

const CHORDS=['F#m','Dmaj7','Bm7','E', 'A','C#m','Dmaj7','C#7',
              'Bm7','E','A','F#m', 'D','C#7', 'F#m','Dmaj7','Bm7','F#m'];

/* bass: root for the whole bar, octave halfway. A floor that does not
   restrike, which is what lets everything above it blur. */
const BASS=[
  [42,54],[38,50],[35,47],[40,52],   [45,57],[37,49],[38,50],[37,49],
  [35,47],[40,52],[45,57],[42,54],   [38,50],[37,49],
  [42,54],[38,50],[35,47],[42,54],
];
/* inner voice: the third and the seventh — the notes that say what the
   chord IS. The fifth is the one you can leave out. */
const INNER=[
  [57,61],[54,61],[62,57],[56,59],   [61,64],[64,56],[54,61],[53,59],
  [62,57],[56,59],[61,64],[57,61],   [54,57],[53,59],
  [57,61],[54,61],[62,57],[57,61],
];
/* the melody, with its gaps. [midi, step, beats, vel] */
const MEL=[
  /*  0 F#m   */ [[73,0,2,.42],[71,8,1,.34],[69,12,2.5,.38]],
  /*  1 Dmaj7 */ [[66,4,2.5,.36],[74,12,1.5,.33]],
  /*  2 Bm7   */ [[74,0,1.5,.40],[73,6,1,.30],[71,10,2.5,.36]],
  /*  3 E     */ [[71,0,2,.38],[68,8,3,.32]],
  /*  4 A     */ [[76,0,2,.46],[73,8,2,.38]],
  /*  5 C#m   */ [[68,0,1.5,.36],[76,6,1,.44],[73,10,1.5,.38]],
  /*  6 Dmaj7 */ [[74,0,2,.42],[78,8,2.5,.50]],
  /*  7 C#7   */ [[71,0,2,.38],[68,8,2.5,.32]],
  /*  8 Bm7   */ [[78,0,1.5,.48],[76,6,1,.40],[74,10,2,.42]],
  /*  9 E     */ [[76,0,2,.46],[71,8,2,.38]],
  /* 10 A     */ [[73,0,1,.42],[76,4,1,.48],[81,8,2.5,.62]],   // the top
  /* 11 F#m   */ [[81,0,1.5,.55],[80,6,1,.46],[78,10,2,.48]],
  /* 12 D     */ [[78,0,2,.46],[74,8,2,.40]],
  /* 13 C#7   */ [[73,0,2,.38],[71,8,2.5,.30]],
  /* 14 F#m   */ [[73,0,2,.34],[69,8,2.5,.28]],
  /* 15 Dmaj7 */ [[66,0,4,.30]],                                // held
  /* 16 Bm7   */ [[74,0,2,.30],[71,8,2.5,.26]],
  /* 17 F#m   */ [[66,0,4,.26],[73,8,4,.20]],                   // ring out
];

/* RUBATO, NOT A GROOVE. A nocturne breathes: the melody arrives a
   little after the bar and the bass a little before it, and no two
   bars agree about how much. These are fractions of a step and the
   step here is 67ms, so they are small — but a piano where every
   onset is exact is the one thing a real one never is. */
let rs=0x9E3779B1;
const rnd=()=>{ rs^=rs<<13; rs^=rs>>>17; rs^=rs<<5; return ((rs>>>0)/4294967296); };
const lean=(amount)=>+(amount+(rnd()*2-1)*0.10).toFixed(3);

const writeBar=async(bar, slot)=>{
  const at=slot*16, N=[];
  const [root, oct]=BASS[bar];
  /* the bass is fractionally early — a pianist's left hand lands before
     the beat and the right hand follows it */
  N.push(['note','pf', root, at+0, 0.40, {beats:4, nudge:lean(-0.12)}]);
  N.push(['note','pf', oct,  at+8, 0.28, {beats:2.5, nudge:lean(-0.08)}]);
  const [third, seventh]=INNER[bar];
  N.push(['note','pf', third,   at+2,  0.22, {beats:3.5, nudge:lean(0)}]);
  N.push(['note','pf', seventh, at+10, 0.19, {beats:2,   nudge:lean(0)}]);
  for(const [m,st,beats,v] of MEL[bar])
    N.push(['note','pf', m, at+st, v, {beats, nudge:lean(st===0?0.10:0.04)}]);
  await bat(N);
};

/* four patterns of four bars and one of two: the 2-bar turn is where
   the squareness breaks */
const PATS=[[0,4],[4,4],[8,4],[12,2],[14,4]];
for(let p=0;p<PATS.length;p++){
  const [first,len]=PATS[p];
  await usePattern(p,{plen:len*16, clear:true});
  for(let b=0;b<len;b++) await writeBar(first+b, b);
}
await call('set',{pattern:0, songOn:true, songLoop:false,
  song:PATS.map((_,i)=>({pat:i, reps:1}))});

/* ---- THE ROOM -------------------------------------------------------
   A piano recorded dry and played back dry is a sampler. These are the
   master controls the previous track never touched. */
await call('set',{ revLvl:0.55, delayFb:0.25, human:0.10,
  mAir:1.0, mWidth:1.1, compAmt:0.04, mCeil:-1.5 });

const sch=await call('schedule',{src:'song', full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')
  +') · '+CHORDS.length+' bars, phrases of 4 4 4+2 4');
if((sch.stretched||[]).length) console.log('   stretched: '
  +sch.stretched.map(s=>s.pad+' by '+s.semitones).join(', '));

/* ---- LEVEL, AND THE FILE, BEFORE THE SLOW READ-ONLY PASS ------------- */
await call('set',{mTrim:-12});
const probe=await call('render',{src:'song',loops:1,loudness:true});
const trim=Math.max(-24, Math.min(12, -12+(TARGET_LUFS-probe.lufs)));
await call('set',{mTrim:+trim.toFixed(1)});
const m=await call('render',{src:'song',loops:1,loudness:true});
console.log('probe '+probe.lufs.toFixed(1)+' -> trim '+trim.toFixed(1)
  +' -> '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
  +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'nocturne.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));

/* ---- CHECKS, FOR BREAKAGE ONLY --------------------------------------
   Read as pass/fail. Nothing below gets "improved". If a check reports
   something and the musical answer is that it is fine, that is the
   answer and the number stays where it is. */
const hm=await call('harmony',{src:'song', chords:CHORDS});
console.log('\nharmony  '+String(hm.says||'').slice(0,160));
for(const f of (hm.findings||[])) console.log('   ['+f.kind+'] '+f.says.slice(0,120));
const pu=await call('pulse',{src:'song'});
console.log('pulse    autocorr '+pu.pulseStrength+'  beat '+pu.onGrid.beat+'%'
  +'   (a rubato nocturne is not supposed to score here)');
await browser.close(); srv.close();
