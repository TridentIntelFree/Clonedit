/* ALBERTO — the break. 150bpm, drums only, about a minute and three quarters.
   =========================================================================

   WHAT THIS IS. The first stage of a track written toward "Alberto
   Balsalm": a sweet, simple tune over a break that will not sit still.
   This file is the break on its own, so it can be judged before
   anything is built on top of it.

   WHY THE BREAK IS WRITTEN AS A CHOP RATHER THAN AS A PATTERN.

   Every drum part in this repo so far was PROGRAMMED — each bar written
   out as a set of positions, and variation produced by writing a
   different set. That is how a drum machine works and it is not how
   this music was made. The method being imitated is: take ONE bar of a
   recorded break, cut it into sixteen slices, and play the slices in a
   different order. The difference is audible and it is structural:

     - a programmed variation invents new material, so bar 9 shares
       nothing with bar 1 except a style;
     - a chopped variation RE-USES the same sixteen slices, so every bar
       is recognisably the same break and none of them is the same bar.

   That second thing is most of why a chopped break sounds coherent
   while being relentlessly varied. It is also why the fills do not
   sound like fills: there is no separate fill material, only the same
   slices hit in an order that happens to run downhill.

   So SOURCE below is one bar — the break — and every bar in the piece
   is an ORDER over its slices, plus three things a sampler does to a
   slice and a drummer cannot:

     stutter   the same slice retriggered 2-4 times inside its step
               (`rat`), which is the hardware repeat on a chopped pad
     pitch     the slice played back at another rate (`pitch`), which
               is what moving a chop to a different key does to it
     drop      the slice simply not played, leaving the hole

   WHAT IS NOT DONE TO IT, AND WHY.

   tape() was the obvious call here and is wrong on this kit. It reads
   one buffer off the pad, wobbles it and writes it back — and these
   pads are not one buffer. The kick alone is five velocity layers by
   three round robins, fifteen separate recordings of a beater hitting
   a head, and that layering is the single thing that makes this kit
   sound like drums rather than like a drum machine (it took the crest
   from 14.4 to 18.3 when it replaced a synthesised kit). Flattening
   fifteen recordings to one wobbled copy would buy a tape artefact and
   spend the entire reason for using the kit.

   The wobble belongs on the melodic parts, where it is the point, and
   it will go there. The dirt the break does get is `drv` and `crush` on
   the cymbals only — a sampler's own quantisation noise, which lands on
   the top end and leaves the kick and snare alone.

   MICRO-TIMING is the corpus figure, as in kitwork: samples/groove-
   norms.json, 1,150 human performances, offsets per metrical position.
   Do not look for it in pulse() — its grid tolerance is 40ms at this
   tempo and these offsets are single-figure milliseconds, so a human
   drummer scores 100% there too.                                       */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=150, TARGET_LUFS=-15.0;
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
  if(props&&props.plen&&r.plen!==props.plen)
    throw new Error('pattern '+n+' is '+r.plen+' steps, asked for '+props.plen);
  return r; };

let rs=0xA1BE27;
const rnd=()=>{ rs^=rs<<13; rs^=rs>>>17; rs^=rs<<5; return ((rs>>>0)/4294967296); };
const pick=a=>a[Math.floor(rnd()*a.length)%a.length];

/* ---- MICRO-TIMING FROM THE CORPUS ------------------------------------ */
const R=G.relative_to_own_mean;
const SLOT=[R['beat (1/4)'].mean_frac16, R['e (1/16)'].mean_frac16,
            R['and (1/8)'].mean_frac16, R['a (1/16)'].mean_frac16];
const groove=(step)=>+(SLOT[step%4]+(rnd()*2-1)*0.012).toFixed(4);

await call('clear');
await call('set',{bpm:BPM});
await call('pack','samples/nakeddrums.json');

/* ---- THE KIT ---------------------------------------------------------
   Wilkinson Audio's Naked Drums: kick 36 (5 velocity layers x 3 round
   robins), snare 37, hats 39, tom 48, ride 51. Written at the sampled
   roots only, so no pitch-bend is asked of any pad except where a chop
   deliberately asks for one.                                           */
await call('instrument','kit',{pack:'samples/nakeddrums.json',
  match:'^nd:', lo:36, hi:51});
const pads=await call('instPads','kit');
const padOf={};
for(const x of pads){ const root=(x.root!=null?x.root:(x.note!=null?x.note:x.midi));
  if(root!=null) padOf[root]=x.pad; }
const KICK=36, SNARE=37, HAT=39, TOM=48, RIDE=51;
for(const r of [KICK,SNARE,HAT,TOM,RIDE])
  if(padOf[r]==null) throw new Error('no pad for root '+r+' — got '+JSON.stringify(pads));
console.log('kit: '+pads.length+' pads, roots '+Object.keys(padOf).join(' '));

/* envelope: let the kick and snare ring, cut the cymbals shorter than a
   drummer would so the chop reads as a chop */
for(const x of pads) await call('pad',x.pad,{gain:1.0, att:0.0004, sus:1, dec:6, rel:0.25});
await call('pad',padOf[KICK], {gain:1.30, pan: 0.00, rev:0.04, dly:0.00});
await call('pad',padOf[SNARE],{gain:1.05, pan:-0.04, rev:0.17, dly:0.05});
await call('pad',padOf[TOM],  {gain:0.85, pan: 0.22, rev:0.20, dly:0.04});
/* the sampler's own grain, on the top end only — gently. The first
   pass ran crush 11 on ten hat strokes a second and the result was
   the brightest and loudest thing in the piece. */
await call('pad',padOf[HAT],  {gain:0.50, pan: 0.17, rev:0.10, dly:0.03,
  dec:1.1, rel:0.08, drv:0.10, crush:13});
await call('pad',padOf[RIDE], {gain:0.42, pan:-0.20, rev:0.14, dly:0.04,
  dec:2.2, rel:0.12, drv:0.08, crush:13});

/* ---- THE SOURCE BREAK ------------------------------------------------
   One bar, sixteen slices. Everything in the piece is this, reordered.

   It is written as a drummer would play it and not as a grid: the kick
   is on 1 with a push before the and-of-2, the backbeats are on 4 and
   12, and between them run ghost strokes at 0.14-0.2 — quiet enough to
   pick the softest recording in the sampler rather than the loud one
   turned down, which is the whole argument for a velocity-layered kit.

   Slice 0 carries the downbeat, so an order that does not start with 0
   starts the bar somewhere other than the beginning. That is the single
   most characteristic thing a chop does.

   THE HATS ARE NOT ON EVERY SIXTEENTH, and the first version of this
   had them there. At 150bpm that is ten hat strokes a second, an
   unbroken hiss that turned out to be the loudest thing in the track —
   the ride and hats integrated 16-20dB above the kick, which read as
   a kick problem and was a hat problem. A funk break's hat plays
   eighths with the odd doubled sixteenth, and the HOLES are what the
   ghost snares speak through. Ten strokes a bar, not sixteen.        */
const SOURCE=[
/* 0 */ [[KICK,0.97],[HAT,0.60]],
/* 1 */ [],
/* 2 */ [[SNARE,0.17],[HAT,0.30]],
/* 3 */ [],
/* 4 */ [[SNARE,0.93],[HAT,0.50]],
/* 5 */ [],
/* 6 */ [[KICK,0.54],[HAT,0.32]],
/* 7 */ [[SNARE,0.15],[HAT,0.22]],   // the doubled sixteenth, pushing to 8
/* 8 */ [[KICK,0.80],[HAT,0.56]],
/* 9 */ [],
/*10 */ [[SNARE,0.19],[HAT,0.33]],
/*11 */ [[KICK,0.44]],
/*12 */ [[SNARE,0.95],[HAT,0.52]],
/*13 */ [],
/*14 */ [[SNARE,0.21],[HAT,0.34]],
/*15 */ [[HAT,0.28]],                // and the pickup into the next bar
];

/* ---- WHAT A SAMPLER DOES TO A SLICE ----------------------------------
   `order` says which source slice plays at each of the sixteen steps.
   `stut` maps a step to a retrigger count, `bend` a step to semitones,
   `drop` is the set of steps left empty. A chop is all four at once.

   Ghost strokes are never stuttered and never bent: at 0.15 they are
   already the quietest recording in the pack, and retriggering one
   produces a flam nobody can hear. The stutters land on the backbeat
   and on the last slice of the bar, which is where a hardware repeat
   button actually gets pressed.                                        */
const bar=(order,o={})=>{
  const {stut={}, bend={}, drop=[], lift=0} = o;
  const out=[];
  for(let st=0; st<16; st++){
    if(drop.includes(st)) continue;
    const cell=SOURCE[order[st]%16];
    for(const [drum,v0] of cell){
      const lk={ nudge:groove(st) };
      const vel=Math.max(0.06, Math.min(0.99, v0*(1+lift)));
      if(stut[st] && v0>0.3 && drum!==HAT) lk.rat=stut[st];
      if(bend[st] && v0>0.3) lk.pitch=bend[st];
      /* a bent slice goes through the pad directly, because the notes
         lane reads midi as the pitch and would fight the lock */
      out.push(lk.pitch!=null
        ? ['step', padOf[drum], st, vel, lk]
        : ['note', 'kit', drum, st, vel, lk]);
    }
  }
  return out;
};
/* offset a bar's worth of events into a 64-step pattern */
const at = (evs,barIdx)=>evs.map(e=>{ const c=e.slice(); c[2]=c[2]+barIdx*16; return c; });

const STRAIGHT=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
/* the orders. Each is a real cut-and-rearrange of the same sixteen
   slices — second half first, a four-slice group repeated, the bar
   started from its back end. None of them invents a hit. */
const ORDERS={
  plain:  STRAIGHT,
  halves: [8,9,10,11,12,13,14,15, 0,1,2,3,4,5,6,7],
  stick:  [0,1,2,3, 4,5,6,7, 0,1,2,3, 12,13,14,15],
  back:   [12,13,14,15, 0,1,2,3, 8,9,10,11, 4,5,6,7],
  stumble:[0,1,2,3, 8,9,4,5, 6,7,10,11, 12,13,2,15],
  drag:   [0,0,1,2, 4,4,5,6, 8,8,9,10, 12,12,14,15],
  run:    [0,4,8,12, 1,5,9,13, 2,6,10,14, 3,7,11,15],
  tail:   [0,1,2,3, 4,5,6,7, 12,13,14,15, 12,13,14,15],
};

/* ---- PATTERN 0: the break, barely touched --------------------------- */
await usePattern(0,{plen:64, clear:true});
await bat([
  ...at(bar(ORDERS.plain), 0),
  ...at(bar(ORDERS.plain,{stut:{15:2}}), 1),
  ...at(bar(ORDERS.stick), 2),
  ...at(bar(ORDERS.plain,{stut:{12:2,15:3}, bend:{14:-2}}), 3),
]);

/* ---- PATTERN 1: chopped --------------------------------------------- */
await usePattern(1,{plen:64, clear:true});
await bat([
  ...at(bar(ORDERS.halves,{stut:{4:2}}), 0),
  ...at(bar(ORDERS.stumble,{bend:{8:3}}), 1),
  ...at(bar(ORDERS.back,{stut:{0:2,15:2}}), 2),
  ...at(bar(ORDERS.run,{stut:{14:3}, bend:{4:-3,12:2}}), 3),
]);

/* ---- PATTERN 2: the room it needs -----------------------------------
   Not a different part — the same break with three quarters of it
   taken out, which is what a chop does when it wants air. The kick
   and the backbeat survive; the ghost strokes and most of the hats do
   not. A tom marks the bar instead of a cymbal.                        */
const SPARSE=[1,3,5,7,9,11,13,15];
await usePattern(2,{plen:64, clear:true});
await bat([
  ...at(bar(ORDERS.plain,{drop:SPARSE, lift:-0.18}), 0),
  ...at(bar(ORDERS.plain,{drop:[...SPARSE,2,10], lift:-0.18}), 1),
  ...at(bar(ORDERS.stick,{drop:SPARSE, lift:-0.12}), 2),
  ...at(bar(ORDERS.plain,{drop:[1,3,5,7,9,13], lift:-0.08, stut:{15:2}}), 3),
  ...at([[ 'note','kit',TOM, 24,0.52,{nudge:groove(8)}],
         ['note','kit',TOM, 56,0.60,{nudge:groove(8)}],
         ['note','kit',RIDE,32,0.44,{nudge:groove(0)}]].map(e=>e), 0),
]);

/* ---- PATTERN 3: the mangle ------------------------------------------
   The heaviest cutting in the piece, and still only the same sixteen
   slices. This is where the fills live — there is no fill material,
   just an order that runs downhill and a repeat button.                */
await usePattern(3,{plen:64, clear:true});
await bat([
  ...at(bar(ORDERS.drag,{stut:{4:2,12:2}, bend:{0:-1}}), 0),
  ...at(bar(ORDERS.run,{stut:{6:3,14:4}, bend:{8:4,10:-4}}), 1),
  ...at(bar(ORDERS.tail,{stut:{8:2,12:3}, bend:{12:2,14:5}}), 2),
  ...at(bar(ORDERS.back,{stut:{0:2,4:3,8:3,12:4}, bend:{4:-2,15:3}, lift:0.06}), 3),
]);

/* ---- THE ARRANGEMENT -------------------------------------------------
   Phrase lengths are deliberately not all the same — AGENTS.md records
   that HOLLOWAY was eight phrases of exactly four bars and read as
   four-square however the surface was dressed. In Bach's chorales the
   commonest phrase length accounts for under 40% of phrases. These run
   8, 8, 4, 8, 12, 4, 8, 8, 4 bars.                                     */
await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:0,reps:2},            //  8 — the break, stated
        {pat:1,reps:2},            //  8 — chopped
        {pat:2,reps:1},            //  4 — air
        {pat:0,reps:1},{pat:1,reps:1},
        {pat:3,reps:1},            // 12 — building to the mangle
        {pat:2,reps:1},            //  4 — air again, earlier than expected
        {pat:1,reps:2},            //  8
        {pat:0,reps:1},{pat:3,reps:1},
        {pat:2,reps:1}]});         //  4 — out

const sch=await call('schedule',{src:'song', full:false});
console.log('\n'+sch.notes+' hits · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')+')');

/* ---- THE FREE CHECKS -------------------------------------------------
   pulse() is the only one of the five that applies: motif(), melody()
   and counterpoint() measure pitched lines and this has none, and
   harmony() needs a progression there is no harmony to check against.
   Saying so beats letting them return nothing and reading that as a
   pass — which is the exact failure TENEMENT hit.                      */
const pu=await call('pulse',{src:'song'});
console.log('pulse: autocorr '+pu.pulseStrength+'  beat '+pu.onGrid.beat
  +'%  sixteenth '+pu.onGrid.sixteenth+'%  buried-by '+pu.beatBuriedBy);
console.log('   -> '+String(pu.says).slice(0,160));

const lo=await call('loudness',{src:'song'});
console.log('\nbrightness (perceived minus measured):');
for(const x of (lo.pads||[]).slice(0,8))
  console.log('   '+String(x.name||('pad '+x.pad)).padEnd(13)
    +String(x.brightness).padStart(6)+'dB  lufs '+x.lufs);

/* ---- LEVEL -----------------------------------------------------------
   Probe from definitely-too-quiet and solve, rather than laddering.
   A break is dense and runs hot; -12 is a safe probe.                   */
await call('set',{revLvl:0.30, delayFb:0.18, human:0.0, swing:0.0,
  mWidth:1.08, mAir:0.8, mMud:-1.2, compAmt:0.10, mCeil:-2.6});
await call('set',{mTrim:-12});
const probe=await call('render',{src:'song',loops:1,loudness:true});
const wanted=-12 + (TARGET_LUFS - probe.lufs);
const trim=Math.max(-24, Math.min(12, wanted));
console.log('\nprobe -12 -> '+probe.lufs.toFixed(1)+' LUFS -> trim '+trim.toFixed(1));
if(wanted>12.01) console.log('   !! wanted '+wanted.toFixed(1)
  +'dB, mTrim stops at +12 — the kit is staged '+(wanted-12).toFixed(1)
  +'dB below what the master can recover. Raise the pad gains.');
await call('set',{mTrim:+trim.toFixed(1)});

/* WRITE THE FILE BEFORE THE SLOW CHECKS. Two renders were lost here to
   container restarts that landed inside review(), each with every check
   printed and no file on disk. render() modifies nothing, so a bounce
   written now is byte-identical to one written after. */
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'alberto-drums.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('   '+wav.lufs.toFixed(1)+' LUFS  tp '+wav.truePeakDb.toFixed(2)
  +'  crest '+wav.crestDb.toFixed(1)+(wav.clipping?'  CLIP':''));
console.log('WAV alberto-drums.wav '+(wav.bytes/1048576).toFixed(1)+'MB · '
  +Math.floor(wav.seconds/60)+':'+String(Math.round(wav.seconds%60)).padStart(2,'0'));

/* ---- DOES EACH PIECE HAVE SOMEWHERE TO SIT --------------------------
   place() rather than the per-pad LUFS figures, which is the mistake
   the first pass made. Integrated LUFS conflates LOUD with FREQUENT —
   the hats fired sixteen times a bar against the kick's four, and
   K-weighting discounts 50Hz hard, so the kick read 20dB down and the
   obvious conclusion was that the kick needed raising. place() asks
   the question that actually matters: does this sound own a band.
   `ownsBy` positive means it has a place; negative by more than about
   6dB means it owns nothing anywhere, and raising it only makes the
   whole mix louder.                                                   */
console.log('\nwhere each piece sits:');
for(const [nm,root] of [['kick',KICK],['snare',SNARE],['hats',HAT],
                        ['tom',TOM],['ride',RIDE]]){
  const pl=await call('place',padOf[root],{src:'song'});
  console.log('   '+nm.padEnd(6)+'owns '+String(pl.owns).padEnd(9)
    +'by '+String(pl.ownsBy).padStart(6)+'dB   weakest '+pl.weakest);
}
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
await browser.close(); srv.close();
