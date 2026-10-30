/* ANNEAL — D dorian, 132bpm. Struck metal and wood over a bass you can
   actually follow.

   SECOND VERSION, AGAINST THREE SPECIFIC COMPLAINTS. The first bounce
   came back as: a good foundation, the bridge is the best part, but the
   bass isn't clear, almost everything needs more sub including the real
   kick, and the bells are louder than you expect.

   All three were measurable, and two of the three were measurable by
   tools in this app that the first version never ran. It used six of
   the seventeen checks here. loudness(), translate() and spectrum() were
   among the eleven it skipped, and they are exactly the three that had
   the answers. review() exists now so that cannot happen again, and this
   file calls it.

   THE BELLS. loudness() renders each pad alone and reports perceived
   loudness beside raw energy. The gap is the whole point: the ear is
   10-15dB more sensitive around 3kHz than at 100Hz, so bright metal
   reads far louder than any RMS meter says. Measured on the first
   bounce:

       Marimba 48      +22.0dB louder than its own energy
       Triangle        +16.4
       Tubular glock   +14.1 and +14.2

   Those four are the "louder than you expect". Nothing was wrong with
   the level in the meter; the meter was the wrong instrument. They come
   down here, and their high shelves come down with them.

   THE BASS. This is not a level problem, which matters because the
   obvious response — more sub — would have made it worse. Normalised
   against each track's own total, the first bounce sat 1.1dB BELOW the
   reference at 20Hz and 2.0dB ABOVE it at 60Hz. The low end was already
   there. What it did not have was any way to be identified: the sub was
   a near-pure sine, measured at -6.1dB in 20-60Hz and -18.2dB by
   500Hz-1kHz. A sine has no harmonics, so it has no pitch anywhere a
   small speaker can reach, and translate() put the loss at 10.5dB with
   the bass group the worst offender at 20.2dB. Its own words: a bass
   carries on a small speaker through its HARMONICS, not its
   fundamental.

   So the bass is three layers now, which is what the one piece here with
   a bass that worked already did:
     - a sine for weight, below 120Hz, doing nothing else
     - the same notes an octave up, driven hard, living in 150-800Hz:
       this is the layer that is audible on a phone and the layer that
       tells you what the note IS
     - and the kick gets its own sub thump, because "even the real kick
       samples" need it and a synthesised kick rolled off at 0.34 has
       nothing under 80Hz to give.

   And pulling the bells down makes the bass more prominent without
   adding a decibel to it, which is the other half of why it read as
   weak.

   THE BRIDGE GETS DEVELOPED, since it was the part that landed: it had
   one pattern and now has two, the second taking the same open harmony
   and putting the subject underneath it augmented while the pulse comes
   back. Eight pattern slots is the hard limit, so length comes from
   arrangement and from automation making the repeats differ rather than
   from more material.

   ON THE KEY, unchanged and worth restating: the vibraphone is sampled
   on the white notes only, every major third, so D dorian is the one
   mode it plays with almost no transposition. The tubular glock covers
   C D E F# G A B at a maximum gap of 2 semitones. The marimba has only
   C, F, G and B, so it gets figures on those four notes rather than a
   line it would have to be dragged through. */

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
await call('instrument','vib',{pack:MAL, match:'^vc:vibh-', lo:57, hi:84, max:9});
await call('instrument','glk',{pack:MAL, match:'^vc:tglock-', lo:91, hi:105, max:9});
await call('instrument','mar',{pack:MAL, match:'^vc:marimba-', lo:41, hi:72, max:5});
await call('instrument','hch',{pack:MAL, match:'^vc:hchime-', lo:62, hi:86, max:8});
const P=(n)=>call('instPads',n).then(l=>l.map(x=>x.pad));
const VIB=await P('vib'), GLK=await P('glk'), MAR=await P('mar'), HCH=await P('hch');

/* the small bright metal, one sample to a pad */
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

/* THE PULSE AND THE BASS. Three bass layers and two kick layers, because
   one of each was the whole problem. */
const KIK=46, KSB=47;
const SUBN=[38,40,41,43,45];                    // D2 E2 F2 G2 A2
const SUB=[48,49,50,51,52];                     // sine, weight only
const BAS=[53,54,55,56,57];                     // octave up, driven: the NOTE
await call('preset','dkick',KIK,36);
await call('preset','bsub',KSB,26);             // the kick's own sub thump
for(let i=0;i<SUBN.length;i++){
  await call('preset','bsub',SUB[i],SUBN[i]);
  await call('preset','bsub',BAS[i],SUBN[i]+12);
}
console.log('players: vib '+VIB.length+'  glk '+GLK.length+'  mar '+MAR.length
  +'  hch '+HCH.length+'  bass 3 layers');

/* ---- HOW EACH ONE SITS -------------------------------------------------
   Staged from each sample's measured peak first and balanced by ear only
   after that, because gain is a multiplier on whatever the pad holds and
   what these pads hold differs by 35dB on disk — the bell tree peaks at
   -44.4dBFS and the woodblock at -9.1. Setting these by taste once
   collapsed the whole track to kick and sub.

   Then corrected a second time by PERCEIVED loudness rather than energy,
   which is what the bell complaint was about. The four pads loudness()
   named as forward are the four that come down here. */
await bat([
  ...VIB.map(p=>['pad',p,{inst:'vib', att:0.001, dec:3.4, sus:0.18, rel:1.10,
    ftype:'lowpass', fcut:0.92, fres:0.3, gain:1.95, pan:-0.14, rev:0.26, eqMid:5, eqLo:2}]),
  /* was +14dB forward: down 4dB and the shelf nearly off */
  ...GLK.map(p=>['pad',p,{inst:'glk', att:0.001, dec:2.2, sus:0.10, rel:0.80,
    ftype:'off', gain:1.60, pan:0.20, rev:0.40, eqHi:3}]),
  /* was +22dB forward, the worst in the mix */
  ...MAR.map(p=>['pad',p,{inst:'mar', att:0.001, dec:1.5, sus:0.05, rel:0.45,
    ftype:'lowpass', fcut:0.74, gain:0.85, pan:0.10, rev:0.16, eqMid:4, eqLo:2}]),
  ...HCH.map(p=>['pad',p,{inst:'hch', att:0.02, dec:5.0, sus:0.40, rel:2.20,
    ftype:'lowpass', fcut:0.86, gain:1.25, pan:-0.26, rev:0.48, eqMid:5}]),
  /* THE AIR, still the only real source of energy above 8kHz here, but
     no longer pushed to the ceiling: the triangle was +16dB forward. */
  ['pad',TRI,{inst:'air', att:0.001, dec:2.0, sus:0, rel:1.4, gain:1.10, pan:0.30, rev:0.44, eqHi:5}],
  ['pad',SHK,{inst:'air', att:0.001, dec:0.5, sus:0, rel:0.22, gain:1.95, pan:-0.32, rev:0.18, eqHi:8}],
  ['pad',CAB,{inst:'air', att:0.001, dec:0.6, sus:0, rel:0.26, gain:1.95, pan:0.34, rev:0.20, eqHi:9}],
  ['pad',BTR,{inst:'air', att:0.001, dec:3.0, sus:0, rel:2.0, gain:1.60, pan:0.08, rev:0.56, eqHi:7}],
  ['pad',FCY,{inst:'air', att:0.001, dec:2.4, sus:0, rel:1.6, gain:1.80, pan:-0.20, rev:0.50, eqHi:8}],
  ['pad',WBL,{inst:'air', att:0.001, dec:0.30, sus:0, rel:0.14, gain:0.70, pan:0.26, rev:0.12}],
  /* THE PULSE, in two layers. The synth kick rolled off at 0.34 has
     nothing below 80Hz, which is why a real kick still felt light. */
  ['pad',KIK,{inst:'pulse', att:0.001, dec:0.60, sus:0, rel:0.24, pitch:-2,
    ftype:'lowpass', fcut:0.40, drv:0.22, gain:0.46, pan:0, rev:0.05}],
  ['pad',KSB,{inst:'pulse', att:0.002, dec:0.34, sus:0, rel:0.18,
    ftype:'lowpass', fcut:0.10, gain:0.60, pan:0, rev:0}],
  /* THE BASS, in two more. The sine carries weight and says nothing. */
  ...SUB.map(p=>['pad',p,{inst:'bass', att:0.004, dec:2.4, sus:0.55, rel:0.55,
    ftype:'lowpass', fcut:0.14, drv:0.10, gain:0.26, pan:0, rev:0.04}]),
  /* and this one is the note: an octave up, driven hard, deliberately
     sitting where a phone speaker starts working. It is the layer that
     makes the bass followable rather than merely present. */
  ...BAS.map(p=>['pad',p,{inst:'bass', att:0.003, dec:1.9, sus:0.42, rel:0.45,
    ftype:'lowpass', fcut:0.46, fres:1.1, drv:0.62, crush:11,
    gain:0.26, pan:0, rev:0.10, eqLo:-4, eqMid:2}]),
]);

await call('set',{bpm:BPM, swing:0, human:0.018, humanDrift:0.10,
  revType:'room', revSize:1.9, revLvl:0.32, dlyMode:'digital', delayFb:0.22, dlyTone:7200,
  compAmt:0.16, mWidth:1.10, mMono:95, mCeil:-3.0, mAir:6.0, mMud:0, mEqMid:1,
  scOn:false, masterVol:1.0, mTrim:0});

/* THE LEVELS ABOVE WERE SOLVED, NOT GUESSED.
   Five rounds of setting these by ear each fixed one part of the
   spectrum and broke another — too dark, too bright, a hollow middle,
   then no top octave — because placing seven group levels so that nine
   bands land on a target is a small linear system, not a thing an ear
   does well. balance() renders each group once, then solves it: every
   band inside 1.7dB of the reference, and 8kHz exact.

   Two of its answers are deliberately only half taken, and both for the
   same reason — a curve is not a sound.

   It wants the glockenspiel +11dB, because that is the only thing here
   filling 4kHz. But loudness() has that same pad +14dB forward of its
   own energy: it is one of the "bells louder than you expect", and the
   reference gets its 4kHz from noise-based percussion rather than from
   a pitched bell. Matching the curve that way would re-create the
   complaint. It gets +3.

   And it wants the hand chimes -7dB, which is right for the dense
   pattern the solve ran on and wrong for the piece, because gains are
   global and the hand chimes are the lead voice of the bridge. They get
   -3.4. That gap is a real limitation of solving balance on one
   pattern, and is worth knowing rather than papering over. */

/* ---- THE THEME --------------------------------------------------------- */
const SC=[0,2,3,5,7,9,10];                      // D dorian: D E F G A B C
const deg=(base,d)=>{ const o=Math.floor(d/7), k=((d%7)+7)%7; return base+12*o+SC[k]; };
const FIG   =[0,2,1,4];                         // D F E A — the subject
const FIG_R =[0,3,6,8];                         // its rhythm, in steps
const B=(bar,st)=>bar*16+st;

/* `at` is what stops the glockenspiel being the vibraphone.
   counterpoint() caught the first version shadowing itself: the glock
   played the same figure on the same rhythm three octaves up, which
   measured as 33.5% parallel motion against a norm of 3.6% and 28.7%
   parallel octaves against 0.111%. Two voices in octaves are one voice,
   however far apart they are. Entering the same subject half a bar
   later makes it an answer instead — the material is still shared,
   which is what motif() wants, and the motion is no longer locked,
   which is what counterpoint() wants. */
const say=(bar,base,{t=0, inv=false, aug=1, only=4, vel=0.72, inst='vib', at=0}={})=>{
  const o=[];
  for(let i=0;i<Math.min(only,FIG.length);i++){
    const d=(inv? -FIG[i] : FIG[i]) + t;
    const st=at+Math.round(FIG_R[i]*aug);
    const abs=B(bar,0)+st;
    if(abs>=64) break;                      // the pattern is four bars long
    o.push(['note', inst, deg(base,d), abs, vel, {beats:(aug>1?1.4:0.85)}]);
  }
  return o;
};

/* ---- PULSE AND BASS ---------------------------------------------------- */
const pulseBar=(bar,{half=false, air=1, open=false, sub=true}={})=>{
  const o=[];
  for(let b=0;b<4;b++){
    if(half && b%2===1) continue;
    const v=b===0?0.98:0.88;
    o.push(['step',KIK,B(bar,b*4),v]);
    if(sub) o.push(['step',KSB,B(bar,b*4),v*0.92]);
  }
  if(air>0) for(let st=2;st<16;st+=4) o.push(['step',SHK,B(bar,st),0.78+0.10*(st===10?1:0)]);
  if(air>1) for(let st=0;st<16;st+=2) o.push(['step',CAB,B(bar,st),st%4===0?0.52:0.76]);
  if(air>1) o.push(['step',WBL,B(bar,11),0.52]);
  if(open) o.push(['step',TRI,B(bar,0),0.88]);
  return o;
};
/* both bass layers always move together: they are one instrument. */
const bassBar=(bar,i,{walk=false}={})=>{
  const n=[0,0,3,2][i%4];
  const o=[['step',SUB[n],B(bar,0),0.84], ['step',BAS[n],B(bar,0),0.84]];
  if(i%4===3){ o.push(['step',SUB[1],B(bar,10),0.62], ['step',BAS[1],B(bar,10),0.62]); }
  /* a little movement in the fuller sections, on the driven layer only,
     so the weight stays put while the note moves */
  if(walk){ const m=[4,2][i%2]; o.push(['step',BAS[m],B(bar,12),0.54]); }
  return o;
};

const mk=async(slot,fn)=>{ await call('pattern',slot,{plen:64,clear:true});
  await call('set',{pattern:slot}); await bat(fn()); };

/* 0 — the subject alone */
await mk(0,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...bassBar(bar,bar));
    if(bar%2===0) o.push(...say(bar,62,{vel:0.62}));
    o.push(['step',BTR,B(bar,bar%2?12:4),0.80]);
    for(let st=2;st<16;st+=4) o.push(['step',SHK,B(bar,st),0.52]);
  }
  return o; });

/* 1 — the pulse arrives under it */
await mk(1,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...pulseBar(bar,{air:1, open:bar===0}), ...bassBar(bar,bar));
    o.push(...say(bar,62,{vel:0.74}));
    if(bar===3) o.push(['step',FCY,B(bar,12),0.82]);
  }
  return o; });

/* 2 — the glockenspiel doubles it two octaves up */
await mk(2,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...pulseBar(bar,{air:2}), ...bassBar(bar,bar));
    o.push(...say(bar,62,{vel:0.76}));
    o.push(...say(bar,98,{at:8, only:3, vel:0.52, inst:'glk'}));
    o.push(['step',TRI,B(bar,8),0.62]);
  }
  return o; });

/* 3 — up a third, with the marimba on the four notes it owns */
await mk(3,()=>{ const o=[];
  const MARN=[48,55,59,65];
  for(let bar=0;bar<4;bar++){
    o.push(...pulseBar(bar,{air:2}), ...bassBar(bar,bar+2,{walk:true}));
    o.push(...say(bar,62,{t:2, vel:0.74}));
    o.push(...say(bar,98,{at:8, t:2, only:3, vel:0.50, inst:'glk'}));
    for(let k=0;k<4;k++) o.push(['note','mar',MARN[(bar+k)%4],B(bar,k*4+2),0.64]);
  }
  return o; });

/* 4 — inverted */
await mk(4,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(...pulseBar(bar,{air:2}), ...bassBar(bar,bar+1,{walk:true}));
    o.push(...say(bar,69,{inv:true, vel:0.74}));
    if(bar%2===1) o.push(...say(bar,98,{at:6, inv:true, only:3, vel:0.48, inst:'glk'}));
    o.push(['note','hch',deg(62,[0,4,2,5][bar]),B(bar,0),0.62,{beats:3.6}]);
  }
  return o; });

/* 5 — THE BRIDGE. The part that landed, left alone: drums out, hand
       chimes holding it open, the air layer still running so the top of
       the mix never disappears. */
await mk(5,()=>{ const o=[];
  for(let bar=0;bar<4;bar++){
    o.push(['note','hch',deg(62,[0,2,4,2][bar]),B(bar,0),0.66,{beats:3.8}]);
    o.push(['note','hch',deg(62,[4,5,7,6][bar]),B(bar,8),0.52,{beats:2.0}]);
    o.push(...say(bar,98,{only:bar<2?2:4, vel:0.46, inst:'glk'}));
    o.push(['step',BTR,B(bar,0),0.86], ['step',TRI,B(bar,10),0.60]);
    for(let st=2;st<16;st+=4) o.push(['step',SHK,B(bar,st),0.58]);
    /* the bass stays, quietly, so the floor does not drop out */
    if(bar%2===0) o.push(['step',SUB[[0,0,3,2][bar%4]],B(bar,0),0.52]);
    if(bar===3) o.push(['step',KIK,B(bar,12),0.76], ['step',KSB,B(bar,12),0.70],
      ['step',FCY,B(bar,12),0.86]);
  }
  return o; });

/* 6 — THE BRIDGE, DEVELOPED. Same open harmony, and now the subject
       underneath it augmented while the pulse walks back in. This is the
       "a bit more" — the one section that worked, taken somewhere. */
await mk(6,()=>{ const o=[];
  const MARN=[48,55,59,65];
  for(let bar=0;bar<4;bar++){
    o.push(['note','hch',deg(62,[0,2,5,4][bar]),B(bar,0),0.62,{beats:3.8}]);
    /* the subject at half speed, on the marimba, under the chimes */
    if(bar%2===0) for(let i=0;i<4;i++)
      o.push(['note','mar',MARN[i],B(bar,i*4),0.62,{beats:1.4}]);
    o.push(...say(bar,74,{vel:0.58}));
    o.push(...say(bar,98,{at:10, t:bar>=2?2:0, only:3, vel:0.44, inst:'glk'}));
    /* the pulse returns a layer at a time */
    if(bar>=1){ o.push(['step',KIK,B(bar,0),0.92], ['step',KSB,B(bar,0),0.86]); }
    if(bar>=2){ o.push(['step',KIK,B(bar,8),0.86], ['step',KSB,B(bar,8),0.80]); }
    if(bar>=3) for(let b=0;b<4;b++){ o.push(['step',KIK,B(bar,b*4),b?0.86:0.94],
      ['step',KSB,B(bar,b*4),b?0.80:0.88]); }
    o.push(...bassBar(bar,bar,{walk:bar>=2}));
    for(let st=2;st<16;st+=4) o.push(['step',SHK,B(bar,st),0.62+0.06*bar]);
    o.push(['step',BTR,B(bar,0),0.70]);
  }
  return o; });

/* 7 — everything at once */
await mk(7,()=>{ const o=[];
  const MARN=[48,55,59,65];
  for(let bar=0;bar<4;bar++){
    o.push(...pulseBar(bar,{air:2, open:bar===0}), ...bassBar(bar,bar,{walk:true}));
    if(bar%2===0) o.push(['note','mar',MARN[bar%4],B(bar,0),0.66,{beats:1.4}]);
    o.push(...say(bar,62,{vel:0.80}));
    o.push(...say(bar,98,{at:8, t:bar%2?2:0, only:3, vel:0.54, inst:'glk'}));
    o.push(['note','hch',deg(62,[0,2,4,1][bar]),B(bar,8),0.50,{beats:2.2}]);
    if(bar===3) o.push(['step',FCY,B(bar,14),0.84]);
  }
  return o; });

/* ---- MOVEMENT ACROSS THE REPEATS --------------------------------------
   Eight slots is the limit, so patterns come round more than once and
   automation is what keeps that from being a loop.

   TWO THINGS ABOUT mfilt THAT COST A WHOLE RENDER. It is a master
   LOWPASS, and its normalised value maps to frequency as 120*150^x, so
   the gentle-looking numbers the first version used were brutal: 0.42
   is a lowpass at 984Hz and 0.52 is 1.6kHz. The top octave was being
   removed from the master bus for a third of the track.

   And an automation lane only exists in the pattern that has one. A
   parameter is left wherever the last lane put it, so the 6.6kHz the
   intro ended on was inherited by every pattern after it that had no
   lane of its own. The whole song measured 25dB under the reference at
   8-16kHz while the single pattern the levels were solved on measured
   almost exactly right, and the difference was entirely this.

   So every pattern now states its own value, mostly wide open, and the
   movement that is left is a real but modest sweep. 0.88 is 9.9kHz,
   which is audible as a closing without gutting anything. */
await call('automate','mfilt',[[0,0.74],[40,0.92],[63,1.0]],{pattern:0});
await call('automate','mfilt',[[0,1.0]],{pattern:1});
await call('automate','mfilt',[[0,1.0]],{pattern:2});
await call('automate','mfilt',[[0,1.0]],{pattern:3});
await call('automate','mfilt',[[0,1.0]],{pattern:4});
await call('automate','mfilt',[[0,1.0],[32,0.94],[63,0.88]],{pattern:5});
await call('automate','mfilt',[[0,0.90],[32,0.96],[63,1.0]],{pattern:6});
await call('automate','mfilt',[[0,1.0]],{pattern:7});
/* level moves between sections, so the piece has somewhere to go */
await call('automate','mvol',[[0,0.62],[63,0.78]],{pattern:0});
await call('automate','mvol',[[0,0.86]],{pattern:1});
await call('automate','mvol',[[0,0.90]],{pattern:2});
await call('automate','mvol',[[0,0.90]],{pattern:3});
await call('automate','mvol',[[0,0.92]],{pattern:4});
await call('automate','mvol',[[0,0.78],[63,0.74]],{pattern:5});
await call('automate','mvol',[[0,0.80],[63,0.94]],{pattern:6});
await call('automate','mvol',[[0,0.98],[63,0.92]],{pattern:7});

/* ---- THE ARRANGEMENT --------------------------------------------------- */
await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:0,reps:1},{pat:1,reps:1},{pat:2,reps:1},{pat:3,reps:1},
        {pat:2,reps:1},{pat:4,reps:1},
        {pat:5,reps:1},{pat:6,reps:1},
        {pat:7,reps:1},{pat:3,reps:1},{pat:7,reps:1},
        {pat:5,reps:1},{pat:6,reps:1},
        {pat:7,reps:1},{pat:0,reps:1}]});

/* ---- ASK THE APP WHAT IS WRONG, ALL OF IT ------------------------------
   The first version of this file ran six of the seventeen checks and the
   three it needed were among the eleven it skipped. review() runs the
   lot and says which ones it could not reach. */
const sch=await call('schedule',{src:'song',full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s · stretched '+JSON.stringify(sch.stretched));

await call('reference','salvage3.wav');
const rv=await call('review',{src:'song'});
console.log('\nREVIEW — '+rv.says);
for(const f of rv.findings) console.log('  ['+f.severity+'] '+f.says.slice(0,108)
  +(f.fix?'\n        → '+f.fix.slice(0,96):''));
console.log('\nchecks run: '+rv.ran.join(' '));
for(const k of rv.skipped) console.log('  could not run: '+k);

const cmp=await call('compare',{src:'song'});
if(cmp&&cmp.bands){
  console.log('\nAGAINST salvage3, each normalised to its own total:');
  for(const b of cmp.bands) console.log('   '+String(b.band).padStart(6)+'Hz  '
    +(b.delta>=0?'+':'')+b.delta.toFixed(1)+' dB');
}
const tr=await call('translate',{src:'song'});
console.log('\nsmall speaker: '+tr.says.slice(0,150));

/* ---- LEVEL ------------------------------------------------------------- */
/* THE LADDER HAS TO BRACKET THE TARGET, and this one did not. Adding a
   third bass layer and a sub thump to the kick made the mix far hotter
   than the version these numbers were chosen for, so the quietest rung
   on the ladder still came out at -9.5 LUFS with the crest already
   collapsed to 8.1 — every remaining rung was louder, nothing could
   pass the gate, and the run threw instead of writing a file. The gate
   was right and the search was looking in the wrong place. */
let best=null;
for(const [trim,amt] of [[-20,0.10],[-17,0.12],[-14,0.14],[-11,0.16]]){
  await call('set',{mTrim:trim, compAmt:amt});
  const m=await call('render',{src:'song',loops:1,loudness:true});
  console.log('   trim '+trim+' → '+m.lufs.toFixed(1)+' LUFS  tp '+m.truePeakDb.toFixed(2)
    +'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
  const miss=Math.abs(m.lufs+11.5);
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
