/* DRIFTWORK — written through the CONTROLS, not the API.

   Every other script in this folder calls JBH directly. This one drives
   the WRITE panel the way a person does: load a preset onto a pad, TAG
   IT, set PTN 64, declare a key and a progression, tick ALL, press
   OFFER, press WRITE IT. The API is used for the three things the panel
   does not reach — the tempo, the kit, and the arrangement.

   It exists because driving the controls is how the span bug was found.
   The ALL branch of WRITE IT called ensemble() once and returned three
   lines above the chunk loop, so a sixteen-bar span wrote four bars into
   one pattern and dropped the other twelve in silence while the control
   offered 16 and enabled it. A script that calls infill() directly
   cannot see that, and every test in the suite asked for four bars or
   fewer — the one span where the two paths agree.

   So this asks for SIXTEEN, and asserts it got four patterns.

   TWO THINGS THAT COST TIME IF YOU WRITE ANOTHER OF THESE.
   A pad listens on `mousedown`, not `click` — padPress() is what sets
   S.editPad, so el.click() selects nothing and every later step works on
   whatever was selected before. And a pad cell is BANK-RELATIVE: cell i
   is pad S.bank*16+i, so read back S.editPad rather than trusting the
   index you aimed at. Both of those printed as app faults here first. */
import { chromium } from 'playwright-core';
import { findBrowser, serve, boot } from '../tests/browser/harness.mjs';
import { writeFileSync } from 'node:fs';

const OUT='/home/user/Clonedit/driftwork.wav';
const TARGET_LUFS=-13.0;          /* a dark, unhurried piece — not -11.5 */

/* F dorian: the major IV against a minor i is the whole colour of it,
   so the progression states that IV rather than circling i and v. */
const KEY=['F','dorian'];
const PROG=['Fm','Bb','Eb','Cm'];

/* A palette chosen for what each sound has to DO, not for its name:
   weight, a tune, an inharmonic top, a middle that can sustain. The
   three drums are left UNTAGGED, which is what makes them the kit. */
const PALETTE=[
  ['b808',  29, 'sub'  ], ['pfelt', 52, 'keys' ],
  ['xbell', 76, 'bell' ], ['scello',45, 'cello'],
  ['dkick', 36, null   ], ['drim',  37, null   ], ['dshk', 42, null ]
];

const say=(...a)=>console.log(...a);
const FAIL=[]; const must=(ok,msg)=>{ if(!ok){ FAIL.push(msg); say('   !! '+msg); } };

const exe=await findBrowser(); const srv=await serve();
const args=['--no-sandbox']; if(process.env.HTTPS_PROXY) args.push('--proxy-server='+process.env.HTTPS_PROXY);
const browser=await chromium.launch({executablePath:exe,args});
const {page,errors}=await boot(browser,srv.base);

say('DRIFTWORK');

/* ---- 1. THE SOUNDS, ONE AT A TIME ---------------------------------- */
const loaded=await page.evaluate(async (PAL)=>{
  const w=ms=>new Promise(r=>setTimeout(r,ms));
  const tap=el=>{
    el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:4,clientY:4}));
    el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  };
  const out=[];
  for(let i=0;i<PAL.length;i++){
    document.querySelector('#tabs button[data-v="pads"]').click(); await w(60);
    tap(document.querySelectorAll('#padgrid .pad')[i]); await w(70);
    document.querySelector('#tabs button[data-v="smpl"]').click(); await w(60);
    const sel=document.getElementById('presetSel');
    sel.value=PAL[i][0]; sel.dispatchEvent(new Event('change'));
    document.getElementById('presetNote').value=String(PAL[i][1]);
    const before=S.buffers.length;
    document.getElementById('btnPresetLoad').click();
    for(let k=0;k<200;k++){ await w(100); if(S.buffers.length>before) break; }
    await w(140);
    /* the pad the APP selected, not the cell index */
    const pad=S.editPad, p=S.pads[pad];
    /* TAG IT, for the four that are instruments */
    let inst=null;
    if(PAL[i][2]){
      document.querySelector('#tabs button[data-v="seq"]').click(); await w(90);
      const nm=document.getElementById('mlTagName');
      nm.value=PAL[i][2]; nm.dispatchEvent(new Event('input'));
      document.getElementById('mlTagGo').click(); await w(170);
      inst=S.pads[pad].inst;
    }
    out.push({ asked:PAL[i][0], pad, name:p.name, srcNote:p.srcNote,
      ftype:p.ftype, velFlt:p.velFlt, inst, role:PAL[i][2] });
  }
  return out;
}, PALETTE);
for(const l of loaded){
  say('  '+String(l.asked).padEnd(7)+'-> pad '+String(l.pad+1).padEnd(3)
    +'"'+String(l.name).padEnd(13)+'" srcNote '+String(l.srcNote).padEnd(4)
    +(l.inst?'tagged '+l.inst:'kit'));
  must(l.srcNote!=null, l.asked+' has no srcNote');
  if(l.role) must(l.inst===l.role, l.asked+' asked for tag "'+l.role+'" and got "'+l.inst+'"');
}
const KIT=loaded.filter(l=>!l.role).map(l=>l.pad);
must(KIT.length===3, 'expected three untagged drum pads, got '+KIT.length);

/* ---- 2. TEMPO AND FEEL, which the panel does not set --------------- */
await page.evaluate(async ()=>{
  await window.JBH.set({bpm:92, swing:0.08, human:0.10, humanDrift:0.12});
});
say('\n  92bpm · swing 8% · human 10% · drift 12%');

/* ---- 3. THE PANEL WRITES FOUR VOICES OVER SIXTEEN BARS ------------- */
say('\nWRITE — PTN 64, '+KEY.join(' ')+', '+PROG.join(' ')+', ALL ticked, 16 bars');
const wrote=await page.evaluate(async ([K,P])=>{
  const w=ms=>new Promise(r=>setTimeout(r,ms));
  const g=id=>document.getElementById(id);
  const set=(id,v)=>{ const e=g(id); e.value=v; e.dispatchEvent(new Event('change')); };
  const wait=async id=>{ for(let i=0;i<900;i++){ await w(100); if(!g(id).disabled) return; } };
  const L=[];
  document.querySelector('#tabs button[data-v="seq"]').click(); await w(90);
  /* PTN FIRST: the span picker is rebuilt from the pattern's LEN, so a
     four-bar chunk is not even offered until the pattern can hold one. */
  set('mlPtn','64'); await w(150);
  set('mlTonic',K[0]); set('mlMode',K[1]); await w(140);
  g('mlChords').value=P.join(' ');
  g('mlChords').dispatchEvent(new Event('change')); await w(120);
  g('mlSet').click(); await w(180);
  L.push('SET: '+g('mlInfo').textContent.trim().slice(0,90));

  const all=g('mlAll'); all.checked=true; all.dispatchEvent(new Event('change')); await w(150);
  L.push('ROLES: '+g('mlInfo').textContent.trim().slice(0,110));
  set('mlSpan','16'); set('mlFeel','3'); set('mlPoly','spread'); set('mlDens','normal');
  await w(140);
  const spanOk=!g('mlSpan').options[g('mlSpan').selectedIndex].disabled
    && g('mlSpan').value==='16';

  g('mlOffer').click(); await wait('mlOffer');
  const offered=g('mlInfo').textContent.trim();
  const cands=[...g('mlPick').options].map(o=>o.textContent.trim());
  /* the ranking is by FAULT and cannot hear them, so take the top one —
     but record the whole offer, because that is the choice a person makes */
  g('mlPick').selectedIndex=0; g('mlPick').dispatchEvent(new Event('change')); await w(90);
  g('mlApply').click(); await wait('mlApply');
  const said=g('mlInfo').textContent.trim();

  const hits=S.patterns.map(p=>{
    let n=0; for(const row of Object.values(p.steps||{})) for(const v of (row||[])) if(v>0) n++;
    return n;
  });
  return {L, spanOk, offered, cands, said, hits,
    chords:S.patterns.map((p,i)=>(S.chords[i]||[]).join(' '))};
}, [KEY, PROG]);
for(const l of wrote.L) say('  '+l);
must(wrote.spanOk, 'the span control would not accept 16 bars at PTN 64');
say('  OFFER: '+wrote.offered.slice(0,150));
wrote.cands.forEach((c,i)=>say('    '+(i+1)+'. '+c));
say('  WROTE: '+wrote.said.slice(0,200));
say('  hits per pattern: '+wrote.hits.join(', '));
/* THE ASSERTION THIS SCRIPT EXISTS FOR */
must(wrote.hits.slice(0,4).every(h=>h>0),
  'a 16-bar span left one of the first four patterns empty: '+wrote.hits.join(','));
must(new Set(wrote.hits.slice(0,4)).size>=3,
  'the four chunks are copies, not variations: '+wrote.hits.slice(0,4).join(','));
for(let i=0;i<4;i++) must(!!wrote.chords[i],
  'pattern '+(i+1)+' got notes without a progression to check them against');

/* ---- 4. THE KIT, BY HAND, ACROSS THE SAME FOUR PATTERNS ------------ */
/* The panel writes VOICES. A kit is the one thing it leaves, so it is
   written here — with accents, ghost notes, a break and a fill, because
   one velocity repeated is a drum machine however good the samples are.
   These presets are single-sample, so velocity cannot pick a different
   recording; what it can do is open the filter, which is the only way a
   quiet hit on an uploaded sound differs in TIMBRE and not just level. */
const kit=await page.evaluate(async (KITPADS)=>{
  const [KICK,RIM,HAT]=KITPADS;
  const touched=[];
  /* graded by role, and only where the person has not set a filter */
  for(const [pad,fcut,vf] of [[KICK,0.82,0.30],[RIM,0.75,0.45],[HAT,0.70,0.55]]){
    const p=S.pads[pad];
    if(p.ftype==='off'){ await window.JBH.pad(pad,{ftype:'lowpass',fcut,velFlt:vf});
      touched.push('pad'+(pad+1)); }
  }
  /* the kick tuned to the tonic, which every chord here contains, and by
     less than a tritone so it still sounds like the kick that was chosen */
  await window.JBH.pad(KICK,{pitch:5});

  const A=0.95, N=0.70, G=0.22;      /* accent · normal · ghost */
  const FIG=[
    { kick:[0,10],         rim:[8],      hat:[0,4,8,12],        acc:[0,8] },
    { kick:[0,6,10],       rim:[8,14],   hat:[0,2,4,6,8,10,12,14], acc:[0,8] },
    { kick:[0,6,10,13],    rim:[4,8,14], hat:[0,2,3,4,6,8,10,11,12,14], acc:[0,4,8,12] },
    { kick:[0,10],         rim:[8],      hat:[0,4,8,12],        acc:[0,8] }
  ];
  const out=[];
  for(let pi=0;pi<4;pi++){
    const r=await window.JBH.pattern(pi,{select:true});
    if(r && r.warning) throw new Error(r.warning);
    if(r.selected!==true) throw new Error('pattern '+(pi+1)+' did not select');
    const f=FIG[pi];
    let n=0;
    for(let bar=0;bar<4;bar++){
      const o=bar*16;
      /* A BREAK and a FILL need two bars to mean anything. The kick drops
         out of the last bar of the quiet section; the rim ramps through
         the last bar of the busiest one. */
      const breakBar = (pi===0 && bar===3);
      const fillBar  = (pi===2 && bar===3);
      if(!breakBar) for(const s of f.kick){
        await window.JBH.step(KICK, o+s, f.acc.indexOf(s)>=0?A:N); n++; }
      if(fillBar){
        for(const s of [0,3,6,8,10,12,13,14,15]){
          await window.JBH.step(RIM, o+s, s%3===0?A:G); n++; }
      } else for(const s of f.rim){ await window.JBH.step(RIM, o+s, A); n++; }
      for(const s of f.hat){
        /* ghosts on the off-sixteenths: a different sound, not a quieter one */
        await window.JBH.step(HAT, o+s, (s%4===0)?N:G); n++; }
    }
    out.push({pat:pi+1, wrote:n});
  }
  await window.JBH.pattern(0,{select:true});
  return {out, touched};
}, KIT);
say('\nKIT — by hand, accents + ghosts, a break in 1 and a fill in 3');
say('  velocity opens the filter on '+(kit.touched.join(', ')||'nothing — a filter was already set'));
say('  '+kit.out.map(x=>'ptn'+x.pat+' '+x.wrote+' hits').join(' · '));

/* ---- 5. THE ARRANGEMENT -------------------------------------------- */
const arr=await page.evaluate(async ()=>{
  /* four four-bar patterns, 32 bars: state it, open it up, take it to the
     busiest place, and come back changed rather than back to the start */
  await window.JBH.set({songOn:true, songLoop:false, song:[
    {pat:0,reps:1},{pat:1,reps:1},{pat:0,reps:1},{pat:2,reps:1},
    {pat:1,reps:1},{pat:3,reps:1},{pat:2,reps:1},{pat:3,reps:1} ]});
  return (S.song||[]).map(s=>s.pat+1).join(' ');
});
say('\nARRANGEMENT — '+arr+'   (8 sections x 4 bars = 32 bars)');

/* ---- 6. THE FREE CHECKS, which render nothing ---------------------- */
say('\nCHECKS');
const chk=await page.evaluate(async ()=>{
  const J=window.JBH, L=[];
  const pr=J.progression({src:'song'});
  L.push('progression: '+[...new Set(pr.chords)].join(' ')+'  ('+pr.chords.length+' bars)');
  const pu=await J.pulse({src:'song'});
  L.push('pulse '+pu.pulseStrength+' · beat '+pu.onGrid.beat+'% · '+pu.says);
  for(const t of ['sub','keys','bell','cello']){
    try{ const m=await J.melody(t,{src:'song'}); const g=m.got;
      L.push(t+': '+m.notes+' notes · rep '+g.repeat+' step '+g.step+' 3rd '+g.third
        +' leap '+g.leap+' range '+g.range
        +(m.findings.length?' · '+m.findings.length+' findings — '+m.findings[0]:' · inside the norms'));
    }catch(e){ L.push(t+': melody — '+e.message); }
    try{ const mo=await J.motif(t,{src:'song'});
      L.push('   motif pitch '+mo.pitchRecurrence+'/'+mo.norm.pitch
        +' rhythm '+mo.rhythmRecurrence+'/'+mo.norm.rhythm);
    }catch(e){ L.push('   motif — '+e.message); }
  }
  for(const pair of [['sub','keys'],['keys','bell'],['sub','cello'],['bell','cello']]){
    try{ const c=await J.counterpoint(pair,{src:'song'});
      L.push(pair.join('/')+': '+(c.motion
        ? 'oblique '+c.motion.oblique+' contrary '+c.motion.contrary
          +' par5 '+c.motion.par5+' par8 '+c.motion.par8
        : c.says));
    }catch(e){ L.push(pair.join('/')+': '+e.message); }
  }
  const h=await J.harmony({src:'song'});
  L.push('harmony: '+(h.findings.length?h.findings.length+' findings':'clean')
    +(h.carriedConsonant!=null?'  ('+h.carriedConsonant+' notes ring into a chord they belong to)':''));
  /* findings are OBJECTS — printed raw they read "[object Object]", which
     is how a real finding goes unread */
  for(const f of h.findings)
    L.push('   - '+String(typeof f==='string'?f:(f.says||f.msg||JSON.stringify(f))).slice(0,165));
  return L;
});
for(const l of chk) say('  '+l);

/* ---- 7. SOLVE THE TRIM, THEN WRITE THE FILE ------------------------ */
say('\nMASTER — solving for '+TARGET_LUFS+' LUFS');
let trim=-12, m=null, lo=null, hi=null;
for(let pass=0; pass<5; pass++){
  m=await page.evaluate(async t=>{ await window.JBH.set({mTrim:t});
    return await window.JBH.render({src:'song', loops:1, loudness:true}); }, +trim.toFixed(1));
  say('  trim '+trim.toFixed(1).padStart(6)+' -> '+m.lufs.toFixed(1)+' LUFS  tp '
    +m.truePeakDb.toFixed(2)+'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
  const err=TARGET_LUFS-m.lufs;
  if(Math.abs(err)<0.3) break;
  if(err>0) lo={t:trim,l:m.lufs}; else hi={t:trim,l:m.lufs};
  let next=(lo&&hi) ? lo.t+(hi.t-lo.t)*(TARGET_LUFS-lo.l)/(hi.l-lo.l) : trim+err;
  next=Math.max(-24,Math.min(12,next));
  if(Math.abs(next-trim)<0.15) break;
  trim=next;
}
if(m.lufs<TARGET_LUFS-1.5 && trim>=11.9)
  say('  NOTE: at the +12 ceiling and still '+(TARGET_LUFS-m.lufs).toFixed(1)
    +'dB under — that is a staging problem, not a master one.');

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
say(FAIL.length?('FAILED ASSERTIONS:\n  '+FAIL.join('\n  ')):'all assertions held');
await browser.close(); await srv.close();
