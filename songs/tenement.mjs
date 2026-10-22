/* TENEMENT — 96bpm. Every sound in it is a real recording of something
   that is not a musical instrument: a door knock, a bunch of keys, a
   train, a fire, a pane of glass, a creaking hinge.

   WHY IT IS BUILT THE WAY IT IS. Six tracks before this one were made
   by loading a whole palette, writing every part, then setting all the
   levels at the end. That is backwards, and balance() is the proof —
   by the time everything is in, nine bands and seven groups interact,
   nothing moves without disturbing something else, and a solver has to
   be written to untangle a knot that did not have to be tied.

   This one is built one sound at a time: the song needs a sub, so the
   sub gets made — a source found, processed until it IS the sub, given
   its part, STAGED against a measured target, and checked with place()
   against everything already present — and only then does anything ask
   what comes next. Every reading is printed, so the log is a record of
   the method rather than a verdict delivered at the end.

   TWO THINGS THIS FOUND THE HARD WAY, both on the first real run.

   A FIELD RECORDING DOES NOT START WHEN THE FILE DOES. These are
   ESC-50 clips: every one is exactly five seconds long with the event
   somewhere inside it, and the manifest says where in `onset`. The
   keys begin 0.2s in. The first version of this track gave that pad an
   envelope of dec 0.17 and sus 0, so the gate opened on silence and
   shut again 30ms before the keys arrived — a full-scale sample that
   measured -70dB in the mix and read as "too quiet" when it was not
   quiet at all, it was absent. start is a fraction of the file, so it
   is onset/5 for all of these, and it is not optional.

   GAIN STOPS AT 2. Levels here are staged by measurement rather than
   taste: each pad is rendered alone, its peak read, and its gain set
   to hit a target. When the arithmetic asks for more than the cap the
   staging says so out loud instead of quietly maxing out, because a
   sound that cannot reach its target is the wrong sound for the job
   and no gain setting will fix it. The first version had a 57dB spread
   across seven pads, all set by ear, which is the trap this file's own
   header warned about.

   PITCH IS THREE EFFECTS, NOT ONE. The train drops fourteen semitones
   by varispeed, which slows it to 2.2x and stretches every grain of
   the rumble with it; that stretching is the depth, and a synthesised
   sine at the same pitch has the note and none of the substance. The
   glass moves by keepTime, so the line transposes without ever getting
   longer and the attacks stay where they were written. */

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

/* ONSET, AS A FRACTION OF A FIVE SECOND CLIP. Read from the manifest
   rather than guessed: this is the number that decides whether a pad
   plays the sound or the room tone in front of it. */
const CLIP=5.0;
const ONSET={ 'fk:knock2':0.14, 'fk:type':0.2, 'fk:fire':0.222,
  'dk:train':0.208, 'dk:glass':0.128, 'dk:creak':0.02 };
const startOf=id=>+( (ONSET[id]||0)/CLIP ).toFixed(4);

/* STAGE FROM A MEASURED PEAK, AND SAY SO WHEN IT CANNOT BE REACHED. */
const stage=async(pad,targetDb,label)=>{
  const cur=await call('pad',pad);
  const r=await call('render',{only:[pad], src:'pat', loops:1});
  const nowDb=20*Math.log10(Math.max(r.peak,1e-6));
  const want=(cur.gain==null?1:cur.gain)*Math.pow(10,(targetDb-nowDb)/20);
  const g=Math.max(0.005, Math.min(2, want));
  await call('pad',pad,{gain:+g.toFixed(3)});
  console.log('  stage '+label.padEnd(6)+' solo peak '+nowDb.toFixed(1).padStart(6)
    +'dB  target '+String(targetDb).padStart(4)+'dB  gain '+g.toFixed(2)
    +(want>2?('   CANNOT REACH IT — needs '+want.toFixed(1)+', cap is 2. '
      +'The sound is wrong for the job, not the level.'):''));
  return {nowDb, g, short:want>2};
};

/* TWO RENDERS, SO IT CAN BE RUN ON EVERY SOUND AS IT GOES IN. */
const placed=async(pad,label)=>{
  const r=await call('place',pad);
  const top=[...r.bands].sort((a,b)=>b.pad-a.pad).slice(0,3)
    .map(b=>b.band+' '+b.pad+'/'+(b.over>0?'+':'')+b.over).join('  ');
  console.log('  place '+label.padEnd(6)+' owns '+String(r.owns||'NOTHING').padEnd(9)
    +'by '+String(r.ownsBy==null?'--':r.ownsBy).padStart(6)+'dB  | loudest: '+top);
  console.log('         '+r.says.slice(0,116));
  return r;
};

await call('clear');
await call('set',{bpm:BPM});
const SUB=0, BODY=1, KICK=2, TICK=3, AIR=4, GLASS=5, HINGE=6;
const PLEN=32;

/* ---- 1. THE SUB. A train, dropped until it stops being a train ------- */
await call('pack','samples/darkkit.json');
await call('sound','dk:train',SUB);
await call('pad',SUB,{pitch:-14, keepTime:false, keepPitch:false, start:startOf('dk:train'),
  ftype:'lowpass', fcut:0.10, fres:0.6, drv:0.30,
  att:0.012, dec:1.4, sus:0.55, rel:0.5, gain:1.0, name:'sub (train)'});
await call('pattern',0,{plen:PLEN, clear:true});
const SUBH=[[0,0.95],[12,0.70],[20,0.85]];
await bat(SUBH.map(([s,v])=>['step',SUB,s,v]));
console.log('\n1. SUB — a train at -14 semitones, varispeed');
await stage(SUB,-6,'sub'); await placed(SUB,'sub');

/* ---- 2. THE BODY. The same train, the part a phone can hear ---------- */
/* Below about 400Hz nothing is reproduced on a small speaker, so a sub
   alone reads as "the bass isn't clear" rather than as quiet. A
   saturated parallel copy at 150-800Hz puts the harmonics where a
   phone can reproduce them and the ear infers the fundamental that is
   missing. cutHz(x) = 60*(16000/60)^x, so fcut 0.33 is 374Hz. */
await call('sound','dk:train',BODY);
await call('pad',BODY,{pitch:-14, start:startOf('dk:train'),
  ftype:'bandpass', fcut:0.33, fres:1.6, drv:0.72,
  att:0.004, dec:0.9, sus:0.40, rel:0.35, gain:0.5, eqLo:-6, name:'body (train)'});
await bat(SUBH.map(([s,v])=>['step',BODY,s,v]));
console.log('\n2. BODY — the same train, saturated into 150-800Hz');
await stage(BODY,-9,'body'); await placed(BODY,'body');

/* ---- 3. THE KICK. A door knock -------------------------------------- */
/* A knock already has the shape of a kick: one transient, a short
   woody body, no tail. It has to sit ABOVE the train rather than under
   it, which is what the target below is for. */
await call('pack','samples/foundkit.json');
await call('sound','fk:knock2',KICK);
await call('pad',KICK,{pitch:-5, start:startOf('fk:knock2'),
  ftype:'lowpass', fcut:0.30, drv:0.45,
  att:0.001, dec:0.30, sus:0.0, rel:0.12, gain:1.0, eqLo:+4, name:'kick (knock)'});
await bat([[0,1.0],[8,0.55],[16,0.95],[28,0.6]].map(([s,v])=>['step',KICK,s,v]));
console.log('\n3. KICK — a door knock at -5, hard envelope');
await stage(KICK,-3,'kick'); await placed(KICK,'kick');

/* ---- 4. THE TICK. Keys, backwards ----------------------------------- */
/* Reversed, so each jangle swells instead of striking. The envelope is
   long enough to actually contain the sound this time: the keys begin
   0.2s into the file and the previous version shut the gate at 0.17s. */
await call('sound','fk:type',TICK);
await call('pad',TICK,{pitch:5, reverse:true, start:startOf('fk:type'),
  ftype:'highpass', fcut:0.34, fres:0.8,
  att:0.004, dec:0.42, sus:0.0, rel:0.16, gain:0.5, eqHi:-3, dly:0.22, name:'tick (keys)'});
await bat([4,10,14,22,26,30].map(s=>['step',TICK,s,s%8===6?0.75:0.5]));
console.log('\n4. TICK — keys reversed, with an envelope that reaches the sound');
await stage(TICK,-14,'tick'); await placed(TICK,'tick');

/* ---- 5. THE AIR. A fire, held still --------------------------------- */
/* freeze() reads the spectrum at one instant and sustains it, so a
   crackle becomes a pad with no loop in it: nothing is replayed, it is
   what that moment was made of. Taken from 60% through, well clear of
   the 0.222s onset. */
await call('sound','fk:fire',AIR);
const fz=await call('freeze',AIR,{pad:AIR, at:0.60, seconds:7, partials:56,
  shimmer:9, name:'air (fire)'});
console.log('\n5. AIR — a fire frozen at one instant: '+String(fz.says||'').slice(0,88));
await call('pad',AIR,{ftype:'highpass', fcut:0.46, att:1.1, dec:2.4, sus:0.8, rel:2.4,
  gain:0.5, eqHi:-2, rev:0.34, name:'air (fire)'});
await bat([['step',AIR,0,0.6],['step',AIR,16,0.45]]);
await stage(AIR,-16,'air'); await placed(AIR,'air');

/* ---- 6. THE LEAD. Glass, moved without being stretched -------------- */
/* keepTime, so transposing shifts the pitch and leaves the length
   alone: the attacks stay exactly where they were written however far
   the line moves, which varispeed cannot do. note() addresses an
   instrument by name and this is a found sound on a bare pad, so the
   line is written as steps carrying a pitch lock in semitones — the
   same transposition through another door. */
await call('pack','samples/darkkit.json');
await call('sound','dk:glass',GLASS);
await call('pad',GLASS,{keepTime:true, start:startOf('dk:glass'),
  ftype:'bandpass', fcut:0.56, fres:1.1,
  att:0.004, dec:0.9, sus:0.25, rel:0.6, gain:0.8, rev:0.26, dly:0.18, name:'lead (glass)'});
const ROOT=69, LINE=[69,72,71,67,69,76,74,72];
await bat(LINE.map((n,k)=>['step',GLASS,k*4,k===0||k===5?0.9:0.62,{pitch:n-ROOT}]));
console.log('\n6. LEAD — glass shifted by keepTime, so it never gets longer');
await stage(GLASS,-10,'lead'); await placed(GLASS,'lead');

/* ---- 7. THE HINGE. A creak, run to tape ----------------------------- */
/* Everything this app makes is otherwise perfectly in tune for the
   whole length of a note, and nothing ever recorded was. */
await call('sound','dk:creak',HINGE);
const tp=await call('tape',HINGE,{pad:HINGE, wow:26, wowHz:0.7, flutter:7, flutterHz:6.4,
  drift:16, sat:0.4, hiLossHz:7200, hiss:0.004, name:'hinge (creak)'});
console.log('\n7. HINGE — a creak to tape: '+String(tp.says||'').slice(0,88));
await call('pad',HINGE,{start:startOf('dk:creak'), ftype:'bandpass', fcut:0.40, fres:1.4,
  att:0.03, dec:1.4, sus:0.3, rel:0.9, gain:1.0, rev:0.30, name:'hinge (creak)'});
await bat([['step',HINGE,6,0.55],['step',HINGE,24,0.7]]);
await stage(HINGE,-16,'hinge'); await placed(HINGE,'hinge');

/* ---- 8. FREE CHECKS, NOW, NOT AT THE END ---------------------------- */
const q=await call('review',{quick:true});
console.log('\nQUICK (no renders) — '+String(q.says||'').slice(0,110));
for(const f of (q.findings||[]).slice(0,5)) console.log('  ['+f.severity+'] '+f.says.slice(0,96));

/* ---- 9. THE ARRANGEMENT --------------------------------------------- */
/* Written from the same material rather than from new sounds, so none
   of it changes a relationship that has already been checked. */
const ALL=[...SUBH.map(([s,v])=>['step',SUB,s,v]), ...SUBH.map(([s,v])=>['step',BODY,s,v]),
  ...[[0,1.0],[8,0.55],[16,0.95],[28,0.6]].map(([s,v])=>['step',KICK,s,v]),
  ...[4,10,14,22,26,30].map(s=>['step',TICK,s,s%8===6?0.75:0.5]),
  ['step',AIR,0,0.6],['step',AIR,16,0.45],['step',HINGE,6,0.55],['step',HINGE,24,0.7]];

/* 1 — stripped to the floor. */
await call('pattern',1,{plen:PLEN, clear:true});
await bat([['step',SUB,0,0.9],['step',SUB,20,0.8],['step',BODY,0,0.9],['step',BODY,20,0.8],
  ['step',KICK,0,1.0],['step',KICK,16,0.9],['step',HINGE,24,0.6],['step',AIR,0,0.38]]);

/* 2 — the line inverted around its first note, the tick doubled. */
await call('pattern',2,{plen:PLEN, clear:true});
await bat(ALL);
await bat(LINE.map((n,k)=>['step',GLASS,k*4,k===3?0.92:0.6,{pitch:(ROOT*2-n)-ROOT}]));
await bat([2,8,12,18,24,28].map(s=>['step',TICK,s,0.44]));

/* 3 — everything, with the train doubled underneath. */
await call('pattern',3,{plen:PLEN, clear:true});
await bat(ALL);
await bat(LINE.map((n,k)=>['step',GLASS,k*4,k===0||k===5?0.9:0.62,{pitch:n-ROOT}]));
await bat([['step',SUB,26,0.8],['step',BODY,26,0.8],['step',KICK,22,0.7]]);

/* and pattern 0 gets the line too, now that it is staged */
await call('pattern',0,{});
await bat(LINE.map((n,k)=>['step',GLASS,k*4,k===0||k===5?0.9:0.62,{pitch:n-ROOT}]));

await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:1,reps:1},{pat:0,reps:2},{pat:2,reps:1},{pat:0,reps:1},
        {pat:3,reps:2},{pat:2,reps:1},{pat:3,reps:2},{pat:0,reps:1},{pat:1,reps:1}]});

/* ---- 10. WHAT THE WHOLE THING LOOKS LIKE ---------------------------- */
/* full:false, or `events` comes back as the entire array of them and
   prints as a wall of [object Object]. */
const sch=await call('schedule',{src:'song', full:false});
console.log('\n'+sch.events+' notes · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')
  +') · stretched '+JSON.stringify(sch.stretched||[]));

const lo=await call('loudness',{src:'song'});
console.log('\nbrightness (perceived minus measured):');
for(const g of (lo.pads||[]).slice(0,9))
  console.log('   '+String(g.name||('pad '+g.pad)).padEnd(16)
    +String(g.brightness).padStart(6)+'dB   lufs '+g.lufs);
console.log('   -> '+String(lo.says).slice(0,110));

const pu=await call('pulse',{src:'song'});
console.log('\npulse: autocorr '+pu.pulseStrength+'  beat '+pu.onGrid.beat
  +'%  sixteenth '+pu.onGrid.sixteenth+'%  buried-by '+pu.beatBuriedBy);
const tr=await call('translate',{src:'song'});
console.log('small speaker: '+String(tr.says).slice(0,130));

/* ---- 11. LEVEL BY MEASUREMENT, TWO RENDERS -------------------------- */
await call('set',{mTrim:-12, compAmt:0.14});
const probe=await call('render',{src:'song',loops:1,loudness:true});
const trim=Math.max(-30, Math.min(0, -12 + (TARGET_LUFS - probe.lufs)));
console.log('\nprobe -12 -> '+probe.lufs.toFixed(1)+' LUFS crest '+probe.crestDb.toFixed(1)
  +' -> trim '+trim.toFixed(1));
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
