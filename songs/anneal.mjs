/* ANNEAL — D dorian, 132bpm. Struck metal and wood, with a pulse.

   WRITTEN AGAINST TWO MEASUREMENTS, both from the last piece's verdict:
   "the timing comes off as random sound and the sounds aren't very hifi".

   ON THE TIMING. The previous piece had a downbeat — a thump on step 0 of
   every bar — and 98% of its onsets sat on the sixteenth grid, so the
   first explanation, that nothing in it ever repeated, was wrong, and
   motif() said so: its figures recurred ABOVE the folk norm. What
   pulse() found instead was that the beat was inaudible. Weighted by how
   loud each onset actually is, only 46% landed on a beat. The two
   loudest things in the mix — a rimshot at weight 42 and a conga at 21.8,
   both scattered across the bar with random nudges — outweighed the kick
   nearly four to one, and the kick was the only element holding the
   pulse. The beat was in the arrangement and buried under everything
   audible.

   So here the loudest thing in the piece is on the beat, every time, and
   nothing loud is nudged. The scatter is quiet and the pulse is not.

   ON THE SOUNDS. Measured against the best-received mix in this repo,
   that piece's 8kHz band sat 17.3dB lower and its 4kHz band 9.8dB lower:
   a palette of synthesis put through resonant bandpasses and bitcrushing
   has no top octave to lose. The obvious fix was real recordings of
   struck metal, and the obvious fix was half wrong. Measured one by one,
   a vibraphone struck with soft mallets is the DULLEST thing in the
   library — 80dB down above 8kHz, almost pure fundamental — and the hand
   chimes and glass are not much better at 35 and 48dB down. Big resonant
   bars put their energy where their pitch is.

   What is actually bright is the small thin metal: triangle at 1.8dB
   down, cabasa 1.5, shaker 1.6, bell tree 5.4, finger cymbals 7.8, and —
   the useful discovery — the two glockenspiels, which are both pitched
   AND bright at 19 and 21dB down. So the air in this track comes from a
   tubular glockenspiel and a tray of small percussion, and the mallets
   underneath them are allowed to be warm.

   ON THE KEY. The vibraphone is sampled on the white notes only, every
   major third, so D dorian is the one mode it can play with almost no
   transposition at all. The tubular glock covers C D E F# G A B across
   its two octaves at a maximum gap of 2 semitones. The marimba has only
   C, F, G and B in it, so it gets an ostinato on those four notes rather
   than a melody it would have to be dragged through.

   ON THE THEME. Four notes, stated and then developed — transposed,
   inverted, augmented, and broken into a fragment — rather than drawn
   from a random number generator, which is what the last one did. */

import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=132;
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
const vib=await call('instrument','vib',{pack:MAL, match:'^vc:vibh-', lo:57, hi:84, max:9});
const glk=await call('instrument','glk',{pack:MAL, match:'^vc:tglock-', lo:91, hi:105, max:9});
const mar=await call('instrument','mar',{pack:MAL, match:'^vc:marimba-', lo:41, hi:72, max:5});
const hch=await call('instrument','hch',{pack:MAL, match:'^vc:hchime-', lo:62, hi:86, max:8});
const P=(n)=>call('instPads',n).then(l=>l.map(x=>x.pad));
const VIB=await P('vib'), GLK=await P('glk'), MAR=await P('mar'), HCH=await P('hch');

/* the small bright metal, placed one sample to a pad */
await call('pack', MAL);
const TRI=40, SHK=41, CAB=42, BTR=43, FCY=44, WBL=45;
for(const [pd,id] of [
  [TRI,'vc:tri-Triangle1_HitFM_v1_rr1_Mid'],
  [SHK,'vc:shaker-Mid_ShakerDouble_Down_rr1'],
  [CAB,'vc:cabasa-Cabasa1_Hit_rr1_Mid'],
  [BTR,'vc:btree-BellTree_Hit_C5_rr1_Mid'],
  [FCY,'vc:fcym-Fing_Cymb'],
  [WBL,'vc:wblock-wood_click2_mp'],
]) await call('sound', id, pd);

/* the pulse and the weight, synthesised: a kick that has to be the
   loudest thing here, and a sub under it */
const KIK=46, SUB=[47,48,49,50,51];
const SUBN=[38,40,41,43,45];                    // D2 E2 F2 G2 A2
await call('preset','dkick',KIK,36);
for(let i=0;i<SUB.length;i++) await call('preset','bsub',SUB[i],SUBN[i]);
console.log('players: vib '+VIB.length+'  glk '+GLK.length+'  mar '+MAR.length+'  hch '+HCH.length);

/* ---- HOW EACH ONE SITS -------------------------------------------------
   The gain staging is the piece. These samples arrive at wildly
   different levels — the bell tree peaks at -44dB and the woodblock at
   -9 — so the numbers below are corrections for that first and taste
   second. The rule the last piece broke: nothing quiet marks the beat
   and nothing loud wanders off it. */
await bat([
  ...VIB.map(p=>['pad',p,{inst:'vib', att:0.001, dec:3.4, sus:0.18, rel:1.10,
    ftype:'lowpass', fcut:0.80, fres:0.3, gain:0.62, pan:-0.14, rev:0.30}]),
  /* the sparkle: bright by nature, so it needs no help up top and a
     little restraint down low */
  ...GLK.map(p=>['pad',p,{inst:'glk', att:0.001, dec:2.2, sus:0.10, rel:0.80,
    ftype:'highpass', fcut:0.10, gain:0.30, pan:0.20, rev:0.44}]),
  ...MAR.map(p=>['pad',p,{inst:'mar', att:0.001, dec:1.5, sus:0.05, rel:0.45,
    ftype:'lowpass', fcut:0.66, gain:0.52, pan:0.10, rev:0.18}]),
  ...HCH.map(p=>['pad',p,{inst:'hch', att:0.02, dec:5.0, sus:0.40, rel:2.20,
    ftype:'lowpass', fcut:0.70, gain:0.26, pan:-0.26, rev:0.56}]),
  /* THE AIR. All of this is quiet on disk and all of it is lifted.
     Together it is what puts energy above 8kHz, which the mallets cannot
     do however they are filtered. */
  ['pad',TRI,{inst:'air', att:0.001, dec:2.0, sus:0, rel:1.4, gain:0.50, pan:0.30, rev:0.50}],
  ['pad',SHK,{inst:'air', att:0.001, dec:0.5, sus:0, rel:0.22, gain:0.44, pan:-0.32, rev:0.20}],
  ['pad',CAB,{inst:'air', att:0.001, dec:0.6, sus:0, rel:0.26, gain:0.40, pan:0.34, rev:0.22}],
  ['pad',BTR,{inst:'air', att:0.001, dec:3.0, sus:0, rel:2.0, gain:1.60, pan:0.08, rev:0.62}],
  ['pad',FCY,{inst:'air', att:0.001, dec:2.4, sus:0, rel:1.6, gain:0.70, pan:-0.20, rev:0.54}],
  ['pad',WBL,{inst:'air', att:0.001, dec:0.30, sus:0, rel:0.14, gain:0.30, pan:0.26, rev:0.14}],
  /* THE PULSE. Loudest in the piece, on the beat, never nudged. */
  ['pad',KIK,{inst:'pulse', att:0.001, dec:0.62, sus:0, rel:0.26, pitch:-2,
    ftype:'lowpass', fcut:0.34, drv:0.26, gain:1.45, pan:0, rev:0.05}],
  ...SUB.map(p=>['pad',p,{inst:'pulse', att:0.004, dec:2.4, sus:0.55, rel:0.60,
    ftype:'lowpass', fcut:0.20, drv:0.18, gain:0.86, pan:0, rev:0.06}]),
]);

/* one room for everything, and only a little of it: the air is carried
   by real recordings here and does not need reverb to fake it */
await call('set',{bpm:BPM, swing:0, human:0.018, humanDrift:0.10,
  revType:'room', revSize:1.9, revLvl:0.34, dlyMode:'digital', delayFb:0.22, dlyTone:7200,
  compAmt:0.20, mWidth:1.10, mMono:95, mCeil:-3.0, mAir:2.4, mMud:-1.6, mEqMid:0,
  scOn:true, scAmt:0.22, scSrc:KIK, masterVol:1.0, mTrim:0});

/* ---- THE THEME ---------------------------------------------------------
   Four notes and a rhythm, in scale degrees from D so every variation
   stays in the mode. It is stated plainly before anything is done to it,
   because a theme nobody has heard cannot be developed. */
const SC=[0,2,3,5,7,9,10];                      // D dorian: D E F G A B C
const deg=(base,d)=>{ const o=Math.floor(d/7), k=((d%7)+7)%7; return base+12*o+SC[k]; };
const FIG   =[0,2,1,4];                         // D F E A — the subject
const FIG_R =[0,3,6,8];                         // its rhythm, in steps
const B=(bar,st)=>bar*16+st;

/* the five things done to it over the piece */
const say=(bar,base,{t=0, inv=false, aug=1, only=4, vel=0.72, inst='vib'}={})=>{
  const o=[];
  for(let i=0;i<Math.min(only,FIG.length);i++){
    const d=(inv? -FIG[i] : FIG[i]) + t;
    const st=Math.round(FIG_R[i]*aug);
    if(st>=16*aug+8) break;
    o.push(['note', inst, deg(base,d), B(bar,0)+st, vel,
      {beats:(aug>1?1.4:0.85)}]);
  }
  return o;
};

/* ---- THE PULSE LAYER ---------------------------------------------------
   Four to the floor is not the point; being audible is. The kick is on
   every beat so there is never a question where the time is, and the
   quiet percussion fills between without ever being the loudest thing. */
const pulseBar=(bar,{half=false, air=1, open=false}={})=>{
  const o=[];
  for(let b=0;b<4;b++){
    if(half && b%2===1) continue;
    o.push(['step',KIK,B(bar,b*4),b===0?0.98:0.88]);
  }
  /* shaker on the offbeat eighths, cabasa on sixteenths — quiet, and
     exactly on the grid, so they thicken the pulse instead of blurring it */
  if(air>0) for(let st=2;st<16;st+=4) o.push(['step',SHK,B(bar,st),0.34+0.10*(st===10?1:0)]);
  if(air>1) for(let st=0;st<16;st+=2) o.push(['step',CAB,B(bar,st),st%4===0?0.20:0.30]);
  if(air>1) o.push(['step',WBL,B(bar,11),0.34]);
  if(open) o.push(['step',TRI,B(bar,0),0.52]);
  return o;
};
const subBar=(bar,i)=>{
  /* the bass moves once a bar and holds, so it reinforces the downbeat
     rather than competing with the mallets for attention */
  const n=[0,0,3,2][i%4];
  return [['step',SUB[n],B(bar,0),0.82,{}],
          ...(i%4===3?[['step',SUB[1],B(bar,10),0.60]]:[])];
};

/* ---- THE PATTERNS ------------------------------------------------------ */
const mk=async(slot,fn)=>{ await call('pattern',slot,{plen:64,clear:true});
  await call('set',{pattern:slot}); await bat(fn()); };

/* 0 — the subject alone, no drums. State it so it can be recognised later. */
await mk(0,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...subBar(bar,bar));
    if(bar%2===0) o.push(...say(bar,62,{vel:0.62}));
    o.push(['step',BTR,B(bar,bar%2?12:4),0.40]);
    for(let st=2;st<16;st+=4) o.push(['step',SHK,B(bar,st),0.22]);
  }
  return o; });

/* 1 — the pulse arrives under the same subject, unchanged */
await mk(1,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...pulseBar(bar,{air:1, open:bar===0}), ...subBar(bar,bar));
    o.push(...say(bar,62,{vel:0.74}));
    if(bar===3) o.push(['step',FCY,B(bar,12),0.50]);
  }
  return o; });

/* 2 — the glockenspiel doubles it two octaves up: the same shape, now
       with the top octave the last piece did not have */
await mk(2,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...pulseBar(bar,{air:2}), ...subBar(bar,bar));
    o.push(...say(bar,62,{vel:0.76}));
    o.push(...say(bar,86,{vel:0.46, inst:'glk'}));
    o.push(['step',TRI,B(bar,8),0.30]);
  }
  return o; });

/* 3 — transposed up a third, with the marimba on the four notes it owns */
await mk(3,()=>{ const o=[];
  const MARN=[48,55,59,65];
  for(let bar=0;bar<4;bar++){
    o.push(...pulseBar(bar,{air:2}), ...subBar(bar,bar+2));
    o.push(...say(bar,62,{t:2, vel:0.74}));
    o.push(...say(bar,86,{t:2, vel:0.44, inst:'glk'}));
    for(let k=0;k<4;k++) o.push(['note','mar',MARN[(bar+k)%4],B(bar,k*4+2),0.40+0.08*(k===0?1:0)]);
  }
  return o; });

/* 4 — inverted. The same intervals turned upside down, which is why it
       still sounds like the subject while going the other way. */
await mk(4,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...pulseBar(bar,{air:2}), ...subBar(bar,bar+1));
    o.push(...say(bar,69,{inv:true, vel:0.74}));
    if(bar%2===1) o.push(...say(bar,86,{inv:true, vel:0.42, inst:'glk'}));
    o.push(['note','hch',deg(62,[0,4,2,5][bar]),B(bar,0),0.40,{beats:3.6}]);
  }
  return o; });

/* 5 — the drums drop out and the hand chimes hold it open. The air layer
       keeps going, so the top of the mix never disappears. */
await mk(5,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(['note','hch',deg(62,[0,2,4,2][bar]),B(bar,0),0.44,{beats:3.8}]);
    o.push(['note','hch',deg(62,[4,5,7,6][bar]),B(bar,8),0.34,{beats:2.0}]);
    o.push(...say(bar,86,{only:bar<2?2:4, vel:0.40, inst:'glk'}));
    o.push(['step',BTR,B(bar,0),0.46], ['step',TRI,B(bar,10),0.30]);
    for(let st=2;st<16;st+=4) o.push(['step',SHK,B(bar,st),0.26]);
    if(bar===3) o.push(['step',KIK,B(bar,12),0.70], ['step',FCY,B(bar,12),0.56]);
  }
  return o; });

/* 6 — everything, with the subject augmented underneath: the same four
       notes at half speed, which is how it stays recognisable while the
       surface gets busy */
await mk(6,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...pulseBar(bar,{air:2, open:bar===0}), ...subBar(bar,bar));
    if(bar%2===0) o.push(...say(bar,50,{aug:2, vel:0.70, inst:'mar'}));
    o.push(...say(bar,62,{vel:0.78}));
    o.push(...say(bar,86,{t:bar%2?2:0, vel:0.48, inst:'glk'}));
    o.push(['note','hch',deg(62,[0,2,4,1][bar]),B(bar,8),0.30,{beats:2.2}]);
  }
  return o; });

/* 7 — the fragment: the first two notes only, thinning out */
await mk(7,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    if(bar<2) o.push(...pulseBar(bar,{half:bar===1, air:1}));
    o.push(...subBar(bar,bar));
    o.push(...say(bar,62,{only:bar<2?3:2, vel:0.70-0.12*bar}));
    o.push(...say(bar,86,{only:2, vel:0.40-0.08*bar, inst:'glk'}));
    o.push(['step',BTR,B(bar,0),0.40]);
    if(bar===3) o.push(['note','hch',deg(62,0),B(bar,0),0.40,{beats:3.8}]);
  }
  return o; });

/* ---- THE ARRANGEMENT --------------------------------------------------- */
await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:0,reps:1},{pat:1,reps:1},{pat:2,reps:1},{pat:3,reps:1},
        {pat:2,reps:1},{pat:4,reps:1},{pat:5,reps:1},{pat:6,reps:1},
        {pat:3,reps:1},{pat:6,reps:1},{pat:7,reps:1}]});

/* ---- WHAT THE TOOLS SAY BEFORE IT IS RENDERED -------------------------- */
const sch=await call('schedule',{src:'song',full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s · stretched '+JSON.stringify(sch.stretched));

const pul=await call('pulse',{src:'song'});
console.log('\nPULSE  autocorr '+pul.pulseStrength+'   on bar '+pul.onGrid.bar+'%  beat '+pul.onGrid.beat
  +'%  eighth '+pul.onGrid.eighth+'%  sixteenth '+pul.onGrid.sixteenth+'%');
console.log('       unweighted beat '+pul.onGridUnweighted.beat+'% → buried-by '+pul.beatBuriedBy);
for(const q of pul.pads.slice(0,5)) console.log('       '+q.name.slice(0,18).padEnd(20)
  +'weight '+String(q.weight).padStart(7)+'   on-beat '+q.onBeat+'%');
for(const f of pul.findings) console.log('   ! '+f);

for(const v of ['vib','glk','mar']){
  const mo=await call('motif',v,{src:'song'});
  if(mo && mo.pitchRecurrence!=null)
    console.log('MOTIF  '+v.padEnd(4)+String(mo.notes).padStart(4)+' notes   pitch '+mo.pitchRecurrence
      +' (norm '+mo.norm.pitch+', floor '+mo.norm.pitchFloor+')   rhythm '+mo.rhythmRecurrence
      +' (norm '+mo.norm.rhythm+')'+(mo.findings.length?'  ! '+mo.findings[0].slice(0,60):''));
}
const cr=await call('critique',{src:'song'});
console.log('\ncritique:'); for(const f of cr.found) console.log('   ['+f.severity+'] '+f.says.slice(0,105));
if(!cr.found.length) console.log('   (nothing)');

/* ---- LEVEL ------------------------------------------------------------- */
let best=null;
for(const [trim,amt] of [[-14,0.16],[-11,0.18],[-8,0.20],[-5,0.24]]){
  await call('set',{mTrim:trim, compAmt:amt});
  const m=await call('render',{src:'song',loops:1,loudness:true});
  console.log('   trim '+trim+' → '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
    +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
  const miss=Math.abs(m.lufs+12.0);
  if(!m.clipping && m.truePeakDb<=-1.0 && m.crestDb>=9 && (!best||miss<best.miss)) best={trim,amt,miss,m};
}
if(!best) throw new Error('nothing cleared the ceiling and crest floor');
console.log('   chosen trim '+best.trim+' → '+best.m.lufs.toFixed(1)+' LUFS, crest '+best.m.crestDb.toFixed(1));
await call('set',{mTrim:best.trim, compAmt:best.amt});
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'anneal.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
