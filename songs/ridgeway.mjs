/* RIDGEWAY — D minor, 96bpm, about 1:20.
   =====================================

   The first track here whose NOTES were not written by me.

   Every previous one failed in the same way and the listener named it
   in six words: "drone machine noise". The reason was in the score,
   not the mix. MERIDIAN's bass held one pitch — 55Hz — for two
   minutes seventeen, and five of its six pads never changed note at
   all. A static bass under a looping figure is a drone by
   construction, and no amount of spectral measurement sees that,
   because nothing in this app measures whether the harmony moves.

   So the composition comes from magenta's chord_pitches_improv, which
   writes a melody against a stated chord progression. Two phrases
   were generated, fourteen candidates each, and chosen for variety
   rather than for obedience to the folksong norm:

     A   over Dm Bb F  C    23 notes, 9 distinct, 16 semitones
     B   over Dm Bb A7 Dm   20 notes, 9 distinct, 17 semitones

   Both leap more than sung folksong does (45% and 32% against Essen's
   13.1%), and that is not a defect: Avril 14th's right hand measures
   56.9% here. The Essen norm describes singing, and this is keyboard
   writing.

   The bass takes the root of each bar straight from the progression.
   It is four notes rather than one, which is the whole difference.

   AND THE SOUNDS ARE DELIBERATELY PLAIN. Piano for the tune, a short
   plucked bass, a knock for the pulse. Not because exotic sound
   design is wrong, but because the question this track exists to
   answer is whether the WRITING is any good, and a frozen rain pad
   under a tape-warped bell would hide the answer either way. The
   previous tracks were all texture and no tune; this one is the
   opposite on purpose.

   Envelopes are short everywhere. Four of MERIDIAN's six sounds had
   sustain above 0.3 and ran into each other; nothing here sustains
   past a beat. */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=96, TARGET_LUFS=-15.5;
const P=JSON.parse(readFileSync(OUT+'songs/parts-ridgeway.json','utf8'));

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
/* select, then write — configuring a pattern does not select it, and
   three tracks were bounced with their arrangement in the wrong one */
const usePattern=async(n,props)=>{
  const r=await call('pattern',n,Object.assign({select:true},props||{}));
  if(r.warning) throw new Error('pattern '+n+': '+r.warning);
  if(r.selected!==true) throw new Error('pattern '+n+' did not become selected');
  return r; };

await call('clear');
await call('set',{bpm:BPM});
const PLEN=64;                       /* four bars of sixteenths */

/* ---- THE SOUNDS, kept plain and short -------------------------------- */
/* bass: painted, fundamental modest so it carries on a small speaker,
   and an envelope that closes well inside the bar so the roots are
   heard as separate notes rather than as one held tone */
await call('paint',{pad:0, midi:50, seconds:1.4, name:'bass', seed:21,
  partials:[{hz:73.4,  level:0.30, at:0, dur:1.00},
            {hz:146.8, level:1.00, at:0, dur:0.80},
            {hz:220.0, level:0.70, at:0, dur:0.60},
            {hz:293.7, level:0.45, at:0, dur:0.42},
            {hz:440.0, level:0.22, at:0, dur:0.26}]});
await call('pad',0,{inst:'bass', srcNote:50, keepTime:true,
  att:0.004, dec:0.9, sus:0.22, rel:0.5, gain:0.8,
  ftype:'lowpass', fcut:0.46, drv:0.12, name:'bass'});

/* lead: a real piano, because the question is whether the tune works
   and an unfamiliar timbre would mask the answer */
await call('instrument','piano',{pack:'samples/salamander.json',
  match:'^sal:', lo:57, hi:84, max:10});
const pianoPads=(await call('instPads','piano')).map(x=>x.pad);
for(const pd of pianoPads)
  await call('pad',pd,{att:0.002, dec:1.1, sus:0.0, rel:0.35, gain:0.55,
    rev:0.16, name:'piano'});

/* pulse: a door knock, short, just enough to carry time */
await call('pack','samples/foundkit.json');
await call('sound','fk:knock2',40);
/* the first bounce had no findable pulse at all — loudness-weighted
   onsets autocorrelated at 0.007 — because the knock sat under a
   piano playing twenty-three notes a phrase. It carries the time, so
   it has to be the loudest thing on the beat, not a garnish. */
await call('pad',40,{inst:'drums', pitch:-4, start:0.028,
  ftype:'lowpass', fcut:0.55, drv:0.35,
  att:0.001, dec:0.22, sus:0.0, rel:0.08, gain:1.4, eqLo:0, eqMid:+2, name:'kick'});

/* ---- THE PHRASES ------------------------------------------------------ */
const writePhrase=async(patIdx, ph, dense)=>{
  await usePattern(patIdx,{plen:PLEN, clear:true});
  /* bass: one root per bar, four distinct notes. The last one is held
     to the end of the pattern — the first bounce left a one-second
     hole at the close of every phrase, six times in seventy seconds,
     because the written material stopped around step 57 of 64 and
     nothing covered the rest. */
  await bat(ph.bass.map((b,i)=>['note','bass', b.midi, b.step,
    i===ph.bass.length-1?0.95:0.9]));
  /* melody */
  await bat(ph.melody.filter(n=>n.step<PLEN)
    .map(n=>['note','piano', n.midi, n.step, n.step%4===0?0.85:0.62]));
  /* pulse on the beat, and through the final bar so the phrase does
     not fall silent before the next one starts */
  const hits=dense ? [0,8,16,24,32,40,48,56,60] : [0,16,32,48,56,60];
  await bat(hits.map(s=>['step',40,s,s%16===0?1.0:(s>=56?0.55:0.6)]));
};

await writePhrase(0, P.A, true);     /* A — full */
await writePhrase(1, P.B, true);     /* B — full */
await writePhrase(2, P.A, false);    /* A — sparse, for the opening */

await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:2,reps:1},{pat:0,reps:1},{pat:1,reps:1},
        {pat:0,reps:1},{pat:1,reps:1},{pat:0,reps:1},{pat:2,reps:1}]});

const sch=await call('schedule',{src:'song', full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')+')');
console.log('chords  A: '+P.A.chords.join(' ')+'   B: '+P.B.chords.join(' '));
console.log('bass moves through '+new Set(P.A.bass.concat(P.B.bass)
  .map(b=>b.midi)).size+' distinct pitches  (MERIDIAN: 1)');

/* the free checks — these read the schedule, so they see the writing */
const q=await call('review',{quick:true});
console.log('\nQUICK — '+String(q.says||'').slice(0,160));
for(const f of (q.findings||[]).slice(0,4)) console.log('  ['+f.severity+'] '+f.says.slice(0,100));

/* ---- LEVEL, TWO RENDERS ----------------------------------------------- */
await call('set',{mTrim:-12, compAmt:0.08});
const probe=await call('render',{src:'song',loops:1,loudness:true});
const trim=Math.max(-30, Math.min(0, -12 + (TARGET_LUFS - probe.lufs)));
console.log('\nprobe -12 -> '+probe.lufs.toFixed(1)+' LUFS -> trim '+trim.toFixed(1));
await call('set',{mTrim:+trim.toFixed(1)});
const m=await call('render',{src:'song',loops:1,loudness:true});
console.log('   '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
  +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'ridgeway.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
