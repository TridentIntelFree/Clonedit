/* SALVAGE — everything percussive here is a field recording.

   A door knock is the kick, breaking glass is the snare, a dripping tap
   is the hi-hat, a mouse click is the ghost note, a footstep is the tom.
   They were chosen by crest factor rather than by category name: the
   water drop measured 38.6dB peak-to-RMS and the footstep 36.8, which is
   more percussive than most drum samples, while the washing machine at
   11.1 is steady enough to be a drone.

   Nothing here has to sound like anything. That is the point — every
   previous attempt failed by asking a sample to impersonate an
   instrument, and a knock on a door impersonating a kick drum is only
   ever going to be judged on whether it hits. The piano is the one
   voice left alone, as the thing to listen to while the rest is being
   broken up. */
import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync } from 'node:fs';
const OUT='/home/user/Clonedit/', BPM=150;
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

const fk=await call('instrument','fk',{pack:'samples/foundkit.json',match:'^fk:'});
const pf=await call('instrument','pf',{pack:'samples/salamander.json',match:'^sal:',lo:40,hi:88,max:18});
const padsOf=async n=>await call('instPads',n);
const F={}; for(const p of await padsOf('fk')) F[p.note]=p.pad;
/* THE LOW END HAS TO BE SYNTHESISED.

   Measured on the previous pass, 40-80Hz was the QUIETEST band in the
   whole track and the energy peaked at 320-640 — the midrange. A door
   knock pitched down fourteen semitones does not become a kick drum,
   because pitching moves what was recorded and a knock has almost no
   fundamental to move. So the weight comes from the synthesiser that
   ships in the page: one 808 per note of the bassline, each rendered at
   its own pitch, plus a sine kick layered under the knock. The knock
   keeps the character and stops being asked to carry the bottom too. */
const BN=[33,36,38,40,43];          // A1 C2 D2 E2 G2
const BASS={};
for(let i=0;i<BN.length;i++){ const pad=40+i;
  await call('preset','b808',pad,BN[i]); BASS[BN[i]]=pad; }
const SUBK=46, GROWL=47;
await call('preset','dkick',SUBK,36);
await call('preset','breese',GROWL,38);
const KICK=F[36], KNOCK=F[37], SNARE=F[38], CLICK=F[39], TYPE=F[40],
      HAT=F[42], CAN=F[43], TOM=F[45], BELL=F[51], DRONE=F[60], FIRE=F[61], RAIN=F[62];
console.log('found kit: '+fk.pads.length+' pads · piano: '+pf.pads.length+' notes');

/* ---- SHAPING. Each pad trimmed to where its sound actually starts, then
   pushed somewhere it was never going to go on its own. ------------------ */
const S5=1/5;   // the clips are five seconds, trims are fractions
await bat([
  /* a door knock dropped two octaves and crushed is a kick drum */
  ['pad',KICK, {start:0.040,end:0.090, pitch:-9, att:0.001,dec:0.26,sus:0,rel:0.10,
    drv:0.42, crush:7, ftype:'bandpass', fcut:0.44, fres:1.4, gain:1.15, pan:0, rev:0.05, vary:0.06}],
  ['pad',KNOCK,{start:0.135,end:0.190, pitch:-9, att:0.001,dec:0.18,sus:0,rel:0.08,
    drv:0.30, crush:9, gain:0.62, pan:-0.18, rev:0.10, vary:0.10}],
  /* breaking glass, gated hard, is a snare */
  ['pad',SNARE,{start:0.024,end:0.085, pitch:-3, att:0.001,dec:0.20,sus:0,rel:0.09,
    drv:0.22, crush:10, ftype:'highpass', fcut:0.16, gain:1.15, pan:0.05, rev:0.26, vary:0.12}],
  /* a dripping tap is the most percussive thing in the whole dataset */
  ['pad',HAT,  {start:0.252,end:0.278, pitch:7, att:0.001,dec:0.07,sus:0,rel:0.04,
    ftype:'highpass', fcut:0.34, gain:1.80, pan:0.26, rev:0.10, vary:0.22}],
  ['pad',CLICK,{start:0.902,end:0.922, pitch:12, att:0.001,dec:0.05,sus:0,rel:0.03,
    ftype:'highpass', fcut:0.40, gain:1.35, pan:-0.30, rev:0.08, vary:0.25}],
  ['pad',TYPE, {start:0.196,end:0.230, pitch:5, att:0.001,dec:0.08,sus:0,rel:0.04,
    gain:0.95, pan:0.34, rev:0.12, vary:0.24}],
  ['pad',TOM,  {start:0.900,end:0.960, pitch:-7, att:0.001,dec:0.22,sus:0,rel:0.10,
    drv:0.26, gain:0.58, pan:0.18, rev:0.22, vary:0.14}],
  ['pad',CAN,  {start:0.096,end:0.150, pitch:3, att:0.001,dec:0.14,sus:0,rel:0.06,
    crush:8, gain:0.95, pan:-0.26, rev:0.16, vary:0.20}],
  /* a church bell is the one found sound allowed to stay tonal */
  ['pad',BELL, {start:0.656,end:0.780, pitch:0, att:0.002,dec:1.2,sus:0.3,rel:0.5,
    ftype:'bandpass', fcut:0.52, fres:2.0, gain:0.90, pan:0.10, rev:0.42, vary:0.05}],
  /* a washing machine, granulated, is a pad */
  ['pad',DRONE,{mode:'grain', grSize:0.18, grDens:22, grSpread:0.22, grPitch:5,
    grBurst:1.6, start:0.08,end:0.92, pitch:-12, ftype:'lowpass', fcut:0.42, fres:1.2,
    gain:0.80, pan:-0.10, rev:0.40}],
  /* fire and rain stay whole and get sliced per step instead */
  ['pad',FIRE, {start:0,end:1, att:0.002,dec:0.6,sus:0,rel:0.08, pitch:-5,
    ftype:'bandpass', fcut:0.46, fres:1.6, gain:1.5, pan:0.22, rev:0.24, vary:0.10}],
  ['pad',RAIN, {start:0,end:1, att:0.004,dec:1.0,sus:0,rel:0.14, pitch:-3,
    ftype:'highpass', fcut:0.22, gain:0.80, pan:-0.22, rev:0.30, reverse:true}],
]);
await bat([
  /* the 808s: long, round, and ducked out of the kick's way by the sidechain */
  ...BN.map(n=>['pad',BASS[n],{att:0.004, dec:2.4, sus:0.55, rel:0.30,
    ftype:'lowpass', fcut:0.30, fres:0.8, drv:0.14, gain:0.44, pan:0, rev:0.03}]),
  /* a sine kick under the door knock — body under character */
  ['pad',SUBK,{att:0.001, dec:0.34, sus:0, rel:0.10, ftype:'lowpass', fcut:0.22,
    drv:0.20, gain:0.52, pan:0, rev:0.02}],
  /* a Reese for the hard section, filtered and moving */
  ['pad',GROWL,{att:0.01, dec:1.6, sus:0.5, rel:0.2, ftype:'lowpass', fcut:0.26,
    fres:3.2, drv:0.3, gain:0.40, pan:0.05, rev:0.10,
    lfoOn:true, lfoTgt:'cutoff', lfoShape:'tri', lfoRate:0.65, lfoDepth:0.55}]]);
await bat((await padsOf('pf')).map(p=>['pad',p.pad,{sus:1, rel:0.5, dec:3.0, att:0.001,
  keepTime:false, ftype:'off', drv:0, relGain:0.3, layXf:0.26, pan:-0.08,
  rev:0.26, gain:2.0, eqLo:-1.5, eqHi:0}]));
await call('set',{bpm:BPM, swing:0, human:0.05, humanDrift:0.30,
  revType:'plate', revSize:1.9, revLvl:0.44, dlyMode:'digital', delayFb:0.28, dlyTone:5200,
  compAmt:0.26, mWidth:1.14, mCeil:-3.0, mAir:1.6, mMud:-2.0, mEqMid:0.6,
  scOn:true, scTrig:KICK, scDepth:0.26, scRel:0.13, masterVol:1.0, mTrim:0});


/* ---- THROUGH-COMPOSED, WHICH IS WHAT THE GENRE IS ----------------------

   The previous pass had one groove() writing the same four bars of kick
   and snare everywhere it was called, so the variation lived entirely in
   the texture layer and the drums looped. In this music the programming
   IS the complexity: no bar repeats, the fills are not in the same place
   twice, and the hits themselves differ because each one enters its own
   recording at a different point.

   Generated from a SEEDED generator rather than typed, so it is varied
   and still identical on every render. Random is not musical on its own,
   so the skeleton is fixed — kick on the one, glass on the backbeat —
   and only the ghosts, the ratchets, the slice points and the fills are
   allowed to move. */
let _s=20261022;
const rnd=()=>{ _s=(_s*1103515245+12345)&0x7fffffff; return _s/0x7fffffff; };
const chance=p=>rnd()<p;
const pickOf=a=>a[Math.floor(rnd()*a.length)%a.length];
/* where in the glass recording each snare hit starts, so no two cracks
   are the same crack */
const GLASS=[0.024,0.031,0.046,0.058,0.071,0.085,0.102,0.118];
const KNOCKS=[0.040,0.052,0.063,0.075];
/* measured: the loudest 30ms windows in the recording, spread so each is
   a distinct crackle. Guessed points landed in the gaps between them,
   which is why the pad read sixty decibels under the mix. */
const FIREP=[0.030,0.072,0.114,0.174,0.222,0.420,0.504,0.528,0.570,0.882,0.942];

const P=i=>call('set',{pattern:i});
for(let i=0;i<8;i++) await call('pattern',i,{plen:64,clear:true});
const B=(bar,st)=>bar*16+st;
const slice=(pad,rows)=>bat(rows.map(([st,v,s,len,extra])=>
  ['step',pad,st,v,Object.assign({start:s, len:len}, extra||{})]));
const bass=(rows,k=1)=>bat(rows.map(([st,n,bt,v])=>
  ['step',BASS[n],st,(v==null?0.85:v)*k,{len:bt*(60/BPM)}]));

/* one bar of drums, never the same twice */
function barOf(bar, d){
  const o=[];                       // [pad, step, vel, locks]
  const add=(pad,st,v,lk)=>o.push([pad,B(bar,st),v,lk||{}]);
  /* SKELETON — the thing that keeps it a groove */
  add(KICK,0,0.95,{start:pickOf(KNOCKS)});
  add(SUBK,0,0.90);
  add(SNARE,4,0.86,{start:pickOf(GLASS)});
  add(SNARE,12,0.88,{start:pickOf(GLASS), rat: chance(0.22*d)?pickOf([2,3]):undefined});
  /* a second kick, somewhere different every bar */
  const k2=pickOf([6,7,10,11,13,14]);
  add(KICK,k2,0.62+0.2*rnd(),{start:pickOf(KNOCKS)}); add(SUBK,k2,0.58);
  /* ghosts: density rises with d */
  for(let st=0;st<16;st++){
    if(st===0||st===4||st===12||st===k2) continue;
    if(chance(0.13*d)) add(CLICK,st,0.22+0.22*rnd(),
      {nudge:(rnd()*2-1)*0.12, rat: chance(0.18)?pickOf([2,3,4]):undefined});
    if(chance(0.10*d)) add(TYPE,st,0.20+0.18*rnd(),{nudge:(rnd()*2-1)*0.10});
    if(chance(0.07*d)) add(CAN,st,0.26+0.2*rnd());
  }
  /* a chopped grain of fire, two or three a bar */
  const nf=2+Math.floor(rnd()*2);
  for(let i=0;i<nf;i++) add(FIRE,pickOf([2,3,5,6,9,10,13,15]),0.34+0.22*rnd(),
    {start:pickOf(FIREP), len:0.10+0.14*rnd(), rat: chance(0.2)?2:undefined});
  /* every fourth bar turns into a fill instead of resolving */
  if(bar===3){
    for(let st=8;st<16;st++){
      if(chance(0.55+0.2*d)) add(pickOf([SNARE,TOM,KICK,CLICK]),st,
        0.4+0.4*rnd(), {start: chance(0.5)?pickOf(GLASS):undefined,
          rat: chance(0.45)?pickOf([2,3,4]):undefined,
          nudge:(rnd()*2-1)*0.14});
    }
  }
  return o;
}
const drums=async(d=1,bars=4)=>{
  const rows=[];
  for(let b=0;b<bars;b++) rows.push(...barOf(b,d));
  await bat(rows.map(([pad,st,v,lk])=>{
    const L={}; for(const k in lk) if(lk[k]!==undefined) L[k]=lk[k];
    return ['step',pad,st,v,L]; }));
};
/* the tap keeps running in its own metre underneath all of it */
const tap=async(k=1,n=9)=>{
  await call('euclid',HAT,n,16,0,0.46*k,{prob:0.9});
  await call('pattern',null,{len:{[HAT]:pickOf([13,14,15])}});
};
const BASSLINE=[[B(0,0),33,1.4],[B(0,10),33,0.7],[B(1,6),36,1.6],
  [B(2,0),40,1.4],[B(2,11),38,0.7],[B(3,4),36,1.2],[B(3,12),43,0.9,0.7]];
const BASS2=[[B(0,0),36,1.2],[B(0,11),38,0.6],[B(1,4),40,1.4],[B(1,13),36,0.6],
  [B(2,0),33,1.6],[B(2,10),33,0.6],[B(3,2),43,1.0],[B(3,10),40,1.2]];

/* 0 — the room */
await P(0);
await bat([['step',DRONE,0,0.5],['step',DRONE,B(2,0),0.45]]);
await slice(RAIN,[[B(0,0),0.5,0.10,1.4],[B(2,0),0.45,0.52,1.4]]);
await bat([['step',CLICK,B(1,6),0.3],['step',CLICK,B(1,11),0.26],
  ['step',TYPE,B(3,4),0.3],['step',CLICK,B(3,12),0.34,{rat:3}]]);
/* 1 — the groove arrives, already not repeating */
await P(1); await drums(0.7); await tap(1,9);
await bass(BASSLINE,0.9);
await bat([['step',DRONE,0,0.42],['step',DRONE,B(2,0),0.38]]);
/* 2 — piano over it */
await P(2); await drums(1.0); await tap(1,11);
await bass(BASSLINE,1);
await bat([['step',DRONE,0,0.42],['step',DRONE,B(2,0),0.38]]);
const FIG=[[0,69,1.2],[6,72,0.8],[10,76,1.0],[16,74,1.2],[22,71,0.8],[26,69,1.0],
           [32,67,1.2],[38,71,0.8],[42,74,1.0],[48,76,1.4],[56,72,1.6]];
await bat(FIG.map(([st,m,bt])=>['note','pf',m,st,0.95,{beats:bt}]));
await call('phrase','pf',0,63,{vel:'arch', time:'free'});
/* 3 — denser, the bell answering, a different bassline */
await P(3); await drums(1.35); await tap(1,13);
await bass(BASS2,1);
await bat([['step',DRONE,0,0.40]]);
await bat(FIG.filter((_,i)=>i%2===0).map(([st,m,bt])=>
  ['note','pf',m+(st>31?5:0),st,0.92,{beats:bt}]));
await bat([['step',BELL,B(0,0),0.5,{pitch:0}],['step',BELL,B(2,8),0.44,{pitch:-5}],
  ['note','pf',[64,69],B(1,8),0.7,{beats:1.2}]]);
/* 4 — it drops out */
await P(4);
await bat([['step',DRONE,0,0.5],['step',RAIN,B(1,0),0.4,{start:0.3,len:2.0}],
  ['step',BASS[33],B(0,0),0.6,{len:3.0}],['step',BASS[36],B(2,0),0.55,{len:3.0}]]);
await bat([[0,69,2],[16,67,2],[32,65,2.4],[48,64,3]].map(([st,m,bt])=>
  ['note','pf',m,st,0.8,{beats:bt}]));
await bat([['note','pf',[52,57,60,64],B(2,8),0.7,{beats:2.4}]]);
await call('phrase','pf',0,63,{vel:'dim', time:'rit'});
/* 5 — hardest: the kick crushed further, the Reese underneath, ratchet storm */
await P(5); await drums(1.9); await tap(1,13);
await bass(BASS2,1);
await bat([['step',GROWL,B(1,0),0.6,{len:1.2}],['step',GROWL,B(3,0),0.6,{len:1.2}],
  ['step',DRONE,0,0.38],
  ['automate','mfilt',[[0,0.62],[40,0.96],[63,0.74]]]]);
await bat(FIG.filter((_,i)=>i%3===0).map(([st,m,bt])=>['note','pf',m,st,0.9,{beats:bt}]));
/* 6 — a pad in its own metre: clicks at five against the four */
await P(6); await drums(0.8); await tap(0.8,7);
await bass([[B(0,0),33,3.4],[B(2,0),40,3.4]],0.85);
await call('poly',CLICK,{on:true,bpm:BPM*5/4,cells:5,lock:true,trig:'step',
  row:[[0,.38],[1,.22],[2,.30],[3,.20],[4,.26]]});
await bat([0,1,2,3].flatMap(b=>[[B(b,0),0.5],[B(b,8),0.45]])
  .map(([st,v])=>['step',CLICK,st,v]));
await bat([[0,0],[12,-5],[24,-7],[36,-12],[48,-5],[56,0]].map(([st,pt])=>
  ['step',BELL,st,0.55,{pitch:pt}]));
await bat([['note','pf',64,B(1,0),0.7,{beats:2}],['note','pf',69,B(3,0),0.75,{beats:2}]]);
/* 7 — out */
await P(7); await call('pattern',7,{plen:32,bpm:120});
await bat([['step',DRONE,0,0.5],['step',KICK,0,0.8],['step',SUBK,0,0.9],
  ['step',BASS[33],0,0.9,{len:2.4}],['step',SNARE,B(1,4),0.6,{rat:2}]]);
await slice(RAIN,[[B(0,8),0.4,0.2,2.2]]);
await bat([['note','pf',[52,57,64,69],B(1,8),0.8,{beats:6}]]);
await call('set',{pattern:0, songOn:true, songLoop:false,
  song:[{pat:0,reps:1},{pat:1,reps:1},{pat:2,reps:2},{pat:3,reps:2},
        {pat:5,reps:1},{pat:4,reps:1},{pat:6,reps:2},{pat:5,reps:2},
        {pat:3,reps:1},{pat:2,reps:1},{pat:7,reps:1}]});

/* ---- check ------------------------------------------------------------ */
await call('set',{pattern:5, songOn:false});
console.log('\ncritique() on the hardest pattern:');
const cr=await call('critique',{src:'pat'});
for(const f of cr.found) console.log('   ['+f.area+'/'+f.severity+'] '+f.says);
if(!cr.found.length) console.log('   (nothing)');
console.log('\nbalance:');
const grp={fk:(await padsOf('fk')).map(p=>p.pad), pf:(await padsOf('pf')).map(p=>p.pad),
  sub:[...BN.map(n=>BASS[n]),SUBK,GROWL]};
for(const n of ['fk','pf','sub']){
  await bat(Array.from({length:64},(_,i)=>['pad',i,{mute:!grp[n].includes(i)}]));
  const r=await call('render',{src:'pat',loops:1});
  console.log('   '+n+'  peak '+(20*Math.log10(Math.max(r.peak,1e-6))).toFixed(1).padStart(6)
    +' dB   rms '+(20*Math.log10(Math.max(r.rms,1e-6))).toFixed(1).padStart(6)+' dB'); }
await bat(Array.from({length:64},(_,i)=>['pad',i,{mute:false}]));
await call('set',{pattern:0, songOn:true});
const sch=await call('schedule',{src:'song',full:false});
console.log('\n'+sch.notes+' notes · '+sch.seconds.toFixed(1)+'s · stretched '+JSON.stringify(sch.stretched));
let best=null;
for(const [trim,amt] of [[-9,0.22],[-6,0.26],[-3,0.30],[0,0.34]]){
  await call('set',{mTrim:trim, compAmt:amt});
  const m=await call('render',{src:'song',loops:1,loudness:true});
  console.log('   trim +'+trim+' comp '+amt+' → '+m.lufs.toFixed(1)+' LUFS  tp '
    +m.truePeakDb.toFixed(2)+'  crest '+m.crestDb.toFixed(1)+(m.clipping?'  CLIP':''));
  const miss=Math.abs(m.lufs+12.0);
  if(!m.clipping && m.truePeakDb<=-1.0 && (!best||miss<best.miss)) best={trim,amt,miss,m}; }
if(!best) throw new Error('nothing cleared the ceiling');
console.log('   chosen trim +'+best.trim+' → '+best.m.lufs.toFixed(1)+' LUFS, crest '+best.m.crestDb.toFixed(1));
await call('set',{mTrim:best.trim, compAmt:best.amt});
if(errors.length) console.log('ERRORS:',errors.slice(0,3));
const wav=await call('render',{src:'song',loops:1,wav:true,depth:24,loudness:true});
writeFileSync(OUT+'salvage3.wav', Buffer.from(wav.wavBase64,'base64'));
console.log('WAV '+(wav.bytes/1048576).toFixed(1)+'MB · '+Math.floor(wav.seconds/60)+':'
  +String(Math.round(wav.seconds%60)).padStart(2,'0'));
await browser.close(); srv.close();
