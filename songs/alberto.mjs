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
const OUT='/home/user/Clonedit/', BPM=150, TARGET_LUFS=-14.0;
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

/* ---- THE LEAD: A TUNED KALIMBA ---------------------------------------
   Chosen off samples/atlas-vcsl-mallets.json by its numbers, not its
   name. `airVsBody` is the column that decided it: kalimbt is +2.8dB,
   meaning it has about as much above 2kHz as below 500 — it will read
   over a break without being shrill. The alternatives measure badly for
   this job in both directions. `vibh` is +9.1 and is the instrument
   AGENTS.md calls the dullest in the library; `glock` is +35.7, which
   is all air and no note. kalimbt also peaks at -2.7dBFS, so it stages
   without going anywhere near the gain cap, and owns 500Hz-1k, which is
   where a tune lives and where this break has nothing.

   audit-pitch.mjs reads it +0.1 semitones with 100% agreement across
   five picks, so the declared notes are the real ones. That check is
   not optional on a sampled pack — VSCO-2 names every file an octave
   out and a whole repo of string parts played a register high before
   anyone measured it.                                                 */
await call('pack','samples/vcsl-mallets.json');
const lead=await call('instrument','lead',{pack:'samples/vcsl-mallets.json',
  match:'^vc:kalimbt', lo:67, hi:85});
const leadPads=await call('instPads','lead');
console.log('lead: '+leadPads.length+' pads, worst bend '+lead.worstBend+' st');

/* THE WOBBLE GOES HERE AND NOT ON THE DRUMS. tape() flattens a pad to
   one buffer, which is fatal to a velocity-layered kit and harmless to
   a single-sample mallet. Wow is slow and heard as the pitch sagging,
   flutter is fast and heard as roughness; both small, because a real
   machine is subtle and because every pad gets its own random phase,
   so the instrument detunes against itself rather than as a block.

   TAPE() DE-REGISTERS THE INSTRUMENT, and nothing says so. instPads()
   finds a pad by `inst === name && bufId >= 0 && srcNote != null`, and
   tape() ends by calling loadIntoTarget(), which resets the pad in
   place — clearing both. Its own next line tries to put srcNote back:

       if(p.srcNote!=null) S.pads[target].srcNote=p.srcNote;

   but `p` IS S.pads[target], already reset, so the guard reads null
   and the restore silently does nothing. The pad keeps its taped audio
   and stops being part of the instrument, and the failure surfaces
   much later as `no instrument "lead" — call instrument() first` from
   the first note() call, which looks like the instrument() call was
   missing rather than undone. So the mapping is captured here first
   and put back by hand.                                              */
const leadRoot=new Map(leadPads.map(x=>[x.pad, x.note!=null?x.note:x.root]));
for(const x of leadPads)
  await call('tape',x.pad,{wow:11, wowHz:0.55, flutter:3.0, flutterHz:6.5,
    drift:7, sat:0.22, hiLossHz:9500, seed:(x.pad*2654435761)>>>8});
for(const x of leadPads)
  await call('pad',x.pad,{gain:0.78, att:0.004, dec:3.2, sus:0, rel:0.5,
    pan:0.10, rev:0.30, dly:0.26, inst:'lead', srcNote:leadRoot.get(x.pad)});
const leadBack=await call('instPads','lead');
if(leadBack.length!==leadPads.length)
  throw new Error('tape() cost the lead '+(leadPads.length-leadBack.length)
    +' of its '+leadPads.length+' pads — the instrument is incomplete');
console.log('lead: taped, '+leadBack.length+' pads still registered');

/* ---- THE BASS --------------------------------------------------------
   A plucked synth bass at C2, so the transpositions this part asks for
   are -5 to +2 semitones rather than the +7 to +14 an FM bass at C1
   would have needed. Under it a sine sub doubling the same root.

   Those are two DIFFERENT recordings, which is why they are allowed to
   be layered at all: AGENTS.md's cancellation trap is about one source
   split by two filters, where the filters' group delay makes the copies
   fight. Checked anyway, further down.

   The pluck is what makes the bass survive a phone. A sine sub at 60Hz
   is felt on a big speaker and simply absent on a small one, and the
   complaint that produces is "the bass isn't clear" rather than "the
   bass is quiet". The pluck's harmonics are the part that carries. */
const BASSPAD=20, SUBPAD=21;
await call('pack','samples/manifest.json');
await call('sound','studio:bass_pluck_c2',BASSPAD);
await call('sound','studio:bass_sub_c1',SUBPAD);
/* sound() sets no `inst`, and three calls filter on exactly that tag —
   motif(), counterpoint() and balance() go silent rather than failing.
   TENEMENT lost all three this way. Group by the JOB, not the source. */
await call('pad',BASSPAD,{gain:0.95, att:0.002, dec:0.9, sus:0.15, rel:0.18,
  pan:0, rev:0.05, dly:0, drv:0.16, inst:'bass'});
await call('pad',SUBPAD, {gain:0.60, att:0.004, dec:0.8, sus:0.10, rel:0.15,
  pan:0, rev:0,    dly:0, inst:'bass'});
const BASS_ROOT=36, SUB_ROOT=24;   // the pitch each sample was recorded at

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

/* ---- THE HARMONY, DECLARED ------------------------------------------
   Nothing in this app stores a progression — pads hold samples,
   patterns hold steps, and there is no key written anywhere. So it is
   written here, and harmony() is handed it below. It must not be
   inferred from the notes, because inferring the harmony from the
   notes is exactly what makes a wrong note look correct.

   D major, read from its relative minor. Each pattern carries its own
   four bars, so the progression follows the arrangement instead of
   fighting it, and every pattern is harmonically closed — it can be
   dropped anywhere in the song and still make sense. The F#7 at the
   end of pattern 1 is the one piece of real harmonic colour: V of vi,
   pulling back to the Bm7 that opens almost everything else.        */
const PROG={
  0:['Bm7','Gmaj7','Dmaj7','A'],      // the statement
  1:['Bm7','Gmaj7','Dmaj7','F#7'],    // same, turned toward the relative minor
  2:['Em7','Gmaj7','Dmaj7','A'],      // the air section lifts to ii
  3:['Bm7','F#7','Gmaj7','A'],        // the mangle moves twice as fast
  4:['Bm7','Gmaj7','Dmaj7','A'],      // intro
  5:['Bm7','Gmaj7','Dmaj7','A'],      // outro
};
const BROOT={ 'Bm7':35, 'Gmaj7':31, 'Dmaj7':38, 'A':33, 'F#7':30, 'Em7':28 };
/* the fifth, and a step that lands IN the next chord */
const BFIFTH={ 'Bm7':42, 'Gmaj7':38, 'Dmaj7':45, 'A':40, 'F#7':37, 'Em7':35 };

/* ---- THE BASS FIGURE -------------------------------------------------
   Root on one, root again on the and-of-two, the fifth, then one note
   approaching the next bar's root. A chromatic approach is correct
   walking practice and the textbook reason it works is that it is
   SHORT — which is a claim about the INSTRUMENT, not the notation.
   HOLLOWAY put the same figure on a sampled piano with a 1.9-second
   decay and the approach note was still sounding two beats into the
   next chord; that was half of "distasteful chordage". This bass is a
   pluck with dec 0.9 and sus 0.15, so the note really is over before
   the bar turns, and the approach is honestly available here in a way
   it was not there.

   THE APPROACH IS CHOSEN AGAINST BOTH CHORDS, not just taken as the
   chromatic below the next root. `nr - 1` blindly is what the first
   version did, and an offline check of the written parts found it
   produced a semitone-above-a-chord-tone in twelve of twenty-four
   bars — A# over Dmaj7's A, G over Dmaj7's F#, G# over Gmaj7's G.
   Every one of them a non-chord tone that was a non-chord tone when
   struck, which is the rarest case in Bach's corpus (11.1% of his
   semitone clashes) and was most of what made HOLLOWAY sour.

   So: try the semitone and the whole tone from either side, and take
   the first that belongs to the chord it is heading into and does not
   rub the one it is still in. Fall back to the fifth below, which
   always works.

   PLAY THE THIRD, BUT NOT IN EVERY BAR. 94.6% of Bach's sonorities
   state one, and a root-fifth-octave bass states no quality at all —
   whatever chromatic is passing becomes the note that defines the
   chord. But making the bass arpeggiate root-third-fifth-approach in
   every single bar is the other failure, the one AGENTS.md calls an
   exercise rather than a part. So the bass plays the third only where
   nothing else in the bar states it, which in practice is the Bm7
   bars and the whole of the intro, where the bass is alone.       */
const PCS={ 'Bm7':[11,2,6,9], 'Gmaj7':[7,11,2,6], 'Dmaj7':[2,6,9,1],
            'A':[9,1,4], 'F#7':[6,10,1,4], 'Em7':[4,7,11,2] };
const pcOf=m=>((m%12)+12)%12;
const fits=(m,ch)=>PCS[ch].includes(pcOf(m));
const rubs=(m,ch)=>PCS[ch].some(t=>(pcOf(m)-t+12)%12===1);
const thirdOf=ch=>{ const t=PCS[ch];
  return [(t[0]+3)%12,(t[0]+4)%12].find(x=>t.includes(x)); };

const bassBar=(chord,nextChord,barIdx,melPcs)=>{
  const r=BROOT[chord], f=BFIFTH[chord], nr=BROOT[nextChord];
  const app = [nr-1, nr+1, nr-2, nr+2]
      .find(m=>fits(m,nextChord) && !rubs(m,chord))
    ?? [nr-1, nr+1, nr-2, nr+2].find(m=>!rubs(m,chord) && !rubs(m,nextChord))
    ?? nr-5;
  /* the third, an octave up so it is a voice rather than a muddy
     low-register interval — unless the tune already stated it */
  const third=thirdOf(chord);
  const second = melPcs.has(third) ? r : (()=>{
    let m=r; while(pcOf(m)!==third) m++; return m;   // the nearest third above
  })();
  const o=barIdx*16, ev=[];
  const hit=(p,st,v)=>{
    ev.push(['step',BASSPAD,o+st,v,{pitch:p-BASS_ROOT, nudge:groove(st)*0.5}]);
  };
  hit(r,0,0.90); hit(second,6,0.48); hit(f,10,0.56); hit(app,14,0.44);
  /* the sub takes the downbeat only — doubling the whole figure turns
     the bottom to mush at this tempo */
  ev.push(['step',SUBPAD,o+0,0.80,{pitch:BROOT[chord]-SUB_ROOT}]);
  ev.push(['step',SUBPAD,o+10,0.42,{pitch:BROOT[chord]-SUB_ROOT}]);
  return ev;
};

/* ---- THE TUNE --------------------------------------------------------
   Simple on purpose. The break is the intricate thing in this track
   and two intricate things at once is mud — the tune's job is to be
   the one element a listener can hold on to. Four pitches a bar at
   most, a two-bar motif that comes straight back, and the whole line
   inside an octave and a half.

   Every note is a chord tone or a scale tone a whole step from one.
   Checked below rather than asserted: harmony() flags a pitch sounding
   a SEMITONE ABOVE a chord tone, which is the interval Bach's chorales
   avoid (1.08% of 179,005 voice-pairs) while using the tritone at
   3.9%. The rule is the minor ninth, not "outside the chord".        */
const MEL={
  /* [midi, step, velocity, beats] per bar */
  0:[[[78,0,.62,1.5],[81,6,.54,0.75],[78,10,.50,1.0]],
     [[74,0,.58,1.5],[71,8,.48,1.25]],
     [[78,0,.60,0.75],[76,6,.50,0.75],[74,10,.56,1.5]],
     [[73,0,.58,2.0],[76,10,.46,1.25]]],
  1:[[[78,0,.62,1.5],[81,6,.54,0.75],[78,10,.50,1.0]],
     [[74,0,.58,1.5],[71,8,.48,1.25]],
     [[78,0,.60,0.75],[76,6,.50,0.75],[74,10,.56,1.5]],
     [[70,0,.60,1.5],[73,8,.52,1.75]]],          // A# is F#7's third
  2:[[[83,0,.58,1.0],[81,6,.52,0.75],[79,10,.50,1.0]],
     [[78,0,.60,2.0],[74,12,.46,1.0]],
     [[81,0,.56,0.75],[78,6,.50,0.75],[76,10,.52,1.5]],
     /* D over A is a 4-3 appoggiatura and harmony() flags it, correctly:
        D is a semitone above C#, the third. It STAYS. It is short, it
        falls by step onto the C# it was leaning on, and that lean is
        the most expressive moment in the tune. "A check reports
        something and the musical answer is that it is fine as it is"
        is a legitimate answer; moving it to clear the flag would be
        the Goodhart failure this repo already paid for once. */
     [[74,0,.58,1.5],[73,8,.54,2.0]]],
  3:[[[78,0,.56,0.75],[74,10,.48,1.0]],          // fragmented under the mangle
     [[73,0,.54,1.75]],
     [[71,0,.52,0.75],[74,8,.50,1.25]],
     [[73,0,.56,0.75],[69,8,.58,2.25]]],
  4:[[],[],[],[]],                               // intro: drums and bass only
  5:[[[78,0,.50,2.0],[74,8,.44,2.0]],            // outro: the motif, thinning
     [[74,0,.46,2.0],[71,8,.40,2.0]],
     [[78,0,.42,2.0]],
     [[73,0,.38,3.5]]],
};
/* The hands come apart. The tune sits a consistent ~35ms behind the
   bass, which is heard as phrasing; the same displacement applied at
   random is heard as a player who cannot keep time. */
const melBar=(pat,barIdx)=>(MEL[pat][barIdx]||[]).map(([m,st,v,b])=>
  ['note','lead',m,barIdx*16+st,v,{beats:b, nudge:0.09+(rnd()*2-1)*0.02}]);

/* every voice for one pattern: pass the drum bars, get the rest free */
const voices=(pat)=>{
  const ch=PROG[pat], out=[];
  for(let b=0;b<4;b++){
    const melPcs=new Set((MEL[pat][b]||[]).map(n=>pcOf(n[0])));
    out.push(...bassBar(ch[b], ch[(b+1)%4], b, melPcs));
    out.push(...melBar(pat,b));
  }
  return out;
};

/* ---- PATTERN 0: the break, barely touched --------------------------- */
await usePattern(0,{plen:64, clear:true});
await bat([
  ...at(bar(ORDERS.plain), 0),
  ...at(bar(ORDERS.plain,{stut:{15:2}}), 1),
  ...at(bar(ORDERS.stick), 2),
  ...at(bar(ORDERS.plain,{stut:{12:2,15:3}, bend:{14:-2}}), 3),
  ...voices(0),
]);

/* ---- PATTERN 1: chopped --------------------------------------------- */
await usePattern(1,{plen:64, clear:true});
await bat([
  ...at(bar(ORDERS.halves,{stut:{4:2}}), 0),
  ...at(bar(ORDERS.stumble,{bend:{8:3}}), 1),
  ...at(bar(ORDERS.back,{stut:{0:2,15:2}}), 2),
  ...at(bar(ORDERS.run,{stut:{14:3}, bend:{4:-3,12:2}}), 3),
  ...voices(1),
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
  ...voices(2),
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
  ...voices(3),
]);

/* ---- PATTERN 4: the intro -------------------------------------------
   The break and the bass, no tune. Four bars of establishing what the
   rhythm is before anything is asked of the listener melodically.   */
await usePattern(4,{plen:64, clear:true});
await bat([
  ...at(bar(ORDERS.plain,{drop:[2,7,10,14], lift:-0.10}), 0),
  ...at(bar(ORDERS.plain,{drop:[7,14], lift:-0.06}), 1),
  ...at(bar(ORDERS.plain), 2),
  ...at(bar(ORDERS.stick,{stut:{15:2}}), 3),
  ...voices(4),
]);

/* ---- PATTERN 5: the outro -------------------------------------------
   The tune alone over the thinnest the break gets, then nothing. The
   bass drops out for the last bar so the final kalimba note is the
   only thing left ringing.                                           */
await usePattern(5,{plen:64, clear:true});
await bat([
  ...at(bar(ORDERS.plain,{drop:[1,2,3,5,7,9,10,11,13,14,15], lift:-0.22}), 0),
  ...at(bar(ORDERS.plain,{drop:[1,2,3,5,6,7,9,10,11,13,14,15], lift:-0.28}), 1),
  ...at(bar(ORDERS.plain,{drop:[1,2,3,5,6,7,9,10,11,12,13,14,15], lift:-0.34}), 2),
  ...voices(5).filter(e=>!(e[1]===BASSPAD&&e[2]>=48)&&!(e[1]===SUBPAD&&e[2]>=48)),
]);

/* ---- THE ARRANGEMENT -------------------------------------------------
   Phrase lengths are deliberately not all the same — AGENTS.md records
   that HOLLOWAY was eight phrases of exactly four bars and read as
   four-square however the surface was dressed. In Bach's chorales the
   commonest phrase length accounts for under 40% of phrases. These run
   8, 8, 4, 8, 12, 4, 8, 8, 4 bars.                                     */
const SONG=[{pat:4,reps:1},                      //  4 — drums and bass only
            {pat:0,reps:2},                      //  8 — the tune enters
            {pat:1,reps:2},                      //  8 — chopped, turned to F#7
            {pat:2,reps:1},                      //  4 — air, the tune up high
            {pat:0,reps:1},{pat:1,reps:1},
            {pat:3,reps:1},                      // 12 — into the mangle
            {pat:2,reps:1},                      //  4 — air again, early
            {pat:1,reps:2},                      //  8
            {pat:0,reps:1},{pat:3,reps:1},       //  8
            {pat:5,reps:1}];                     //  4 — out
await call('set',{pattern:0, songOn:true, songLoop:false, song:SONG});

const sch=await call('schedule',{src:'song', full:false});
console.log('\n'+sch.notes+' hits · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')+')');

/* ---- THE FREE CHECKS -------------------------------------------------
   All five apply now that the track has pitched material, and all five
   render nothing — they read the schedule the app already knows. Run
   them before the twenty-minute half, not after.

   The progression has to be handed over in song order, because each
   pattern carries its own four bars and the song repeats them in a
   sequence only this script knows.                                    */
const CHORDS=[]; for(const s of SONG)
  for(let r=0;r<s.reps;r++) CHORDS.push(...PROG[s.pat]);
console.log('\n'+CHORDS.length+' bars of harmony, '
  +new Set(CHORDS).size+' distinct chords');

const ha=await call('harmony',{src:'song', chords:CHORDS, beatsPerBar:4});
console.log('harmony: '+ha.minorNinths.length+' minor ninths, '
  +ha.barsWithNoThird.length+'/'+ha.bars+' bars with no third, '
  +ha.carriedConsonant+' notes ring consonantly across a bar line');
for(const f of (ha.findings||[]).slice(0,4)) console.log('   ! '+f.says);
if(!ha.findings||!ha.findings.length) console.log('   -> '+String(ha.says).slice(0,130));

for(const inst of ['lead','bass']){
  const me=await call('melody',inst,{src:'song'});
  const mo=await call('motif',inst,{src:'song'});
  console.log(inst+': '+(me&&me.ran===false
    ? 'melody REFUSED — '+String(me.says).slice(0,90)
    : 'steps '+(me&&me.stepwisePct)+'% leaps '+(me&&me.leapPct)
      +'% repeats '+(me&&me.repeatedPct)+'%')
    +' | motif '+(mo&&mo.ran===false ? 'REFUSED' : (mo&&mo.score)));
}
const cp=await call('counterpoint',['lead','bass'],{src:'song'});
console.log('counterpoint lead/bass: oblique '+(cp&&cp.obliquePct)
  +'% (Palestrina 68%)  parallel '+(cp&&cp.parallelPct)+'%');

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
writeFileSync(OUT+'alberto.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('   '+wav.lufs.toFixed(1)+' LUFS  tp '+wav.truePeakDb.toFixed(2)
  +'  crest '+wav.crestDb.toFixed(1)+(wav.clipping?'  CLIP':''));
console.log('WAV alberto.wav '+(wav.bytes/1048576).toFixed(1)+'MB · '
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
   whole mix louder.

   A sampled instrument is one sound across many pads, so the lead goes
   in by its TAG. Handed a single pad it would render one kalimba note
   and set it against the other six notes of the same kalimba, which is
   how a piano trio's melody once read -6.1dB — meaning absent — in a
   mix where the piano was the loudest thing in the room.            */
console.log('\nwhere each sound sits:');
const PLACES=[['kick',padOf[KICK]],['snare',padOf[SNARE]],['hats',padOf[HAT]],
              ['tom',padOf[TOM]],['ride',padOf[RIDE]],
              ['lead','lead'],['bass',[BASSPAD,SUBPAD]]];
for(const [nm,what] of PLACES){
  const pl=await call('place',what,{src:'song'});
  console.log('   '+nm.padEnd(6)+'owns '+String(pl.owns).padEnd(9)
    +'by '+String(pl.ownsBy).padStart(6)+'dB   weakest '+pl.weakest);
}

/* DOES THE BASS SURVIVE A PHONE. The one fault in this repo that is
   pure physics: below ~400Hz nothing is reproduced on a small speaker,
   so a sub with no harmonics is felt on a big system and simply gone
   on a phone — which reads as "the bass isn't clear", not "quiet". */
const tr=await call('translate',{src:'song'});
for(const s of (tr.systems||[]))
  console.log('   '+String(s.system).padEnd(9)+'loses '+String(s.lostDb).padStart(5)+'dB');
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
await browser.close(); srv.close();
