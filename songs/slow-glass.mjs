/* SLOW GLASS — A aeolian, 88bpm. Built from everything this session
   learned, with nothing carried over from the last track.

   WHAT IS DIFFERENT, AND WHY. Each of these is a decision taken from a
   measurement rather than from taste, and every one of them reverses
   something that was done by habit before.

   SLOWER AND LONGER. Measured over 112 tracks of a widely-admired
   electronic catalogue, the median tempo is 129 and the one track held
   up as the standard runs at about 94 for five minutes. Everything
   bounced here has been 130-170 and under two minutes. This is 88 and
   runs to three and a half.

   QUIETER, AND ON PURPOSE. That same catalogue has a median loudness of
   -14.5dB with the middle half spanning -21.2 to -8.7 — a sixteen
   decibel spread, ambient records near -23 and dense ones near -7.6.
   There is no correct loudness; it is a decision about the music. Every
   previous bounce here aimed at -11.5 LUFS as though there were one.
   A slow, open piece mastered that hard has spent its dynamics on
   nothing, so this one targets -15.5 and keeps the crest wide.

   THE PALETTE WAS CHOSEN FROM THE ATLAS, not from the instrument names.
   samples/atlas-vcsl-mallets.json measures every instrument in the
   pack, and it says plainly what each one can do:

     instrument   peak    decay   air-vs-body   owns
     chimes       -3.5   4920ms         +12.0   1k-2k
     vibh        -11.8   1930ms          +9.1   1k-2k
     hchime      -16.5   5930ms          +0.1   2k-4k
     cabasa      -21.8     80ms         +21.0   8k-16k
     glock       -26.0    460ms         +35.7   4k-8k
     marimba     -31.3   1695ms         -35.3   60-120

   That is a 28dB spread in the level these things arrive at, which is
   why the gains below look so unlike each other — they are corrections
   first and taste second. The atlas also says in advance that the
   glockenspiel, cabasa and marimba cannot reach working level by gain
   alone, so none of them is asked to carry anything on its own.

   The two long decays are the reason this piece can be slow at all:
   hand chimes ring for six seconds and tubular bells for five, so the
   gaps between events stay full without a reverb pretending for them.

   TWO SOUNDS ARE MADE HERE RATHER THAN LOADED. paint() draws a bell as
   a spectrum — partials at ratios no filtered oscillator produces — and
   resynth() then rebuilds that bell out of the mallet corpus, which
   gives a hybrid with the bell's shape and the corpus's grain. Neither
   exists in any pack.

   AND THE REST IS THE LIST OF THINGS THAT WENT WRONG BEFORE: three bass
   layers because a sine has no pitch on a small speaker; the loudest
   elements on the beat and never nudged; a theme that is stated and
   then developed rather than a random walk; the glockenspiel answering
   the vibraphone half a bar later instead of doubling it in octaves;
   and every pattern stating its own master filter value, because a lane
   left in one pattern is inherited by all the ones after it. */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=88, TARGET_LUFS=-15.5;
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
await call('clear');

/* ---- THE PLAYERS ------------------------------------------------------ */
const MAL='samples/vcsl-mallets.json';
await call('instrument','vib',{pack:MAL, match:'^vc:vibh-',    lo:53, hi:84, max:9});
await call('instrument','hch',{pack:MAL, match:'^vc:hchime-',  lo:60, hi:86, max:8});
await call('instrument','glk',{pack:MAL, match:'^vc:glock-',   lo:79, hi:104, max:5});
await call('instrument','mar',{pack:MAL, match:'^vc:marimba-', lo:41, hi:72, max:5});
const P=(n)=>call('instPads',n).then(l=>l.map(x=>x.pad));
const VIB=await P('vib'), HCH=await P('hch'), GLK=await P('glk'), MAR=await P('mar');

await call('pack', MAL);
const CAB=36, TRI=37, BEL=38;
for(const [pd,id] of [
  [CAB,'vc:cabasa-Cabasa1_Hit_rr1_Mid'],
  [TRI,'vc:tri-Triangle1_HitFM_v1_rr1_Mid'],
  [BEL,'vc:chimes-chimes_C3_f_rr1'],
]) await call('sound', id, pd);

/* ---- TWO SOUNDS THAT DO NOT EXIST IN ANY PACK -------------------------- */
const GLASS=39, HYBRID=34;
/* a bell drawn as a spectrum: the partials are at bell ratios, which a
   filter cannot impose on an oscillator because they are not harmonics */
const painted=await call('paint',{pad:GLASS, seconds:4.5, name:'glass bell', midi:57,
  partials:[
    {hz:220,    level:1.00, at:0.00, dur:1.00},
    {hz:440,    level:0.50, at:0.00, dur:0.82},
    {hz:600.6,  level:0.40, at:0.02, dur:0.55},   /* 2.73x */
    {hz:965.8,  level:0.28, at:0.03, dur:0.38},   /* 4.39x */
    {hz:1566,   level:0.16, at:0.04, dur:0.22},
    {hz:2486,   level:0.09, at:0.05, dur:0.13}]});
/* and the same bell rebuilt out of the mallet corpus: the shape is the
   bell's, the substance is wood and metal recordings */
const hybrid=await call('resynth',{target:GLASS, brain:[...VIB,...HCH,...MAR],
  pad:HYBRID, blockMs:90, stickiness:0.3, novelty:0.4, name:'glass in mallets'});
console.log('painted : '+painted.says.slice(0,80));
console.log('rebuilt : '+hybrid.says.slice(0,110));

/* the pulse and the bass: three layers, because a sine alone has weight
   and no pitch anywhere a small speaker can reach */
const KIK=40, KSB=41;
const SUBN=[33,35,36,38,40];                    // A1 B1 C2 D2 E2
const SUB=[42,43,44,45,46], BAS=[47,48,49,50,51];
await call('preset','dkick',KIK,33);
await call('preset','bsub',KSB,21);
for(let i=0;i<SUBN.length;i++){
  await call('preset','bsub',SUB[i],SUBN[i]);
  await call('preset','bsub',BAS[i],SUBN[i]+12);
}
console.log('players : vib '+VIB.length+' hch '+HCH.length+' glk '+GLK.length+' mar '+MAR.length);

/* ---- LEVELS, FROM THE ATLAS -------------------------------------------
   gain ≈ 10^((-14 − peakDb)/20), clamped, then balanced by ear. The
   atlas says the glockenspiel, cabasa, triangle and marimba are all
   capped by that arithmetic, so none of them is the only thing holding
   up any part of the spectrum. */
await bat([
  ...VIB.map(p=>['pad',p,{inst:'vib', att:0.001, dec:4.2, sus:0.22, rel:1.60,
    ftype:'lowpass', fcut:0.95, gain:0.95, pan:-0.16, rev:0.34, eqMid:3}]),
  ...HCH.map(p=>['pad',p,{inst:'hch', att:0.03, dec:7.0, sus:0.45, rel:3.00,
    ftype:'lowpass', fcut:0.88, gain:1.45, pan:-0.28, rev:0.52, eqMid:3}]),
  ...GLK.map(p=>['pad',p,{inst:'glk', att:0.001, dec:1.6, sus:0.08, rel:0.70,
    ftype:'off', gain:1.70, pan:0.24, rev:0.46, eqHi:2}]),
  ...MAR.map(p=>['pad',p,{inst:'mar', att:0.001, dec:2.2, sus:0.08, rel:0.60,
    ftype:'lowpass', fcut:0.72, gain:2.00, pan:0.12, rev:0.22, eqLo:2, eqMid:3}]),
  /* the two made sounds */
  ['pad',GLASS, {inst:'glass', att:0.004, dec:5.5, sus:0.30, rel:3.2,
    ftype:'lowpass', fcut:0.90, gain:0.80, pan:0.10, rev:0.56}],
  ['pad',HYBRID,{inst:'glass', att:0.01, dec:5.0, sus:0.26, rel:2.6,
    ftype:'lowpass', fcut:0.84, gain:0.70, pan:-0.20, rev:0.60}],
  /* air and colour */
  ['pad',CAB,{inst:'air', att:0.001, dec:0.5, sus:0, rel:0.25, gain:1.85, pan:0.32, rev:0.26, eqHi:7}],
  ['pad',TRI,{inst:'air', att:0.001, dec:2.2, sus:0, rel:1.6, gain:1.20, pan:0.28, rev:0.52, eqHi:4}],
  /* tubular bells arrive at -3.5dBFS, the loudest thing in the pack —
     the only pad here that needs turning DOWN */
  ['pad',BEL,{inst:'air', att:0.002, dec:6.0, sus:0, rel:3.5, gain:0.32, pan:0.06, rev:0.58}],
  /* the pulse */
  ['pad',KIK,{inst:'pulse', att:0.001, dec:0.70, sus:0, rel:0.30, pitch:-2,
    ftype:'lowpass', fcut:0.42, drv:0.20, gain:0.40, pan:0, rev:0.07}],
  ['pad',KSB,{inst:'pulse', att:0.002, dec:0.40, sus:0, rel:0.22,
    ftype:'lowpass', fcut:0.10, gain:0.52, pan:0, rev:0}],
  ...SUB.map(p=>['pad',p,{inst:'bass', att:0.006, dec:3.2, sus:0.55, rel:0.80,
    ftype:'lowpass', fcut:0.13, drv:0.08, gain:0.26, pan:0, rev:0.05}]),
  ...BAS.map(p=>['pad',p,{inst:'bass', att:0.004, dec:2.4, sus:0.40, rel:0.60,
    ftype:'lowpass', fcut:0.44, fres:1.0, drv:0.58, crush:12,
    gain:0.24, pan:0, rev:0.12, eqLo:-4, eqMid:2}]),
]);

await call('set',{bpm:BPM, swing:0, human:0.022, humanDrift:0.12,
  revType:'hall', revSize:2.4, revLvl:0.40, dlyMode:'digital', delayFb:0.26, dlyTone:6800,
  compAmt:0.12, mWidth:1.12, mMono:90, mCeil:-3.0, mAir:3.5, mMud:0, mEqMid:1,
  scOn:false, masterVol:1.0, mTrim:0});

/* ---- THE SUBJECT -------------------------------------------------------
   Five notes over a bar and a half, which at 88bpm is four seconds —
   long enough to be a phrase rather than a lick, and slow enough that
   the hand chimes underneath it never have to be cut off. */
const SC=[0,2,3,5,7,8,10];                      // A aeolian: A B C D E F G
const deg=(base,d)=>{ const o=Math.floor(d/7), k=((d%7)+7)%7; return base+12*o+SC[k]; };
const FIG   =[0,3,2,5,4];                       // A D C F E
const FIG_R =[0,6,10,16,24];                    // in steps
const B=(bar,st)=>bar*16+st;

const say=(bar,base,{t=0, inv=false, aug=1, only=5, vel=0.70, inst='vib', at=0}={})=>{
  const o=[];
  for(let i=0;i<Math.min(only,FIG.length);i++){
    const d=(inv? -FIG[i] : FIG[i]) + t;
    const abs=B(bar,0)+at+Math.round(FIG_R[i]*aug);
    if(abs>=64) break;
    o.push(['note', inst, deg(base,d), abs, vel, {beats:(aug>1?2.6:1.8)}]);
  }
  return o;
};

/* ---- PULSE AND BASS ---------------------------------------------------- */
const pulseBar=(bar,{half=false, air=1}={})=>{
  const o=[];
  for(let b=0;b<4;b++){
    if(half && b%2===1) continue;
    const v=b===0?0.96:0.84;
    o.push(['step',KIK,B(bar,b*4),v], ['step',KSB,B(bar,b*4),v*0.9]);
  }
  if(air>0) for(let st=4;st<16;st+=8) o.push(['step',CAB,B(bar,st),0.62]);
  if(air>1) for(let st=2;st<16;st+=4) o.push(['step',CAB,B(bar,st),0.44]);
  return o;
};
const bassBar=(bar,i)=>{
  const n=[0,0,3,2][i%4];
  const o=[['step',SUB[n],B(bar,0),0.82], ['step',BAS[n],B(bar,0),0.82]];
  if(i%4===3) o.push(['step',SUB[1],B(bar,8),0.58], ['step',BAS[1],B(bar,8),0.58]);
  return o;
};
const mk=async(slot,fn)=>{ await call('pattern',slot,{plen:64,clear:true});
  await call('set',{pattern:slot}); await bat(fn()); };

/* 0 — the made sounds alone, no pulse */
await mk(0,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    if(bar%2===0) o.push(['note','glass',deg(57,[0,0,3,2][bar]),B(bar,0),0.58,{beats:7}]);
    if(bar===2)   o.push(['step',HYBRID,B(bar,8),0.52]);
    o.push(['step',TRI,B(bar,bar%2?10:2),0.46]);
    for(let st=4;st<16;st+=8) o.push(['step',CAB,B(bar,st),0.40]);
  }
  return o; });

/* 1 — the subject, stated plainly, with the bass under it */
await mk(1,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar));
    if(bar%2===0) o.push(...say(bar,57,{vel:0.66}));
    o.push(['note','hch',deg(69,[0,2][bar%2]),B(bar,0),0.40,{beats:7}]);
    for(let st=4;st<16;st+=8) o.push(['step',CAB,B(bar,st),0.46]);
  }
  return o; });

/* 2 — the glockenspiel answers it half a bar later. Not in octaves:
       two voices locked in octaves are one voice, which counterpoint()
       measured at 28.7% parallel against a 0.111% norm last time. */
await mk(2,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar), ...pulseBar(bar,{air:1}));
    if(bar%2===0){ o.push(...say(bar,57,{vel:0.70}));
      o.push(...say(bar,81,{at:8, only:3, vel:0.46, inst:'glk'})); }
    o.push(['note','hch',deg(69,[0,4][bar%2]),B(bar,0),0.38,{beats:7}]);
  }
  return o; });

/* 3 — up a third, marimba underneath. The atlas says marimba cannot
       reach working level by gain alone, so it is body and not a line. */
await mk(3,()=>{ const o=[];
  const MARN=[41,48,55,59];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar+2), ...pulseBar(bar,{air:2}));
    if(bar%2===0){ o.push(...say(bar,57,{t:2, vel:0.70}));
      o.push(...say(bar,81,{at:8, t:2, only:3, vel:0.44, inst:'glk'})); }
    o.push(['note','mar',MARN[bar%4],B(bar,0),0.70,{beats:3}]);
    o.push(['step',BEL,B(bar,0),bar===0?0.52:0.34]);
  }
  return o; });

/* 4 — inverted, and the hybrid underneath everything */
await mk(4,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar+1), ...pulseBar(bar,{air:2}));
    if(bar%2===0) o.push(...say(bar,69,{inv:true, vel:0.68}));
    if(bar===1) o.push(['step',HYBRID,B(bar,0),0.56]);
    o.push(['note','hch',deg(69,[0,3,5,4][bar]),B(bar,0),0.40,{beats:7}]);
  }
  return o; });

/* 5 — THE OPEN SECTION. No pulse. The two long decays carry it: hand
       chimes ring six seconds and the tubular bell five, so nothing has
       to be sustained artificially. */
await mk(5,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(['note','hch',deg(69,[0,2,4,3][bar]),B(bar,0),0.52,{beats:7.6}]);
    o.push(['note','glass',deg(57,[0,3,2,5][bar]),B(bar,8),0.46,{beats:5}]);
    if(bar%2===1) o.push(['step',BEL,B(bar,4),0.44]);
    o.push(['step',TRI,B(bar,12),0.40]);
    for(let st=4;st<16;st+=8) o.push(['step',CAB,B(bar,st),0.34]);
    if(bar===3) o.push(['step',KIK,B(bar,12),0.70], ['step',KSB,B(bar,12),0.64]);
  }
  return o; });

/* 6 — the open section with the subject augmented under it and the
       pulse walking back in a layer at a time */
await mk(6,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(['note','hch',deg(69,[0,2,5,4][bar]),B(bar,0),0.46,{beats:7.6}]);
    if(bar===0) o.push(...say(bar,45,{aug:2, only:3, vel:0.62, inst:'mar'}));
    if(bar>=1) o.push(['step',KIK,B(bar,0),0.90], ['step',KSB,B(bar,0),0.84]);
    if(bar>=2) o.push(['step',KIK,B(bar,8),0.84], ['step',KSB,B(bar,8),0.78]);
    if(bar>=3) for(let b=0;b<4;b++) o.push(['step',KIK,B(bar,b*4),b?0.84:0.92],
      ['step',KSB,B(bar,b*4),b?0.78:0.86]);
    o.push(...bassBar(bar,bar));
    if(bar%2===0) o.push(...say(bar,57,{only:4, vel:0.64}));
    for(let st=4;st<16;st+=8) o.push(['step',CAB,B(bar,st),0.42+0.04*bar]);
  }
  return o; });

/* 7 — the fragment, thinning out */
await mk(7,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    if(bar<2) o.push(...pulseBar(bar,{half:bar===1, air:1}));
    o.push(...bassBar(bar,bar));
    if(bar%2===0) o.push(...say(bar,57,{only:bar<2?3:2, vel:0.62-0.10*bar}));
    o.push(['note','hch',deg(69,0),B(bar,0),0.36,{beats:7.6}]);
    if(bar===3) o.push(['note','glass',deg(57,0),B(bar,0),0.52,{beats:7}]);
  }
  return o; });

/* every pattern states its own filter value: a lane exists only in the
   pattern that has one, and the rest inherit whatever it left */
for(let i=0;i<8;i++) await call('automate','mfilt',[[0,1.0]],{pattern:i});
await call('automate','mfilt',[[0,0.80],[48,0.96],[63,1.0]],{pattern:0});
await call('automate','mfilt',[[0,1.0],[40,0.95],[63,0.92]],{pattern:5});
await call('automate','mvol',[[0,0.58],[63,0.74]],{pattern:0});
for(const [p,v] of [[1,0.82],[2,0.88],[3,0.90],[4,0.94],[7,0.76]])
  await call('automate','mvol',[[0,v]],{pattern:p});
await call('automate','mvol',[[0,0.72],[63,0.70]],{pattern:5});
await call('automate','mvol',[[0,0.74],[63,0.92]],{pattern:6});

await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:0,reps:1},{pat:1,reps:1},{pat:2,reps:1},{pat:3,reps:1},
        {pat:2,reps:1},{pat:4,reps:1},{pat:3,reps:1},
        {pat:5,reps:1},{pat:6,reps:1},
        {pat:4,reps:1},{pat:2,reps:1},{pat:3,reps:1},
        {pat:5,reps:1},{pat:6,reps:1},
        {pat:4,reps:1},{pat:7,reps:1},{pat:0,reps:1}]});

/* ---- EVERY CHECK, NOT A CHOSEN FEW ------------------------------------- */
const sch=await call('schedule',{src:'song',full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s ('
  +Math.floor(sch.seconds/60)+':'+String(Math.round(sch.seconds%60)).padStart(2,'0')
  +') · stretched '+JSON.stringify(sch.stretched));

const rv=await call('review',{src:'song'});
console.log('\nREVIEW — '+rv.says);
for(const f of rv.findings.slice(0,12)) console.log('  ['+f.severity+'] '+f.says.slice(0,104));
for(const k of rv.skipped) console.log('  could not run: '+k);

const tr=await call('translate',{src:'song'});
console.log('\nsmall speaker: '+tr.says.slice(0,130));
const dy=await call('pulse',{src:'song'});
console.log('pulse: autocorr '+dy.pulseStrength+'  beat '+dy.onGrid.beat+'%  buried-by '+dy.beatBuriedBy);

/* ---- LEVEL, IN TWO RENDERS RATHER THAN FIVE ----------------------------
   Trim and LUFS move one for one, measured repeatedly across this
   session, so one render says where the piece sits and arithmetic says
   where to put it. The four-rung ladder was costing four full renders
   and, on a dense arrangement, missing the target in both directions. */
await call('set',{mTrim:-12, compAmt:0.12});
const probe=await call('render',{src:'song',loops:1,loudness:true});
const trim=Math.max(-30, Math.min(0, -12 + (TARGET_LUFS - probe.lufs)));
console.log('\nprobe at -12 → '+probe.lufs.toFixed(1)+' LUFS, crest '+probe.crestDb.toFixed(1)
  +' → setting trim '+trim.toFixed(1)+' for '+TARGET_LUFS);
await call('set',{mTrim:+trim.toFixed(1)});
const m=await call('render',{src:'song',loops:1,loudness:true});
console.log('   '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
  +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
if(m.clipping || m.truePeakDb>-1) throw new Error('ceiling breached at trim '+trim);
if(errors.length) console.log('ERRORS:',errors.slice(0,3));

const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'slow-glass.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
