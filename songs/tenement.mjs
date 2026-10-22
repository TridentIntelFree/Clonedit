/* TENEMENT — A minor, 96bpm. Every sound in it is a real recording of
   something that is not a musical instrument.

   WHY IT IS BUILT THE WAY IT IS. Six tracks before this one were made
   by loading a whole palette, writing every part, and then setting all
   the levels at the end. That is backwards, and balance() is the proof:
   by the time everything is in, nine bands and seven groups interact,
   nothing moves without disturbing something else, and a solver has to
   be written to untangle a knot that did not have to be tied.

   This one is built one sound at a time. The song needs a sub, so the
   sub gets made — a source found, processed until it IS the sub rather
   than a sample that will do, given its part, and checked against
   everything already present — and only then does anything ask what
   comes next. place() is the check: what band does this own, what is
   covering it, what is it covering. Every sound below is followed by
   its reading, and anything that owned nothing was fixed there and then
   rather than discovered seventeen minutes later in a full review.

   WHAT THE SOUNDS ARE. A door knock, a typewriter, a train, a fire, a
   pane of glass, a creaking hinge. Nothing here was played by a
   musician. Effects on a real recording are what give it depth: the
   room is already in the sample, along with the noise floor and the
   accidents, and no amount of additive synthesis puts those back. So
   the processing is heavy and the sources stay recognisable underneath
   — familiar enough to place, strange enough to be new.

   PITCH IS THREE DIFFERENT EFFECTS, NOT ONE. Dropping the train
   fourteen semitones by varispeed slows it to 2.2x length and thickens
   every detail with it, which is why a pitched-down recording reads as
   bigger rather than merely lower. The glass moves by keepTime, so it
   shifts without ever getting longer and the attacks stay where they
   were written. Both are used here deliberately, for what each does.

   THE TRAPS IT IS BUILT AGAINST, all of which cost a bounce before:
   the sub has a saturated parallel copy at 150-800Hz from the start,
   because below 400Hz nothing survives a phone; the air is checked
   against its own energy rather than trusted, because bright metal
   reads 10-15dB louder than any RMS meter says; levels are staged from
   measured peaks, because these sources differ by more than 30dB on
   disk and gain is a multiplier on whatever the pad holds. */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=96, TARGET_LUFS=-14.5;
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

/* THE CHECK THAT MAKES THIS METHOD AFFORDABLE. Two renders per sound,
   not one per pad, so it can be run on every one as it goes in. */
const placed=async(pad,label)=>{
  const r=await call('place',pad);
  console.log('  place '+label.padEnd(9)+' owns '+String(r.owns||'nothing').padEnd(10)
    +' by '+String(r.ownsBy).padStart(6)+'dB   '+r.says.slice(0,78));
  return r;
};

await call('clear');
await call('set',{bpm:BPM});
const SUB=0, BODY=1, KICK=2, TICK=3, AIR=4, GLASS=5, HINGE=6;

/* ---- 1. THE SUB. A train, dropped until it stops being a train ------- */
/* Varispeed, so the length goes with the pitch: fourteen semitones down
   is 2.24x slower, and every grain of the rumble is stretched with it.
   That stretching is the depth — a synthesised sine at the same pitch
   has the note and none of the substance. */
await call('pack','samples/darkkit.json');
await call('sound','dk:train',SUB);
await call('pad',SUB,{pitch:-14, keepTime:false, keepPitch:false,
  ftype:'lowpass', fcut:0.10, fres:0.6, drv:0.30,
  att:0.012, dec:1.4, sus:0.55, rel:0.5, gain:0.9, name:'sub (train)'});
await call('pattern',0,{plen:16, clear:true});
await bat([[ 'step',SUB,0,0.95],['step',SUB,6,0.70],['step',SUB,10,0.85]]);
console.log('\n1. SUB — a train at -14 semitones, varispeed');
await placed(SUB,'sub');

/* ---- 2. THE BODY. The same train, but the part a phone can hear ------ */
/* Below about 400Hz nothing is reproduced on a small speaker, so a sub
   on its own reads as "the bass isn't clear" rather than as quiet. The
   fix is a saturated parallel copy in 150-800Hz: the harmonics drive
   generates sit where a phone can actually put them, and the ear infers
   the fundamental that is missing. Built in now rather than bolted on
   after translate() complains, which is how the last three went. */
await call('sound','dk:train',BODY);
await call('pad',BODY,{pitch:-14, ftype:'bandpass', fcut:0.33, fres:1.8, drv:0.72,
  att:0.004, dec:0.9, sus:0.40, rel:0.35, gain:0.42, eqLo:-6, name:'body (train)'});
await bat([['step',BODY,0,0.95],['step',BODY,6,0.70],['step',BODY,10,0.85]]);
console.log('\n2. BODY — the same train, saturated into 150-800Hz');
await placed(BODY,'body');

/* ---- 3. THE KICK. A door knock -------------------------------------- */
/* A knock already has the shape of a kick: one transient, a short woody
   body, no tail. Five semitones down and a hard envelope is the whole
   trick, and it stays recognisably a door, which is the point. */
await call('pack','samples/foundkit.json');
await call('sound','fk:knock2',KICK);
await call('pad',KICK,{pitch:-5, ftype:'lowpass', fcut:0.30, drv:0.45,
  att:0.001, dec:0.26, sus:0.0, rel:0.12, gain:1.0, eqLo:+4, name:'kick (knock)'});
await bat([['step',KICK,0,1.0],['step',KICK,4,0.55],['step',KICK,8,0.95],['step',KICK,14,0.6]]);
console.log('\n3. KICK — a door knock at -5, hard envelope');
await placed(KICK,'kick');

/* ---- 4. THE TICK. A typewriter, backwards --------------------------- */
/* Reversed, so the click swells instead of striking: the most familiar
   sound in the pack becomes unplaceable while staying obviously
   mechanical. Deliberately quiet. Bright transients read 10-15dB
   louder than they measure, and three tracks in a row have been bounced
   with the air sitting +12dB above its own energy because that was
   judged at the end instead of here. */
await call('sound','fk:type',TICK);
await call('pad',TICK,{pitch:7, reverse:true, ftype:'highpass', fcut:0.46, fres:0.8,
  att:0.002, dec:0.17, sus:0.0, rel:0.07, gain:0.30, eqHi:-3, dly:0.22, name:'tick (type)'});
await bat([2,5,7,11,13,15].map(s=>['step',TICK,s,s%4===3?0.75:0.5]));
console.log('\n4. TICK — a typewriter reversed, kept quiet on purpose');
await placed(TICK,'tick');

/* ---- 5. THE AIR. A fire, held still --------------------------------- */
/* freeze() reads the spectrum at one instant and sustains it, so a
   crackle becomes a pad with no loop in it — nothing is replayed, it is
   what that moment was made of. A fire is broadband noise with
   structure, which is exactly what makes a usable shimmer and exactly
   what an oscillator cannot fake. */
await call('sound','fk:fire',AIR);
const fz=await call('freeze',AIR,{pad:AIR, at:0.45, seconds:6.5, partials:48,
  shimmer:9, name:'air (fire)'});
console.log('\n5. AIR — a fire frozen at one instant: '+String(fz.says||'').slice(0,90));
await call('pad',AIR,{ftype:'highpass', fcut:0.30, att:1.1, dec:2.0, sus:0.8, rel:2.2,
  gain:0.26, eqHi:-4, rev:0.34, name:'air (fire)'});
await bat([['step',AIR,0,0.6],['step',AIR,8,0.45]]);
await placed(AIR,'air');

/* ---- 6. THE LEAD. Glass, moved without being stretched -------------- */
/* keepTime, so transposing it shifts the pitch and leaves the length
   alone: the attacks stay exactly where they were written however far
   the line moves, which varispeed cannot do. srcNote tells the sampler
   what it is holding so note() can be used at all. */
await call('pack','samples/darkkit.json');
await call('sound','dk:glass',GLASS);
await call('pad',GLASS,{srcNote:69, keepTime:true, ftype:'bandpass', fcut:0.56, fres:1.1,
  att:0.004, dec:0.8, sus:0.25, rel:0.6, gain:0.55, rev:0.26, dly:0.18, name:'lead (glass)'});
const LINE=[69,72,71,67,69,76,74,72];
await bat(LINE.map((n,k)=>['note',GLASS,n,k*2,k===0||k===5?0.9:0.62]));
console.log('\n6. LEAD — glass shifted by keepTime, so it never gets longer');
await placed(GLASS,'lead');

/* ---- 7. THE HINGE. A creak, run to tape ----------------------------- */
/* Everything this app makes is otherwise perfectly in tune for the
   whole length of a note, and nothing ever recorded was. Wow sags it,
   flutter roughens it, drift wanders off and does not come back. */
await call('sound','dk:creak',HINGE);
const tp=await call('tape',HINGE,{pad:HINGE, wow:26, wowHz:0.7, flutter:7, flutterHz:6.4,
  drift:16, sat:0.4, hiLossHz:7200, hiss:0.004, name:'hinge (creak)'});
console.log('\n7. HINGE — a creak to tape: '+String(tp.says||'').slice(0,90));
await call('pad',HINGE,{ftype:'bandpass', fcut:0.40, fres:1.4, att:0.03, dec:1.2,
  sus:0.3, rel:0.9, gain:0.34, rev:0.30, name:'hinge (creak)'});
await bat([['step',HINGE,3,0.55],['step',HINGE,12,0.7]]);
await placed(HINGE,'hinge');

/* ---- 8. FREE CHECKS, NOW, NOT AT THE END ---------------------------- */
const q=await call('review',{quick:true});
console.log('\nQUICK (no renders) — '+String(q.says||'').slice(0,110));
for(const f of (q.findings||[]).slice(0,5)) console.log('  ['+f.severity+'] '+f.says.slice(0,96));

/* ---- 9. THE ARRANGEMENT --------------------------------------------- */
/* Each pattern is written from the same material rather than from new
   sounds, so nothing below changes a relationship that has already been
   checked. Variation in what plays, not in what the sounds are. */

/* 1 — stripped to the floor: train, knock, one hinge. */
await call('pattern',1,{plen:16, clear:true});
await bat([['step',SUB,0,0.9],['step',SUB,10,0.8],
  ['step',BODY,0,0.9],['step',BODY,10,0.8],
  ['step',KICK,0,1.0],['step',KICK,8,0.9],
  ['step',HINGE,12,0.6],['step',AIR,0,0.38]]);

/* 2 — the lead inverted around its first note, and the tick doubles. */
await call('pattern',2,{plen:16, clear:true});
await bat([['step',SUB,0,0.95],['step',SUB,6,0.7],['step',SUB,10,0.85],
  ['step',BODY,0,0.95],['step',BODY,6,0.7],['step',BODY,10,0.85],
  ['step',KICK,0,1.0],['step',KICK,4,0.55],['step',KICK,8,0.95],['step',KICK,14,0.6],
  ['step',AIR,0,0.6],['step',HINGE,3,0.5]]);
await bat(LINE.map((n,k)=>['note',GLASS,69*2-n,k*2,k===3?0.92:0.6]));
await bat([1,4,6,9,12,14].map(s=>['step',TICK,s,0.44]));

/* 3 — everything, with the train doubled underneath. */
await call('pattern',3,{plen:16, clear:true});
await bat([['step',SUB,0,0.95],['step',SUB,6,0.7],['step',SUB,10,0.85],['step',SUB,13,0.8],
  ['step',BODY,0,0.95],['step',BODY,6,0.7],['step',BODY,10,0.85],['step',BODY,13,0.8],
  ['step',KICK,0,1.0],['step',KICK,4,0.55],['step',KICK,8,0.95],['step',KICK,11,0.7],
  ['step',KICK,14,0.6],
  ['step',AIR,0,0.6],['step',AIR,8,0.45],['step',HINGE,3,0.55],['step',HINGE,12,0.7]]);
await bat(LINE.map((n,k)=>['note',GLASS,n,k*2,k===0||k===5?0.9:0.62]));
await bat([2,5,7,11,13,15].map(s=>['step',TICK,s,s%4===3?0.75:0.5]));

await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:1,reps:1},{pat:0,reps:1},{pat:2,reps:1},{pat:0,reps:1},
        {pat:3,reps:1},{pat:2,reps:1},{pat:3,reps:1},{pat:1,reps:1}]});

/* ---- 10. WHAT THE WHOLE THING LOOKS LIKE ---------------------------- */
const sch=await call('schedule',{src:'song'});
console.log('\n'+sch.events+' notes · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')
  +') · stretched '+JSON.stringify(sch.stretched||[]));

/* THE BELLS TRAP, CHECKED RATHER THAN HOPED FOR. brightness is
   perceived minus measured: anything well above the rest of the column
   will read as loud however tidy its RMS looks, and that is what put
   the air +12.9dB out on the last three bounces. */
const lo=await call('loudness',{src:'song'});
console.log('\nbrightness (perceived minus measured):');
for(const g of (lo.pads||[]).slice(0,9))
  console.log('   '+String(g.name||('pad '+g.pad)).padEnd(16)
    +String(g.brightness).padStart(6)+'dB   lufs '+g.lufs);
console.log('   → '+String(lo.says).slice(0,110));

const pu=await call('pulse',{src:'song'});
console.log('\npulse: autocorr '+pu.pulseStrength+'  beat '+pu.onGrid.beat
  +'%  sixteenth '+pu.onGrid.sixteenth+'%  buried-by '+pu.beatBuriedBy);
const tr=await call('translate',{src:'song'});
console.log('small speaker: '+String(tr.says).slice(0,130));

/* ---- 11. LEVEL BY MEASUREMENT, TWO RENDERS -------------------------- */
await call('set',{mTrim:-12, compAmt:0.14});
const probe=await call('render',{src:'song',loops:1,loudness:true});
const trim=Math.max(-30, Math.min(0, -12 + (TARGET_LUFS - probe.lufs)));
console.log('\nprobe -12 → '+probe.lufs.toFixed(1)+' LUFS crest '+probe.crestDb.toFixed(1)
  +' → trim '+trim.toFixed(1));
await call('set',{mTrim:+trim.toFixed(1)});
const m=await call('render',{src:'song',loops:1,loudness:true});
console.log('   '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
  +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'tenement.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
