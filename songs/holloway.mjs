/* HOLLOWAY — A minor, 92bpm, about 1:25. Piano trio.
   ==================================================

   Written by following AGENTS.md as if the app were new, to find out
   whether the file actually works. What it told me to do, in order:

     howto() first. Its `first` list leads with composition, which is
     the right order and was not always.

     Check the pack is what it claims. Both manifests here name a URL
     per sample, which the file gives as the tell for a real library
     against a generated one: salamander has up to 6 velocity layers
     per note, nakeddrums up to 5.

     Write music, not texture. The melody comes from magenta's
     chord_pitches_improv over a progression that moves — A over
     Am F C G, B over Am Dm E7 Am — best of sixteen draws per phrase,
     because the same seed and temperature vary enormously.

     Real instruments need real samples, and what makes them real is
     velocity layers, so both are loaded with instrument() rather than
     sound(): velocity picks a different recording, not the same one
     louder.

     One sound at a time: stage it, see where it sits, then the next.

     pattern(n, {select:true}) and assert it took.

   WHERE THE FILE LET ME DOWN, recorded because the next reader will
   hit it too:

     It says to load a reference before judging tone, and that having
     none is worse than having an imperfect one. The only profile in
     the repo is an ambient hall measured at -27dB in 20-60Hz. Matched
     against that, a piano trio would be told to delete its bass —
     which is the failure the same file warns about two sections
     later. So no reference is loaded here and compare() does not run.
     The gap is that samples/ref-*.json holds one genre.

     howto().says read "Make one sound, place() it, then make the
     next" — the old mixing-first summary, so an agent that reads only
     that one line gets none of `first`. Fixed; it now leads with the
     writing.

     place() and audit() took a pad index, and a sampled instrument is
     a pad per note. The headline method — place() each sound as it
     goes in — therefore measured one note of the piano against the
     other ten notes of the same piano, and reported the melody as
     owning nothing. Fixed; they take an instrument tag.

     audit-pitch.mjs condemned salamander, which is correct, because
     two of its three picks were the top and bottom notes its detector
     cannot hear. Fixed; five picks, and an outlier only counts as a
     second naming convention if it lands near an octave.

     melody(), motif() and counterpoint() take the instrument
     POSITIONALLY. The MCP tools take {instrument}, and copying that
     shape into a browser call returns "no instrument [object Object]"
     — which this script did on its first pass, so all three melodic
     checks silently measured nothing.

     Nothing measures whether the piece goes anywhere. The first
     bounce sat between -17.8 and -19.7dB for its whole length and
     verify-bounce called that "ok level varies 2dB", because it tests
     for a hole and a flat piece has no hole. See the dynamics note
     further down.

   WHAT IS STILL WRONG WITH IT, left in rather than quietly dropped:

     melody('rh') ends at "steps 26.9% against 46.9% in real melody" —
     the tune leaps where a tune mostly walks. That is a property of
     the draw, not of the arrangement: chord_pitches_improv varies
     enormously between generations, 12% leaps on one and 40% on the
     next, and the fix is to generate more candidates and select on
     step fraction rather than to edit this one. Four iterations was
     enough for one track.

     melody('lh') reports 0% repeated notes against a 21.1% norm,
     which is the check being run on the wrong thing: those norms come
     from 8,514 folk MELODIES and a walking bass is not one. Reading
     it as a fault would mean making the bass repeat notes to match a
     statistic about tunes.

   THE INSTRUMENT. Piano for both hands and a recorded kit — no
   synthesis anywhere. Not because synthesis is wrong but because the
   previous tracks drowned the writing in sound design, and the point
   of this one is to hear whether the writing stands up. */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=92, TARGET_LUFS=-16.0;
const P=JSON.parse(readFileSync(OUT+'songs/parts-holloway.json','utf8'));
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

/* micro-timing from the corpus, as the file prescribes */
const R=G.relative_to_own_mean;
const SLOT=[R['beat (1/4)'].mean_frac16, R['e (1/16)'].mean_frac16,
            R['and (1/8)'].mean_frac16, R['a (1/16)'].mean_frac16];
let rs=0x5A17E;
const rnd=()=>{ rs^=rs<<13; rs^=rs>>>17; rs^=rs<<5; return ((rs>>>0)/4294967296); };
const groove=(st)=>+(SLOT[st%4]+(rnd()*2-1)*0.012).toFixed(4);

const stage=async(pads,targetDb,label)=>{
  const r=await call('render',{only:pads, src:'pat', loops:1});
  const now=20*Math.log10(Math.max(r.peak,1e-6));
  const cur=await call('pad',pads[0]);
  const want=(cur.gain==null?1:cur.gain)*Math.pow(10,(targetDb-now)/20);
  const g=Math.max(0.005,Math.min(2,want));
  for(const p of pads) await call('pad',p,{gain:+g.toFixed(3)});
  console.log('  stage '+label.padEnd(6)+' solo '+now.toFixed(1).padStart(6)+'dB -> '
    +String(targetDb).padStart(4)+'dB  gain '+g.toFixed(2)
    +(want>2?'   CANNOT REACH — the sound is wrong for the job, not the level':''));
};

await call('clear');
await call('set',{bpm:BPM});
const PLEN=64;

/* ---- THE SOUNDS: real libraries, loaded so velocity layers work ------
   The ranges come from the parts, not from taste: the generated melody
   spans midi 55-83 and the bass 40-50, so asking for more than that
   spends pads on notes nothing plays. Salamander is sampled every minor
   third with six dynamics per note, and instrument() puts those six on
   ONE pad as velocity layers rather than six pads. */
const mel=[].concat(P.A.melody,P.B.melody).map(n=>n.midi);
const bas=[].concat(P.A.bass,P.B.bass).map(n=>n.midi);
await call('instrument','rh',{pack:'samples/salamander.json',
  match:'^sal:', lo:Math.min(...mel)-2, hi:Math.max(...mel)+2});
/* the left hand plays root, fifth and octave, so its range is the roots
   plus an octave and a little — not the roots. Sized from the roots
   alone, every octave landed above the top pad and was dropped. */
await call('instrument','lh',{pack:'samples/salamander.json',
  match:'^sal:', lo:Math.min(...bas)-2, hi:Math.max(...bas)+14});
await call('instrument','kit',{pack:'samples/nakeddrums.json',
  match:'^nd:', lo:36, hi:51});
const rh=(await call('instPads','rh')).map(x=>x.pad);
const lh=(await call('instPads','lh')).map(x=>x.pad);
const kit=(await call('instPads','kit')).map(x=>x.pad);
console.log('rh '+rh.length+' pads · lh '+lh.length+' · kit '+kit.length
  +'   (all from libraries that name a URL per sample)');
for(const p of rh) await call('pad',p,{att:0.002, dec:1.6, sus:0.0, rel:0.5,
  gain:0.6, rev:0.18});
for(const p of lh) await call('pad',p,{att:0.003, dec:1.9, sus:0.0, rel:0.6,
  gain:0.6, rev:0.10, eqHi:-3});
for(const p of kit) await call('pad',p,{att:0.0005, dec:6, sus:1, rel:0.3, gain:1.0});
const KICK=36, SNARE=37, HAT=39, TOM=48, RIDE=51;

/* ---- THE PHRASES ------------------------------------------------------ */
/* DYNAMICS, WHICH NOTHING HERE ASKS FOR AND WHICH THE FIRST BOUNCE HAD
   NONE OF. verify-bounce prints a bar per ten seconds and the whole
   piece came out between -17.8 and -19.7dB: eighty-four seconds at one
   level. It passed — the checker's words are "ok level varies 2dB" —
   because 2dB is above the floor it tests for, and a flat arrangement
   is not a BROKEN one. It is just inert, and no meter here says so.

   The sparse pattern was supposed to be the quiet one and was not,
   because only the kit thinned: the piano played the same part at the
   same velocity in every section, and the piano is what you hear. So
   `vel` scales the written velocities, which on a sampled piano with
   six dynamics per note changes WHICH RECORDING plays, not just its
   level — a soft passage is a different sound, not a turned-down one.
   And the sparse sections drop the off-beat melody notes rather than
   merely playing them quietly. */
const writePhrase=async(idx, ph, kind, vel)=>{
  const V=(v)=>Math.max(0.05, Math.min(1, v*(vel==null?1:vel)));
  await usePattern(idx,{plen:PLEN, clear:true});
  /* LEFT HAND. The first version played the root of each bar and
     nothing else — four whole notes a phrase — and review({quick:true})
     named it before anything was rendered: "100% of the gaps in this
     part are the same length". That is the check doing its job. A root
     per bar makes the harmony move, which is the thing that matters
     most, and still leaves the part itself inert.

     So it walks: root on the downbeat, fifth, octave, then a chromatic
     approach into the next bar's root from whichever side is nearer.
     The gaps are 6, 4, 4, 2 rather than 16, 16, 16, 16. */
  const lhNotes=[];
  for(let b=0;b<ph.bass.length;b++){
    const r=ph.bass[b].midi, at=ph.bass[b].step;
    const next=ph.bass[(b+1)%ph.bass.length].midi;
    const lead=next-r>0 ? next-1 : next+1;
    /* OBLIQUE MOTION, which is what counterpoint() came back for.
       Walking under every bar put the reading at 0% oblique against
       68% in Palestrina, and its words were exact: "the voices are
       moving together: that is chords with a tune on top". Of course
       it was — both hands moved on every beat, so neither was ever
       the one holding still. Oblique motion is one voice moving while
       the other does not, and it cannot happen if nothing is held.

       So the left hand holds in the odd bars and walks in the even
       ones. The walk is still there, and there is now something for
       it to walk away from. */
    const walks = (b%2===1) && kind!=='sparse';
    if(!walks) lhNotes.push([r,at,0.74],[r+12,at+10,0.44]);
    else lhNotes.push([r,at,0.8],[r+7,at+6,0.46],[r+12,at+10,0.6],[lead,at+14,0.42]);
  }
  await bat(lhNotes.map(([m,st,v])=>['note','lh', m, st, V(v), {nudge:groove(st)}]));
  /* RIGHT HAND: the generated line, with repeated notes merged.
     chord_pitches_improv emits a pitch per step and happily writes the
     same one three times running — "G5 G5 E5 G5 G5 G5" is in phrase A
     as generated. Played literally that is a quaver hammering one key,
     and review({quick:true}) called it before anything was rendered:
     70% of the gaps the same length, so melody() declined to measure
     it at all. Merging a run into one longer note is what a player
     does with that line anyway.

     Merging alone was not enough and the measurement said so: 22 notes
     became 17 and the most common gap went from 74% to 69%, because
     what is left is still a quaver stream. chord_pitches_improv writes
     PITCHES, one per step, against the chord at that step; it does not
     write rhythm, and taking its step numbers as a rhythm is taking
     something it never claimed to give.

     So the pitches keep their BAR — that is what makes them the right
     notes for the chord — and are laid out on a rhythmic cell within
     it. Four cells, one per bar, so no two bars in a phrase scan the
     same.

     AND DO NOT MERGE ALL OF THEM. The first version removed every
     immediate repeat, which melody() caught straight away: repeated
     notes 1.6% against 21.1% in the Essen collection — "far fewer
     than a tune usually has". A tune repeats notes; what it does not
     do is hit the same key six times running. So a run is capped at
     two rather than collapsed to one, which lands the figure near the
     corpus instead of on the other side of it. */
  const CELLS=[[0,4,6,10,12,14],[0,3,6,8,12],[0,2,6,7,10,14],[0,4,8,10,11,12,14]];
  const line=[];
  let run=0;
  for(const n of ph.melody) if(n.step<PLEN){
    const prev=line[line.length-1];
    run = (prev && prev.midi===n.midi) ? run+1 : 0;
    if(run>=2) continue;                        // hold, do not restrike a third time
    line.push(n);
  }
  const timed=[];
  for(let bar=0; bar*16<PLEN; bar++){
    const inBar=line.filter(n=>n.step>=bar*16 && n.step<(bar+1)*16);
    const cell=CELLS[bar%CELLS.length];
    inBar.forEach((n,j)=>{
      const off = j<cell.length ? cell[j] : Math.min(15, cell[cell.length-1]+ (j-cell.length+1)*2);
      timed.push({midi:n.midi, step:bar*16+off});
    });
  }
  /* in a sparse section the line keeps only what lands on a beat, so
     the texture thins rather than merely quietens */
  const play=kind==='sparse' ? timed.filter(n=>n.step%4===0) : timed;
  await bat(play.map(n=>
    ['note','rh', n.midi, n.step,
     V(n.step%8===0?0.82:(n.step%4===0?0.66:0.54)), {nudge:groove(n.step)}]));
  /* kit: under the piano, not in front of it. Velocity does real work
     here — nakeddrums has five layers on the kick and three on the rest,
     so a ghost at 0.14 and an accent at 0.9 are different recordings of
     a stick hitting a drum. A snare part of nothing but backbeats throws
     that away and sounds like a machine however it is timed. */
  const k=(midi,st,v)=>['note','kit',midi,st,V(v),{nudge:groove(st)}];
  const ride=[];
  for(let st=0; st<PLEN; st+=4) ride.push(k(RIDE,st,st%16===0?0.46:0.26));
  const ghost=[6,14,22,30,38,46,54,62].map(st=>k(SNARE,st,0.14));
  const fill=[48,50,52,53,55,57,58,60,61,62,63].map((st,i)=>
    k(i%3===1?TOM:SNARE, st, 0.3+i*0.055));
  await bat(kind==='full' ? [
    ...[0,16,32,48].map(st=>k(KICK,st,0.76)),
    ...[10,42].map(st=>k(KICK,st,0.4)),
    ...[8,24,40,56].map(st=>k(SNARE,st,0.62)),
    ...ghost, ...ride,
  ] : kind==='fill' ? [
    ...[0,16,32].map(st=>k(KICK,st,0.76)),
    ...[8,24].map(st=>k(SNARE,st,0.62)),
    ...ghost.filter(x=>x[3]<40), ...ride.filter(x=>x[3]<48),
    ...fill, k(KICK,63,0.5),
  ] : [
    ...[0,32].map(st=>k(KICK,st,0.62)),
    k(RIDE,0,0.3), k(RIDE,32,0.26), k(SNARE,24,0.2),
  ]);
};

/* six patterns rather than four, because the arc needs its own slots:
   the same phrase played at three dynamics is three patterns here, and
   on a six-dynamic sampled piano it is three different recordings. */
await writePhrase(0, P.A, 'full',   1.00);
await writePhrase(1, P.B, 'full',   1.00);
await writePhrase(2, P.A, 'sparse', 0.62);  /* the opening */
await writePhrase(3, P.B, 'fill',   1.00);  /* the peak */
await writePhrase(4, P.A, 'full',   0.80);  /* on the way up */
await writePhrase(5, P.A, 'sparse', 0.46);  /* the exit, quietest */

/* stage against the main groove, not whichever pattern was written last */
await usePattern(0);
await stage(rh,-9,'rh'); await stage(lh,-11,'lh'); await stage(kit,-13,'kit');

/* 1d — does each sound have somewhere to live. What to read is ownsBy:
   negative by more than about 6dB means the sound owns nothing
   anywhere, which is not a level problem.

   BY INSTRUMENT NAME, NOT BY PAD. The first version of this passed one
   pad from each group, because that is what place() took and what
   AGENTS.md shows. A sampled piano is eleven pads, so that rendered one
   note of the piano and set it against the other ten notes of the same
   piano: the melody of a piano trio came back owning nothing, by
   -6.1dB, in a mix where the piano is the loudest thing in the room.
   Taking the middle pad of the kit was worse — it landed on a hi-hat
   this part never plays and the call threw. place() now accepts the
   instrument tag and treats the whole group as the sound. */
for(const name of ['rh','lh','kit']){
  const pl=await call('place', name);
  console.log('place '+name.padEnd(4)+' ('+pl.pads.length+' pads) owns '
    +String(pl.owns).padStart(9)+' by '+String(pl.ownsBy).padStart(6)
    +'dB   weakest '+pl.weakest);
  if(pl.findings && pl.findings.length) console.log('        '+pl.findings[0].slice(0,110));
}

await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:2,reps:1},{pat:4,reps:1},{pat:1,reps:1},{pat:0,reps:1},
        {pat:3,reps:1},{pat:0,reps:1},{pat:1,reps:1},{pat:5,reps:1}]});

const sch=await call('schedule',{src:'song', full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')+')');
console.log('A: '+P.A.chords.join(' ')+'   B: '+P.B.chords.join(' '));

const q=await call('review',{quick:true});
console.log('\nQUICK — '+String(q.says||'').slice(0,150));
for(const f of (q.findings||[]).slice(0,6)) console.log('  ['+f.severity+'] '+f.says.slice(0,110));
if(q.notApplicable) for(const n of q.notApplicable.slice(0,4))
  console.log('  [could not apply] '+String(n.says||n).slice(0,100));

/* the free checks, named rather than summarised — these are the ones
   that measure the WRITING, against corpora rather than against taste */
const pu=await call('pulse',{src:'song'});
console.log('\npulse    autocorr '+pu.pulseStrength+'  beat '+pu.onGrid.beat
  +'%  buried-by '+pu.beatBuriedBy);
for(const name of ['rh','lh']){
  try { const me=await call('melody', name, {src:'song'});
    console.log('melody '+name+'  '+String(me.says||'').slice(0,105)); } catch(e){
    console.log('melody '+name+'  — '+String(e.message).slice(0,80)); }
  try { const mo=await call('motif', name, {src:'song'});
    console.log('motif  '+name+'  '+String(mo.says||'').slice(0,105)); } catch(e){
    console.log('motif  '+name+'  — '+String(e.message).slice(0,80)); }
}
try { const cp=await call('counterpoint', ['rh','lh'], {src:'song'});
  console.log('counterpoint '+String(cp.says||'').slice(0,115)); } catch(e){
  console.log('counterpoint — '+String(e.message).slice(0,80)); }

/* ---- STEP 3: the full review, which is the expensive half ------------
   The documented order says to run this once everything is in and each
   sound already fits, and to expect it mostly to confirm. compare() is
   not among what it can run here: the repo's only reference profile is
   an ambient hall at -27dB in the sub, and a piano trio matched to
   that would be told to delete its left hand. So tonal balance is NOT
   checked on this track, and that is a gap in the repo rather than a
   decision about the music. */
const rv=await call('review',{src:'song'});
console.log('\nREVIEW — '+String(rv.says||''));
for(const f of (rv.findings||[]).slice(0,8))
  console.log('  ['+f.severity+'] '+String(f.says).slice(0,120));
/* skipped is a list of strings, "name — why" */
for(const s of (rv.skipped||[]).slice(0,6)) console.log('  [skipped] '+String(s).slice(0,110));

/* ---- LEVEL. mTrim is clamp(want,-24,12) — it goes to +12 ------------- */
await call('set',{mTrim:-12, compAmt:0.08, mCeil:-2.0});
const probe=await call('render',{src:'song',loops:1,loudness:true});
const wanted=-12 + (TARGET_LUFS - probe.lufs);
const trim=Math.max(-24, Math.min(12, wanted));
console.log('\nprobe -12 -> '+probe.lufs.toFixed(1)+' LUFS -> trim '+trim.toFixed(1));
if(wanted>12.01) console.log('   !! wanted '+wanted.toFixed(1)+'dB; the pads are staged too quiet');
await call('set',{mTrim:+trim.toFixed(1)});
const m=await call('render',{src:'song',loops:1,loudness:true});
console.log('   '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
  +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'holloway.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
