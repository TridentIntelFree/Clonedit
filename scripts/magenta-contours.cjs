/* A CORPUS OF MELODIC SHAPES, WRITTEN BY MAGENTA AND FILTERED HERE.
   Stored as INTERVAL CONTOURS, not pitches: the shape is portable to any key
   and any progression, and infill()'s own harmonic filter still chooses the
   note. That split is deliberate -- AGENTS.md records that this model "writes
   a pitch per step, and its step numbers are not a rhythm", and that dealing
   its pitches onto invented step offsets is what gave HOLLOWAY an audible
   stumble. So the rhythm stays with the cell library that already works.

   REGENERATES src/pure/contours.js. Run it from the repo root:

       node scripts/magenta-contours.cjs > /dev/null && \
         node scripts/magenta-contours.cjs --emit src/pure/contours.js

   The thresholds below are asserted by tests/contours.test.mjs, so loosening
   them to keep more draws fails the suite rather than quietly putting the
   drones back. That is deliberate: the model is not the value here, the
   filter is. 109 of 256 draws were rejected to get the 130 that shipped. */
process.env.TF_CPP_MIN_LOG_LEVEL='3';
const fs=require('fs');
const mm=require('/home/user/Clonedit/node_modules/@magenta/music/node/music_rnn');
const CKPT='https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improv';
const NORMS={repeat:21.1, step:46.9, third:19.0, leap:13.1};

const PROGS=[
  ['Am','F','C','G'], ['Dm','Bb','F','C'], ['C','G','Am','F'],
  ['Am','Dm','E','Am'], ['F','C','Dm','Bb'], ['Em','C','G','D'],
  ['Cmaj7','Am7','Dm7','G7'], ['Bm7','Gmaj7','Dmaj7','A'],
];
function profile(ps){
  const iv=[]; for(let i=1;i<ps.length;i++) iv.push(ps[i]-ps[i-1]);
  if(iv.length<4) return null;
  const a=iv.map(Math.abs), pct=f=>100*a.filter(f).length/a.length;
  const p={ repeat:pct(d=>d===0), step:pct(d=>d===1||d===2),
    third:pct(d=>d===3||d===4), leap:pct(d=>d>=5) };
  p.offNorm=Object.keys(NORMS).reduce((s,k)=>s+Math.abs(p[k]-NORMS[k]),0)/4;
  p.range=Math.max(...ps)-Math.min(...ps);
  p.iv=iv; p.n=ps.length;
  /* does it come back anywhere -- the motif question. A line that never
     repeats an interval pair is a random walk however well it scores. */
  const pairs=iv.slice(0,-1).map((v,i)=>v+','+iv[i+1]);
  p.recur=100*(pairs.length-new Set(pairs).size)/Math.max(1,pairs.length);
  return p;
}
/* THE MODULE IT EMITS. Written here rather than by hand so src/pure/
   contours.js can always be reproduced from the corpus it claims to come
   from -- a baked artefact nobody can regenerate is a magic number.

   Built by CONCATENATION, not a template literal. The first version used
   one, nested inside the heredoc that wrote this script, and every `${}`
   came through escaped: the emitted file carried the interpolations as
   literal text, including the one that was supposed to be the array, so it
   had a header, no data, and a syntax error. It passed `node --check` on
   the GENERATOR and broke only the thing it generates -- which is why
   --emit is now run against a scratch path and the result imported before
   anyone trusts it. */
function moduleSource(kept, drawn){
  const mean=k=>kept.reduce((s,x)=>s+x[k],0)/kept.length;
  const n1=k=>mean(k).toFixed(1);
  const rows=kept.map(c=>JSON.stringify({iv:c.iv,n:c.n,range:c.range,
    step:c.step,repeat:c.repeat,leap:c.leap,recur:c.recur,off:c.off}));
  return [
  '/* MELODIC SHAPES, WRITTEN BY MAGENTA AND FILTERED BEFORE THEY GOT HERE.',
  '',
  '   infill() chose every pitch from the chord and the key. That is',
  '   harmonically safe and it cannot write a tune: two chord tones are a',
  '   third apart by construction, so the direction of the line was whatever',
  '   fell out of "a chord tone here, a scale tone there".',
  '',
  '   Each row is an INTERVAL SEQUENCE from Google\'s chord_pitches_improv',
  '   checkpoint, which is trained on real melody. Intervals rather than',
  '   pitches, three times over:',
  '',
  '   - a shape transposes to any key and any progression, where pitches do',
  '     not;',
  '   - the harmony stays where it was. infill() still picks the pitch CLASS',
  '     by its own rules -- chord tone on a strong beat, scale tone on a weak',
  '     one, never a semitone above a chord tone -- and the contour only',
  '     chooses among the classes those rules already allow. The model cannot',
  '     introduce a clash the filter would have rejected;',
  '   - the RHYTHM is not taken from the model at all. AGENTS.md records what',
  '     happens when it is: this checkpoint "writes a pitch per step, and its',
  '     step numbers are not a rhythm", and dealing its pitches onto invented',
  '     step offsets is what gave HOLLOWAY an audible stumble.',
  '',
  '   BAKED IN RATHER THAN GENERATED LIVE because the model needs',
  '   TensorFlow.js and a checkpoint off the network, and this app is one',
  '   self-contained HTML file that works offline. 19KB of contours costs',
  '   nothing; a megabyte of TF.js and a runtime fetch would cost the thing',
  '   that makes it openable on a plane.',
  '',
  '   THE FILTER IS MOST OF THE VALUE. Over '+drawn+' draws the same',
  '   temperature gave offNorm 3.4 on one and 27.9 on the next -- it writes',
  '   drones about as often as tunes. '+(drawn-kept.length)+' were rejected:',
  '   off-norm, under five semitones of range, or over 45% repeated notes.',
  '   What is left has a mean sitting on the Essen norms measured from 8,514',
  '   folk melodies:',
  '',
  '       step '+n1('step')+'%  (norm 46.9)      leap '+n1('leap')+'%  (norm 13.1)',
  '       rep  '+n1('repeat')+'%  (norm 21.1)      recur '+n1('recur')+'%',
  '',
  '   GENERATED FILE -- do not hand-edit. Regenerate with',
  '   node scripts/magenta-contours.cjs --emit src/pure/contours.js',
  '   The thresholds are asserted by tests/contours.test.mjs, so loosening',
  '   them to keep more draws fails the suite rather than quietly restoring',
  '   the drones. */',
  '',
  'export const MAGENTA_CONTOURS = [',
  '  '+rows.join(',\n  '),
  '];',
  '',
  '/* Pick one by seed, long enough for the slots being written. Falls back',
  '   to the longest it has rather than returning null, because a caller that',
  '   has asked for a shape wants a shape. */',
  'export function pickContour(seed, minNotes){',
  '  const want = Math.max(2, minNotes | 0);',
  '  const fit = MAGENTA_CONTOURS.filter(c => c.iv.length >= want - 1);',
  '  const pool = fit.length ? fit : MAGENTA_CONTOURS;',
  '  const s = (seed | 0) >>> 0;',
  '  return pool[s % pool.length];',
  '}',
  ''].join('\n');
}

(async()=>{
  const rnn=new mm.MusicRNN(CKPT); await rnn.initialize();
  const kept=[], seen=new Set(); let drawn=0, rejected={short:0,off:0,narrow:0,drone:0,dup:0};
  for(const chords of PROGS){
    for(const temp of [0.9,1.0,1.1,1.2]){
      for(let k=0;k<8;k++){
        const start=60+[0,2,4,7,9][k%5];
        const seed={ notes:[{pitch:start,quantizedStartStep:0,quantizedEndStep:2}],
          quantizationInfo:{stepsPerQuarter:4}, totalQuantizedSteps:2 };
        let out; try{ out=await rnn.continueSequence(seed,62,temp,chords); }catch(e){ continue; }
        drawn++;
        const ps=out.notes.map(n=>n.pitch);
        const p=profile(ps);
        if(!p){ rejected.short++; continue; }
        if(p.range<5){ rejected.narrow++; continue; }
        if(p.repeat>45){ rejected.drone++; continue; }
        if(p.offNorm>12){ rejected.off++; continue; }
        const key=p.iv.join(',');
        if(seen.has(key)){ rejected.dup++; continue; }
        seen.add(key);
        kept.push({ iv:p.iv, n:p.n, range:p.range, temp,
          step:+p.step.toFixed(1), repeat:+p.repeat.toFixed(1),
          third:+p.third.toFixed(1), leap:+p.leap.toFixed(1),
          recur:+p.recur.toFixed(1), off:+p.offNorm.toFixed(2) });
      }
    }
  }
  kept.sort((a,b)=>a.off-b.off);
  const mean=k=>kept.reduce((s,x)=>s+x[k],0)/kept.length;
  console.log('drawn '+drawn+'  kept '+kept.length);
  console.log('rejected: '+JSON.stringify(rejected));
  console.log('kept means: step '+mean('step').toFixed(1)+'%  rep '+mean('repeat').toFixed(1)
    +'%  3rd '+mean('third').toFixed(1)+'%  leap '+mean('leap').toFixed(1)
    +'%  recur '+mean('recur').toFixed(1)+'%  offNorm '+mean('off').toFixed(2));
  console.log('lengths: '+Math.min(...kept.map(x=>x.n))+'-'+Math.max(...kept.map(x=>x.n))+' notes');
  console.log('best  : off '+kept[0].off+'  step '+kept[0].step+'%  range '+kept[0].range+'st  n='+kept[0].n);
  console.log('worst kept: off '+kept[kept.length-1].off);
  const emitAt=(()=>{ const i=process.argv.indexOf('--emit'); return i>0?process.argv[i+1]:null; })();
  if(emitAt){ fs.writeFileSync(emitAt, moduleSource(kept, drawn)); 
    console.log('wrote '+emitAt+'  '+(fs.statSync(emitAt).size/1024).toFixed(0)+'KB'); return; }
  fs.writeFileSync('contours.json', JSON.stringify({
    source:'magenta music_rnn chord_pitches_improv',
    drawn, kept:kept.length, generated:new Date().toISOString().slice(0,10),
    norms:NORMS, contours:kept }, null, 0));
  console.log('wrote contours.json  '+(fs.statSync('contours.json').size/1024).toFixed(0)+'KB');
})().catch(e=>{ console.log('FAILED: '+e.message); process.exit(1); });
