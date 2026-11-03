/* LAMPLIGHT — C minor, 96bpm, 24 bars. Noir trio and a zither.
   ============================================================

   THE DECISION, BEFORE ANY NUMBER. A late-night trio: brushed kit, a
   sub under it, a bright upright piano carrying the tune, and a
   Vietnamese zither answering it from somewhere further back in the
   room. Slow enough to swing, harmony that moves — sevenths and
   secondary dominants rather than four chords going round.

   AND IT IS NOT HAND-BUILT, which is the point of the exercise. The
   parts come from the noir genre build: ensemble() writes the voices
   one at a time, foundation first, each against what the others
   already play; the progression comes from PROGS by family; the kit
   gets accents, ghost notes, a break and a fill; the arrangement is
   A B A B C B. Everything below that line is sample choice, staging
   and the master.

   WHY THESE SAMPLES, from samples/atlas-vcsl-wide.json rather than
   from their names:

     upright    142 samples  peak -12.3  air +22.3  owns 2k-4k
       The brightest thing in the library and it owns a band the bass
       has nothing in — 20-60Hz sits 23.6dB down on its own 2k-4k. A
       piano that leaves the low end alone is exactly what a track
       with a real sub wants, and it is the one choice here that is
       about what it does NOT cover.

     dantranh    48 samples  peak -17.0  decay 760ms  owns 500-1k
       A Vietnamese zither. Plucked, short-ringing, and it owns the
       midrange nobody else does — the piano is up at 2k-4k and the
       sub is under 120. Chosen over `harp`, which has a 3-second
       decay and would smear this tempo, and over `stein`, which owns
       60-120 and would be in the bass's way.

     nakeddrums  kick 36, snare 37, hats 39
       A genuinely recorded kit: five velocity layers by three round
       robins on the kick. That is the whole reason the generated
       accents and ghost notes mean anything — a ghost at 0.2 is a
       different recording of a stick, not the same waveform quieter.
       Only notes 36-39 are loaded, so the three pads are the three
       the kit writer expects and the tom and ride stay out of it.

     bass({style:'sub'})
       Synthesised on purpose. A found or sampled low end at this
       tempo would be a loud recording of something; this is built to
       be a sub and nothing else, which is what sits under a trio
       without arguing with the piano.

   THE KIT PADS ARE UNTAGGED DELIBERATELY. instrument() tags every pad
   it makes, and a tag is a VOICE to the genre build — tagged, the kit
   would have been written a melody. Untagged it is claimed as the
   kit, and the velocity layers survive untagging because they live on
   the pad and `inst` is only a label.                                */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync } from 'node:fs';

const OUT='/home/user/Clonedit/lamplight.wav';
const TARGET_LUFS=-12.0;

const exe=await findBrowser(); const srv=await serve();
const args=['--no-sandbox']; if(process.env.HTTPS_PROXY) args.push('--proxy-server='+process.env.HTTPS_PROXY);
const browser=await chromium.launch({executablePath:exe,args});
const {page,errors}=await boot(browser,srv.base);
page.on('console', m=>{ const t=m.text(); if(/^JBH /.test(t)) console.log('  '+t.slice(4)); });

const say=(...a)=>console.log(...a);

/* ---- THE BOARD ------------------------------------------------------ */
say('LAMPLIGHT');
const board=await page.evaluate(async () => {
  const J=window.JBH, L=[];
  await J.clear();

  /* the kit: three pads, untagged so the build claims them */
  await J.instrument('kit',{pack:'samples/nakeddrums.json', match:'^nd:', lo:36, hi:39});
  const kitPads=await J.instPads('kit');
  for(const x of kitPads) J.pad(x.pad,{gain:1.0, att:0.0005, sus:1, dec:6, rel:0.25});
  for(const x of kitPads) J.pad(x.pad,{inst:null});
  L.push('kit: '+kitPads.length+' recorded pads at notes '
    +kitPads.map(x=>x.note).join(', ')+' — untagged, so they are the kit');

  /* the sub, on the next free pad */
  const bp=kitPads.length;
  await J.bass({style:'sub', midi:36, seconds:1.1, pad:bp});
  J.pad(bp,{inst:'sub', srcNote:36, gain:0.9, rel:0.18});
  L.push('sub: bass(style sub) on pad '+(bp+1)+', tagged `sub`');

  /* the two sampled voices. Gains staged from the atlas peaks toward
     -12dBFS rather than set by taste: these two arrive 4.7dB apart on
     disk and sources in this repo differ by up to 35dB. */
  await J.pack('samples/vcsl-wide.json');
  const stage=(peakDb)=>Math.min(2, Math.pow(10,(-12-peakDb)/20));
  /* ---- REGISTER IS PART OF THE SAMPLE CHOICE ----------------------
     The first run loaded 6 roots across the WHOLE library and reported
     `worstBend 10 st`. Ten semitones of resampling is not an upright
     piano any more, and it showed in the writing too: ensemble() takes
     each voice's span from its instrument's sampled range, so a library
     spread thin over five octaves let the piano line cover 25 semitones
     and the zither 31, against a norm of about 12, with the piano's
     leaps at 26.2% against 13.1%. One cause, three findings.
     So each instrument is loaded over the register it is going to play,
     densely. Two octaves of piano at 9 roots is a bend of about 1.5
     semitones, and it bounds the line as a side effect. */
  const pi=await J.instrument('piano',{match:'upright', lo:52, hi:76, max:9});
  for(const x of await J.instPads('piano'))
    J.pad(x.pad,{gain:+stage(-12.3).toFixed(2), att:0.004, dec:0.9, sus:0.75, rel:0.35});
  const zi=await J.instrument('zither',{match:'dantranh', lo:67, hi:86, max:7});
  for(const x of await J.instPads('zither'))
    J.pad(x.pad,{gain:+stage(-17.0).toFixed(2), att:0.006, dec:0.7, sus:0.6, rel:0.30});
  L.push('piano: '+(await J.instPads('piano')).length+' pads, worstBend '
    +(pi&&pi.worstBend!=null?pi.worstBend:'?')+' st, gain '+stage(-12.3).toFixed(2));
  L.push('zither: '+(await J.instPads('zither')).length+' pads, worstBend '
    +(zi&&zi.worstBend!=null?zi.worstBend:'?')+' st, gain '+stage(-17.0).toFixed(2));

  /* the key is a decision, so it is made here. writeSurprise only
     picks one when none is declared. */
  J.key('C','minor');
  let used=0; for(let i=0;i<64;i++) if(S.pads[i]&&S.pads[i].bufId>=0) used++;
  L.push('board: '+used+' pads in use, key C minor');
  return L;
});
for(const l of board) say('  '+l);

/* ---- THE BUILD, WHICH IS THE WHOLE POINT ---------------------------- */
say('\nBUILD — noir');
const built=await page.evaluate(async () => {
  document.getElementById('mlGenre').value='noir';
  const b=document.getElementById('mlDemo');
  b.click();
  for(let i=0;i<900;i++){ await new Promise(r=>setTimeout(r,100)); if(!b.disabled) break; }
  const info=document.getElementById('mlInfo');
  return { says:(info&&info.textContent)||b.textContent,
    bpm:S.bpm, swing:S.swing, human:S.human, drift:S.humanDrift,
    plen:S.patterns[0].plen||16, sections:(S.song||[]).length };
});
say('  '+built.says);
say('  '+built.bpm+'bpm · swing '+Math.round(built.swing*100)+'% · human '
  +Math.round(built.human*100)+'% · drift '+Math.round(built.drift*100)+'% · PTN '
  +built.plen+' · '+built.sections+' sections');

/* ---- THE FREE CHECKS, WHICH RENDER NOTHING -------------------------- */
say('\nCHECKS (free — these read the schedule)');
const checks=await page.evaluate(async () => {
  const J=window.JBH, L=[];
  const pr=J.progression({src:'song'});
  L.push('progression: '+[...new Set(pr.chords)].join(' ')+'  ('+pr.chords.length+' bars)');
  const pu=await J.pulse({src:'song'});
  L.push('pulse '+pu.pulseStrength+' · beat '+pu.onGrid.beat+'% · '+pu.says);
  for(const t of ['sub','piano','zither']){
    try{ const m=await J.melody(t,{src:'song'}); const g=m.got;
      L.push(t+': '+m.notes+' notes · rep '+g.repeat+' step '+g.step+' 3rd '+g.third
        +' leap '+g.leap+' range '+g.range+' · '
        +(m.findings.length?m.findings.length+' findings — '+m.findings[0]:'inside the norms'));
    }catch(e){ L.push(t+': melody — '+e.message); }
    try{ const mo=await J.motif(t,{src:'song'});
      L.push('   motif pitch '+mo.pitchRecurrence+'/'+mo.norm.pitch
        +' rhythm '+mo.rhythmRecurrence+'/'+mo.norm.rhythm
        +(mo.findings.length?' — '+mo.findings[0]:' — comes back like a tune'));
    }catch(e){ L.push('   motif — '+e.message); }
  }
  for(const pair of [['sub','piano'],['piano','zither'],['sub','zither']]){
    try{ const c=await J.counterpoint(pair,{src:'song'});
      if(c.motion) L.push(pair.join('/')+': oblique '+c.motion.oblique
        +' contrary '+c.motion.contrary+' par5 '+c.motion.par5+' par8 '+c.motion.par8
        +' · '+c.says);
      else L.push(pair.join('/')+': '+c.says);
    }catch(e){ L.push(pair.join('/')+': '+e.message); }
  }
  try{ const h=await J.harmony({src:'song'});
    /* harmony()'s findings are OBJECTS, not strings. The first run
       printed "2 findings — [object Object]", which is a report that
       hides exactly what it was asked to show. */
    const fs=(h.findings||[]).map(f=>typeof f==='string'?f:(f.says||JSON.stringify(f)));
    L.push('harmony: '+(fs.length?fs.length+' findings':'clean')
      +'  ('+h.carriedConsonant+' notes ring into a chord they belong to)');
    for(const f of fs) L.push('   '+String(f).slice(0,220));
  }catch(e){ L.push('harmony: '+e.message); }
  return L;
});
for(const l of checks) say('  '+l);

/* ---- THE MASTER ------------------------------------------------------
   Bracket and interpolate rather than ladder: the limiter puts a knee
   in the trim-to-loudness response, so two points that straddle the
   target are worth more than any assumption about the slope. Probe
   from somewhere definitely too quiet, as AGENTS.md says, because a
   ladder whose quietest rung is already too loud writes no file.     */
say('\nMASTER — solving for '+TARGET_LUFS+' LUFS');
let trim=-4, m=null, lo=null, hi=null;
for(let pass=0; pass<5; pass++){
  m=await page.evaluate(async (t)=>{ await window.JBH.set({mTrim:t});
    return await window.JBH.render({src:'song', loops:1, loudness:true}); }, +trim.toFixed(1));
  say('  trim '+trim.toFixed(1).padStart(6)+' -> '+m.lufs.toFixed(1)+' LUFS  tp '
    +m.truePeakDb.toFixed(2)+'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
  const err=TARGET_LUFS-m.lufs;
  if(Math.abs(err)<0.3) break;
  if(err>0) lo={t:trim,l:m.lufs}; else hi={t:trim,l:m.lufs};
  let next = (lo&&hi) ? lo.t+(hi.t-lo.t)*(TARGET_LUFS-lo.l)/(hi.l-lo.l) : trim+err;
  next=Math.max(-24, Math.min(12, next));
  if(Math.abs(next-trim)<0.15) break;
  trim=next;
}
if(m.lufs < TARGET_LUFS-1.5 && trim>=11.9)
  say('  NOTE: at the +12 ceiling and still '+(TARGET_LUFS-m.lufs).toFixed(1)
    +'dB under — the pads are staged too low, which is a staging problem not a master one.');

/* ---- THE FILE, WRITTEN BEFORE ANYTHING SLOW ------------------------- */
say('\nBOUNCE');
const wav=await page.evaluate(async ()=>{
  const r=await window.JBH.render({src:'song', loops:1, wav:true, depth:24, loudness:true});
  return { b64:r.wavBase64, bytes:r.bytes, lufs:r.lufs, tp:r.truePeakDb,
    crest:r.crestDb, secs:r.seconds, clip:r.clipping };
});
writeFileSync(OUT, Buffer.from(wav.b64,'base64'));
say('  '+OUT+'  '+(wav.bytes/1048576).toFixed(2)+'MB  '
  +(wav.secs!=null?wav.secs.toFixed(1)+'s  ':'')+wav.lufs.toFixed(1)+' LUFS  tp '
  +wav.tp.toFixed(2)+'  crest '+wav.crest.toFixed(1)+(wav.clip?'  CLIP':''));
say('\njs errors: '+(errors.length?errors.join(' | '):'none'));

await browser.close(); await srv.close();
