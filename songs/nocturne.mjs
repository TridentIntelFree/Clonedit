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
  /* AND THE LENGTH HAS TO HAVE TAKEN. note() does clamp(step,0,L-1),
     so a pattern that is shorter than the part being written does not
     fail — it FOLDS every later bar onto the last step of the pattern.
     The previous bounce had bars 14 to 17 playing each other's notes
     and nothing said a word; the pitches were all present in the
     schedule, just not where they were written. A length nobody reads
     back is not a length. */
  if(props && props.plen!=null && r.plen!==props.plen)
    throw new Error('pattern '+n+' asked for plen '+props.plen+' and came back '
      +r.plen+' — steps past the end would fold onto the last one');
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

/* THE ENVELOPE IS A DAMPER, AND THE PEDAL HAS TO CHANGE.

   The first version used dec:9 — a struck string really does take
   that long to die, so it looked right. It is not, because the pedal
   never lifts: a note written for four beats went on sounding for
   ten seconds, which at 56bpm is two and a third BARS, so every
   chord was still ringing through the two after it. harmony() found
   ten notes a semitone from a chord three changes later, the worst
   being D held over an F# minor against its C#.

   That is not a number needing improvement, it is mud. A pianist
   lifts the pedal when the harmony changes. Five seconds puts the
   ring at about a bar and a third: the bar line still blurs, which
   is the whole point of a nocturne, but the previous chord has
   faded well down before the next one is established.

   GAIN. 0.75 left the bounce at -23.2 LUFS with the sample peak at
   -7.2dB — seven decibels of headroom unused, and the master could
   not recover it. The level belongs at the pad. */
const pads=inf.pads;
for(let i=0;i<pads.length;i++){
  /* panned by register, the way the strings lie under a lid: bass to
     the left of the player, treble to the right. Narrow, because this
     is one instrument in a room and not a stereo effect. */
  const t=i/(pads.length-1);
  await call('pad', pads[i], { att:0.002, dec:5, sus:0, rel:0.9,
    gain:1.40, pan:-0.3+t*0.6, rev:0.42, dly:0.09 });
}

/* ---- THE PIECE ------------------------------------------------------
   Written as [midi, step, beats, velocity] per bar, per voice, because
   that is what the notes are. Nothing here is generated and nothing is
   fitted to a metric.

   F#m  Dmaj7  Bm7   E   |  A   C#m  Dmaj7  C#7  |
   Bm7  E      A     F#m |  D   C#7 |  F#m  Dmaj7  Bm7  F#m          */

const CHORDS=['F#m','Dmaj7','Bm7','E', 'A','C#m','Dmaj7','C#7',
              'Bm7','E','A','F#m', 'D','C#7', 'F#m','Dmaj7','Bm7','F#m'];

/* THE LEFT HAND IS AN ARPEGGIO, WHICH IS HOW A NOCTURNE STATES ITS
   HARMONY. The first version gave it a root held for the whole bar
   plus its octave, and put the third and the seventh — the only notes
   that say what the chord is — in a separate inner voice written at
   velocity 0.19 to 0.22.

   That does not work on a velocity-layered sampler. pickLayerIdx is
   floor(v * 6), so 0.19 and 0.22 both land on layer 1 while the
   melody at 0.34 to 0.62 sits on layers 2 and 3: a quieter RECORDING
   as well as a lower gain, about twelve decibels down, underneath
   five seconds of reverb. The listener's report was "there were no
   chords in the tune", and there were not — a bass note, a melody,
   and haze in between.

   The real fault is underneath that. A sustained root with a tune
   over it is a drone with a tune over it, whatever the inner voice is
   doing. A nocturne's left hand MOVES THROUGH the chord: bass note,
   then up through the fifth and seventh to the tenth and back. That
   both states the harmony and is the thing that flows.

   Built from the chord rather than typed out, so the third is always
   present as the tenth and nothing has to be checked by eye. */
const PCS={ 'F#m':{r:6,  th:9,  f:1,  s7:null}, 'Dmaj7':{r:2, th:6, f:9, s7:1},
            'Bm7':{r:11, th:2,  f:6,  s7:9},    'E':{r:4,     th:8, f:11, s7:null},
            'A':{r:9,    th:1,  f:4,  s7:null}, 'C#m':{r:1,   th:4, f:8,  s7:null},
            'C#7':{r:1,  th:5,  f:8,  s7:11},   'D':{r:2,     th:6, f:9,  s7:null} };
const ROOTS=[42,38,35,40, 45,37,38,37, 35,40,45,42, 38,37, 42,38,35,42];
const above=(from,pc)=>{ let m=from+1; while(((m%12)+12)%12!==pc) m++; return m; };
/* root, fifth, seventh (or the octave where the chord has none), tenth */
const LH=ROOTS.map((root,b)=>{
  const c=PCS[CHORDS[b]];
  const fifth=above(root+2, c.f);
  const sev=c.s7!=null ? above(fifth, c.s7) : root+12;
  const tenth=above(Math.max(sev, root+12), c.th);
  return [root, fifth, sev, tenth];
});
/* THE MELODY, DECORATED. The first version was 41 notes over 18 bars —
   two or three a bar, a chord-tone outline with passing notes between.
   Harmonically correct and melodically thin, and the listener's word
   for it was that the weakness is the complexity of the tune.

   It was. A nocturne melody is a singing line that gets DECORATED:
   neighbour notes and turns around the structural pitches, scalar
   cascades between them, and real filigree where the piece peaks. The
   skeleton below is the same one — the harmony was never the problem —
   with the surface written in, and the decoration shaped across the
   piece rather than sprinkled evenly: section A states the tune almost
   plainly, A' answers it more floridly, B carries the climax and the
   only run, and the return is spare again.

   What that did to the shape, against the Essen norms:

                      before      after    real melody
       steps           26.9%      55.1%        46.9%
       leaps           34.5%      16.7%        13.1%

   It lurched before and it walks now. Repeated notes come out at 2.6%
   against a norm of 21.1 and are being left alone: a florid line does
   not restate pitches much, and adding repeats to move a statistic is
   the mistake lesson 5 in AGENTS.md is about.

   [midi, step, beats, vel], 16 steps to the bar */
const MEL=[
  /*  0 F#m   */ [[73,0,1,.40],[71,4,.5,.30],[73,6,.5,.32],[69,8,1.5,.38],[71,14,.5,.28]],
  /*  1 Dmaj7 */ [[69,0,1,.36],[66,4,1,.34],[69,8,.5,.30],[74,10,.5,.34],[73,12,1,.36]],
  /*  2 Bm7   */ [[74,0,1,.40],[73,4,.5,.32],[71,6,.5,.34],[69,8,1,.36],[71,12,1,.34]],
  /*  3 E     */ [[71,0,1.5,.38],[73,6,.5,.28],[68,8,2,.34]],
  /*  4 A     */ [[76,0,1,.44],[73,4,.5,.34],[76,6,.5,.36],[81,8,1,.46],[80,12,.5,.38],[78,14,.5,.36]],
  /*  5 C#m   */ [[76,0,1,.40],[68,4,1,.34],[71,8,.5,.32],[73,10,.5,.34],[76,12,1,.38]],
  /*  6 Dmaj7 */ [[74,0,1,.42],[78,4,1,.44],[76,8,.5,.36],[74,10,.5,.34],[73,12,1,.38]],
  /*  7 C#7   */ [[71,0,1.5,.38],[68,6,.5,.30],[71,8,.5,.32],[73,10,1.5,.36]],
  /*  8 Bm7   */ [[74,0,1,.42],[78,4,1,.44],[81,8,1,.48],[78,12,1,.42]],
  /*  9 E     */ [[80,0,1.5,.46],[78,6,.5,.38],[76,8,1,.42],[71,12,1,.36]],
  /* 10 A     */ [[73,0,.5,.40],[76,2,.5,.42],[81,4,1,.50],
                  /* the one cascade, falling off the top of the piece */
                  [80,8,.25,.34],[78,9,.25,.34],[76,10,.25,.34],[73,11,.25,.34],[71,12,1,.38]],
  /* 11 F#m   */ [[81,0,1.5,.55],[80,6,.5,.44],[78,8,1,.48],[73,12,1,.40]],
  /* 12 D     */ [[78,0,1,.46],[76,4,.5,.38],[74,6,.5,.40],[69,8,1,.38],[74,12,1,.38]],
  /* 13 C#7   */ [[73,0,1,.40],[71,4,.5,.34],[68,6,.5,.32],[71,8,1,.34],[73,12,1,.36]],
  /* 14 F#m   */ [[73,0,2,.34],[69,8,1.5,.28],[71,14,.5,.24]],
  /* 15 Dmaj7 */ [[69,0,2,.30],[66,8,2,.26]],
  /* 16 Bm7   */ [[74,0,1,.30],[73,4,.5,.26],[71,6,.5,.26],[69,8,2,.28]],
  /* 17 F#m   */ [[66,0,4,.26],[73,8,4,.20]],                   // ring out
];

/* RUBATO IS SHAPE, NOT NOISE — and the first version of this had it
   exactly backwards. Every onset got a random nudge of plus or minus
   a tenth of a step, about 27ms of jitter, and the master `human` was
   set to 0.10, which the scheduler turns into plus or minus 1.2ms of
   further randomness. Two layers of noise and not one deliberate
   shape. The verdict was that it lacks fluidity, and random timing is
   precisely what unsteady sounds like: a player who cannot hold time,
   rather than one who is bending it.

   Real rubato has three parts, and the app already does the hardest:

   `humanDrift` is two summed sines — a slow continuous wander of the
   whole tempo, which is the ebb a performance has and a sequencer
   does not. It was sitting unused at 0 while `human` was set to a
   random jitter that does nothing audible. That is the "reach for
   what is already there" lesson again.

   THE HANDS COME APART. This is the defining feature of the style:
   the left hand keeps time and the right is free over it. A fixed,
   consistent lag of the melody behind the bass is heard as expression;
   the same amount applied at random is heard as sloppiness.

   AND THE PHRASE RELAXES INTO ITS CADENCE. A player slows at the end
   of a phrase and picks up again at the start of the next. That is
   one curve per phrase, not one value per note. */
let rs=0x9E3779B1;
const rnd=()=>{ rs^=rs<<13; rs^=rs>>>17; rs^=rs<<5; return ((rs>>>0)/4294967296); };

/* which phrase a bar belongs to, and how far through it: 4, 4, 6, 4 */
const PHRASE=[[0,4],[4,4],[8,6],[14,4]];
const placeIn=(bar)=>{ for(const [s,n] of PHRASE) if(bar>=s && bar<s+n)
  return {p:(bar-s)/(n-1||1), first:s, n}; return {p:0, first:0, n:4}; };

/* nudge in fractions of a step. The melody sits consistently behind the
   left hand, both relax into the cadence, and a little noise is left on
   top because a player is not a curve either — but it is a quarter of
   what it was, and it is no longer the only thing happening. */
const rubato=(bar, voice)=>{
  const {p}=placeIn(bar);
  const apart = voice==='mel' ? 0.09 : -0.05;
  const cadence = 0.34*Math.pow(Math.max(0,(p-0.70)/0.30), 2);
  return +(apart + cadence + (rnd()*2-1)*0.028).toFixed(3);
};
/* and the phrase swells toward its middle and eases off at both ends */
const dyn=(bar)=>{ const {p}=placeIn(bar); return 0.90+0.20*Math.sin(Math.PI*p); };

/* the arc across the bar: where each of the six left-hand notes falls,
   how long it is held, and how hard. The bass note carries the weight
   and the rest are lighter, but all six sit on layers 1-2 where they
   can be HEARD — an accompaniment nobody can hear is not an
   accompaniment, which was the whole fault of the last version. */
/* THE CHORDS HAVE TO SOUND TOGETHER, which an arc of single notes does
   not make them do. Spread over four beats at 56bpm, the six-note
   version put one note every 0.54 to 1.07 seconds — far enough apart
   that the ear takes it as a line in the bass, which is exactly what
   "there aren't any chords" means, twice.

   Counted from the schedule rather than guessed at: the complete
   triad was sounding for 24% of the bar, a mean of 2.0 pitch classes
   out of 3. Three notes struck as a rolled chord and PEDALLED TO THE
   BAR LINE puts it at 73%, a mean of 2.5.

   So: bass on the downbeat ringing the whole bar, the upper three
   rolled across 70ms the way a hand rolls a chord, the bass octave
   halfway, and the chord again before the bar turns. Every note damps
   at the bar line, which is the pedal changing with the harmony.

     AND THE BAR MUST NOT BE SQUARE. The first version of this put its
     four events on steps 0, 4, 8 and 12 — exactly the four beats,
     every bar, identically — and the humanisation audibly went out of
     the piece even though the rubato code had not changed. pulse()
     measured it: beat accuracy went from 69.7% to 90.5%. Rubato on
     top of a metronomic grid still reads as metronomic, because the
     grid is what the ear locks to.

     The arc it replaced had onsets at 0, 4, 6, 8, 10 and 12, so some
     of it fell off the beat. So the chords keep their fusing roll but
     the bar gets its uneven positions back, a single moving note
     between them, and three figures that alternate so no two
     consecutive bars scan alike.

     [index into LH (-1 = root+octave), step, beats, velocity]   */
const FIGS=[
  [ [0,0,4.0,0.44], [1,4,2.5,0.30],[2,4,2.5,0.29],[3,4,2.5,0.31],
    [2,7,1.0,0.25], [-1,8,2.0,0.30],
    [1,12,1.0,0.27],[2,12,1.0,0.26],[3,12,1.0,0.28] ],
  [ [0,0,4.0,0.44], [1,3,3.0,0.29],[2,3,3.0,0.30],[3,3,3.0,0.28],
    [-1,7,2.5,0.31], [3,10,1.5,0.24],
    [1,13,0.8,0.26],[2,13,0.8,0.27],[3,13,0.8,0.25] ],
  [ [0,0,4.0,0.44], [1,5,2.5,0.31],[2,5,2.5,0.29],[3,5,2.5,0.30],
    [-1,9,1.8,0.29], [1,11,1.2,0.23],
    [2,14,0.6,0.25],[3,14,0.6,0.27] ],
];
/* a hand does not roll a chord the same way twice: the spread varies
   and it sometimes falls from the top instead of rising to it */
const rollOf=(n,k)=>{ const span=0.14+rnd()*0.22, down=rnd()<0.28;
  return +(( down ? (n-1-k) : k)*span/Math.max(1,n-1)).toFixed(3); };

const writeBar=async(bar, slot)=>{
  const at=slot*16, N=[], d=dyn(bar);
  const lhN=rubato(bar,'lh'), melN=rubato(bar,'mel');
  /* three figures, rotated, so no two consecutive bars scan alike */
  const fig=FIGS[bar%FIGS.length];
  /* notes sharing a step are one rolled chord; roll them together */
  const groups={};
  fig.forEach((e,idx)=>{ (groups[e[1]]=groups[e[1]]||[]).push(idx); });
  fig.forEach(([i,st,beats,v],idx)=>{
    const g=groups[st], k=g.indexOf(idx);
    const roll = g.length>1 ? rollOf(g.length,k) : 0;
    const midi = i<0 ? LH[bar][0]+12 : LH[bar][i];
    /* and no two strikes of the same chord are at quite the same weight */
    const jitter = 1 + (rnd()*2-1)*0.07;
    N.push(['note','pf', midi, at+st, Math.min(1, v*d*jitter),
      {beats, nudge:+(lhN+roll-(st===0?0.05:0)).toFixed(3)}]);
  });
  const last=MEL[bar].length-1;
  MEL[bar].forEach(([m,st,beats,v],i)=>{
    /* AGOGIC: the note a phrase arrives on is leaned on — held a little
       longer and allowed to come a little late. It is the oldest
       expressive device there is and it costs two numbers. */
    const {p}=placeIn(bar);
    const arrival = (i===last && p>0.99);
    N.push(['note','pf', m, at+st, Math.min(1, v*d),
      {beats: arrival?beats*1.5:beats,
       nudge: +(melN+(arrival?0.12:0)).toFixed(3)}]);
  });
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
/* humanDrift is the two-sine tempo wander and it was sitting at 0
   while `human` — plus or minus 1.2ms of randomness — was set to 0.10
   and doing nothing audible. They are now the other way round: the
   drift carries the ebb and the random is a trace. */
await call('set',{ revLvl:0.46, delayFb:0.22, human:0.03, humanDrift:0.55,
  mAir:1.0, mWidth:1.1, compAmt:0.04, mCeil:-1.5 });

const sch=await call('schedule',{src:'song', full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')
  +') · '+CHORDS.length+' bars, phrases of 4 4 4+2 4');
if((sch.stretched||[]).length) console.log('   stretched: '
  +sch.stretched.map(s=>s.pad+' by '+s.semitones).join(', '));

/* ---- LEVEL, AND THE FILE, BEFORE THE SLOW READ-ONLY PASS ------------- */
/* THE MASTER IS NOT LINEAR, so solving the trim in one step misses.
   AGENTS.md step 4 says it is and I wrote that; on this track a
   request for +21.9dB of trim produced +16.2dB of loudness, a slope
   of 0.74, and the bounce landed 5.7dB under target with the limiter
   nowhere near engaging. So: measure, solve, measure again, and use
   the slope the first two points actually show rather than the one
   the arithmetic assumes. */
/* PROBE NEAR THE ANSWER, NOT FAR BELOW IT. Three bounces in a row
   landed 2.5 to 3dB hot because the first probe sat at -12, where this
   piece measures about -33 LUFS. Integrated loudness is GATED, so down
   there a dynamic piece has its quiet half excluded from the figure
   and the trim-to-loudness slope reads about 0.6; up where the track
   actually lives it is 0.99. The solver learned the wrong slope in the
   blind spot, extrapolated, hit the +12 cap and overshot — and the
   limiter then took six decibels of crest off a piece whose whole
   point is its dynamics. Starting close means the first slope it
   measures is the one that applies. */
let trim=8, m=null, lo=null, hi=null;   /* lo: too quiet, hi: too loud */
for(let pass=0; pass<4; pass++){
  await call('set',{mTrim:+trim.toFixed(1)});
  m=await call('render',{src:'song',loops:1,loudness:true});
  console.log('  trim '+trim.toFixed(1).padStart(6)+' -> '+m.lufs.toFixed(1)+' LUFS'
    +'  tp '+m.truePeakDb.toFixed(2)+'  crest '+m.crestDb.toFixed(1)
    +(m.clipping?'  CLIP':''));
  const err=TARGET_LUFS-m.lufs;
  if(Math.abs(err)<0.3) break;
  if(err>0) lo={t:trim,l:m.lufs}; else hi={t:trim,l:m.lufs};
  /* BRACKET AND INTERPOLATE once both sides are known, because the
     response is not a line. The limiter puts a knee in it: measured
     between trim 4.2 and 8 on this piece the slope is 2.21, and a
     solver that clamps slope to 1.2 — as the previous one did —
     overshoots straight back past the target and oscillates between
     the two points it has. Two points that straddle the answer are
     worth more than any assumption about the curve between them. */
  let next;
  if(lo && hi) next = lo.t + (hi.t-lo.t)*(TARGET_LUFS-lo.l)/(hi.l-lo.l);
  else next = trim + err/1.0;
  next=Math.max(-24, Math.min(12, next));
  if(Math.abs(next-trim)<0.15) break;
  trim=next;
}
/* TWO DIFFERENT FAILURES, and the first version of this message named
   only one of them. "Raise the pad gains, the master cannot recover
   what was never staged" is true when the trim has run out of range;
   it is nonsense when the trim is sitting at 7.4 with nearly five
   decibels still in hand, which is what it printed. There the solver
   simply ran out of passes, and the honest thing is to say which. */
if(m.lufs<TARGET_LUFS-1){
  if(trim>11.5) console.log('   !! '+(TARGET_LUFS-m.lufs).toFixed(1)
    +'dB under target and mTrim is at its +12 ceiling — raise the pad gains, '
    +'the master cannot recover what was never staged');
  else console.log('   !! '+(TARGET_LUFS-m.lufs).toFixed(1)+'dB under target, '
    +'trim '+trim.toFixed(1)+' with room to spare: the solver ran out of passes, '
    +'not out of headroom.\n      Worth asking whether the target is right before '
    +'chasing it — the last '+(12-trim).toFixed(1)+'dB of trim here is bought almost '
    +'entirely by the limiter, and crest went 17.4 at this level against 13.7 at the '
    +'top. For an atmospheric piece this may already be where it belongs.');
}
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
