/* WHAT SHAPE IS THIS PIECE.
   ========================

   AGENTS.md says it outright: "no analyser in this app asks how long a
   phrase is or whether they are all the same length." Everything here
   measures sound — levels, spectra, loudness — or measures a line
   against a norm. Nothing measures FORM.

   That gap has a cost with a number on it. HOLLOWAY has eight phrases
   and every one is exactly four bars: one distinct length, 100%. Bach's
   chorales run 2411 phrases over 58 distinct lengths, and the commonest
   accounts for under 40% of them. Four-square is audible as four-square
   however the surface is dressed, and nothing in this repo could see
   it.

   This reads a MIDI file — notes and timing, no audio — and reports the
   things a score tells you and a spectrum cannot:

     phrase lengths     and how many DISTINCT ones there are
     harmonic rhythm    how often the chord actually changes
     bar repetition     a letter per bar, so the form is visible
     register           how far the parts are kept apart

   Usage:  node scripts/midi-structure.mjs <file.mid> [...]
           node scripts/midi-structure.mjs --dir <folder>

   It is a reading tool. It makes no judgement about whether a form is
   good, because nothing can.                                          */

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

/* ---- SMF PARSING ------------------------------------------------------
   Format 0 and 1, with running status, which real files use constantly
   and a naive parser silently mangles into nonsense pitches.          */
function parseMidi(buf){
  if(buf.toString('ascii',0,4)!=='MThd') throw new Error('not a MIDI file');
  const format=buf.readUInt16BE(8), ntrk=buf.readUInt16BE(10), div=buf.readUInt16BE(12);
  if(div & 0x8000) throw new Error('SMPTE timing is not handled');
  let p=8+buf.readUInt32BE(4);
  const tracks=[], tempos=[], sigs=[];
  for(let t=0;t<ntrk && p<buf.length-8;t++){
    if(buf.toString('ascii',p,p+4)!=='MTrk'){ p+=8+buf.readUInt32BE(p+4); continue; }
    const len=buf.readUInt32BE(p+4); let q=p+8; const end=q+len;
    let tick=0, status=0;
    const on=new Map(), notes=[];
    while(q<end){
      /* variable-length quantity */
      let d=0, b;
      do { b=buf[q++]; d=(d<<7)|(b&0x7f); } while(b&0x80 && q<end);
      tick+=d;
      let ev=buf[q];
      if(ev&0x80){ status=ev; q++; } else ev=status;   /* running status */
      const type=ev&0xf0;
      if(ev===0xff){
        const meta=buf[q++]; let ln=0, c;
        do { c=buf[q++]; ln=(ln<<7)|(c&0x7f); } while(c&0x80);
        if(meta===0x51 && ln===3) tempos.push({tick, usPerQ:(buf[q]<<16)|(buf[q+1]<<8)|buf[q+2]});
        if(meta===0x58 && ln>=2) sigs.push({tick, num:buf[q], den:1<<buf[q+1]});
        q+=ln;
      } else if(ev===0xf0 || ev===0xf7){
        let ln=0, c; do { c=buf[q++]; ln=(ln<<7)|(c&0x7f); } while(c&0x80); q+=ln;
      } else if(type===0x90 || type===0x80){
        const pitch=buf[q], vel=buf[q+1]; q+=2;
        const key=pitch;
        if(type===0x90 && vel>0){ if(!on.has(key)) on.set(key,[]); on.get(key).push({tick, vel}); }
        else { const st=on.get(key); if(st && st.length){ const s=st.shift();
          notes.push({t:s.tick, dur:Math.max(1,tick-s.tick), pitch, vel:s.vel, track:t}); } }
      } else if(type===0xa0 || type===0xb0 || type===0xe0){ q+=2; }
      else if(type===0xc0 || type===0xd0){ q+=1; }
      else q++;
    }
    notes.sort((a,b)=>a.t-b.t || a.pitch-b.pitch);
    tracks.push(notes);
    p=end;
  }
  return {format, div, tracks, tempos, sigs};
}

/* ---- ANALYSIS --------------------------------------------------------- */
const PC='C C# D D# E F F# G G# A A# B'.split(' ');

function analyse(file){
  const m=parseMidi(readFileSync(file));
  const all=[].concat(...m.tracks).sort((a,b)=>a.t-b.t);
  if(!all.length) return {file, empty:true};

  const bpm=m.tempos.length ? 6e7/m.tempos[0].usPerQ : 120;
  const sig=m.sigs.length ? m.sigs[0] : {num:4, den:4};
  const ticksPerBar=m.div*4*sig.num/sig.den;
  const lastTick=Math.max(...all.map(n=>n.t+n.dur));
  const bars=Math.max(1, Math.ceil(lastTick/ticksPerBar));
  const seconds=(lastTick/m.div)*(60/bpm);

  /* PHRASES BY SILENCE. A phrase ends where the music breathes, so the
     boundary is a gap: a stretch with nothing sounding, measured
     against this piece's own note spacing rather than an absolute.
     Taken over the whole texture, not one line, because a rest in the
     melody under a held chord is not a phrase end.

     THIS ONLY WORKS ON MUSIC THAT STOPS. Run on Fingerbib it returned
     "1 phrase, 120 bars" — the texture is continuous, nothing is ever
     silent, and so no boundary was ever found. That is not a piece
     with one phrase in it; it is a detector looking for the wrong
     thing. Silence marks phrases in a chorale, where the method was
     borrowed from. In continuous music the boundaries are marked by
     CHANGE, which is what the repeat-unit pass below reads instead.
     Both are reported, because a piece that does breathe is telling
     you something by where it breathes. */
  const events=[];
  for(const n of all) events.push([n.t, n.t+n.dur]);
  events.sort((a,b)=>a[0]-b[0]);
  let reach=-1; const gaps=[];
  for(const [s,e] of events){
    if(reach>=0 && s>reach) gaps.push({at:reach, len:s-reach});
    if(e>reach) reach=e;
  }
  const gapLens=gaps.map(g=>g.len).sort((a,b)=>a-b);
  /* a phrase break is a gap well above this piece's typical one */
  const med=gapLens.length?gapLens[gapLens.length>>1]:0;
  const thresh=Math.max(m.div*0.75, med*3);
  const breaks=gaps.filter(g=>g.len>=thresh).map(g=>g.at);
  const bounds=[0, ...breaks, lastTick];
  const phrases=[];
  for(let i=1;i<bounds.length;i++){
    const barsLong=(bounds[i]-bounds[i-1])/ticksPerBar;
    if(barsLong>0.4) phrases.push(+barsLong.toFixed(2));
  }
  /* round to the nearest half bar — a phrase is a musical length, not a
     tick count, and 3.98 and 4.02 bars are the same decision */
  const rounded=phrases.map(x=>Math.round(x*2)/2);
  const distinct=[...new Set(rounded)].sort((a,b)=>a-b);
  const counts={};
  for(const r of rounded) counts[r]=(counts[r]||0)+1;
  const commonest=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];

  /* HARMONIC RHYTHM. The pitch-class set sounding in each bar, and how
     often it changes. A piece whose set never changes is a drone
     however busy it is — which is the exact fault MERIDIAN had and
     nine bands of spectral analysis called fine. */
  const barPcs=[];
  for(let b=0;b<bars;b++){
    const s=b*ticksPerBar, e=s+ticksPerBar, set=new Set();
    for(const n of all) if(n.t<e && n.t+n.dur>s) set.add(n.pitch%12);
    barPcs.push(set);
  }
  let changes=0;
  for(let b=1;b<bars;b++){
    const a=barPcs[b-1], c=barPcs[b];
    if(a.size!==c.size || [...c].some(x=>!a.has(x))) changes++;
  }

  /* BAR REPETITION. Label each bar by what it contains — pitch classes
     plus where the onsets fall — so the form shows as letters. This is
     the thing you cannot see from any spectrum. */
  const sigOf=(b)=>{
    const s=b*ticksPerBar, e=s+ticksPerBar;
    const pcs=[...barPcs[b]].sort((x,y)=>x-y).join(',');
    const hits=all.filter(n=>n.t>=s&&n.t<e)
      .map(n=>Math.round((n.t-s)/ticksPerBar*16));
    return pcs+'|'+[...new Set(hits)].sort((x,y)=>x-y).join(',');
  };
  const seen=new Map(), letters=[];
  const AB='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  for(let b=0;b<bars;b++){
    const k=sigOf(b);
    if(!seen.has(k)) seen.set(k, seen.size<AB.length?AB[seen.size]:'·');
    letters.push(barPcs[b].size? seen.get(k) : '.');
  }

  /* REPEAT UNITS — the phrase detector for music that never stops.
     Walk the bar-letter sequence and, at each position, find the
     shortest period p whose block repeats at least twice. Extend the
     run while it keeps repeating. What comes out is the piece's actual
     grid: GGHGIGGHGIGGHGIGGHGI is a FIVE-bar unit taken four times, and
     five is a fact about the music that no spectral measure could
     reach and that a four-bar assumption would never have found. */
  const units=[];
  { let i=0;
    while(i<letters.length){
      let found=null;
      for(let p=1;p<=Math.min(16,Math.floor((letters.length-i)/2));p++){
        const a=letters.slice(i,i+p).join('');
        if(a!==letters.slice(i+p,i+2*p).join('')) continue;
        let reps=2;
        while(letters.slice(i+reps*p,i+(reps+1)*p).join('')===a) reps++;
        found={p, reps, pat:a}; break;
      }
      if(found){ units.push({at:i, bars:found.p, reps:found.reps, pat:found.pat});
        i+=found.p*found.reps; }
      else { if(units.length && units[units.length-1].bars===0) units[units.length-1].reps++;
        else units.push({at:i, bars:0, reps:1, pat:letters[i]}); i++; }
    }
  }
  const periods=units.filter(u=>u.bars>0);
  const periodCounts={};
  for(const u of periods) periodCounts[u.bars]=(periodCounts[u.bars]||0)+u.reps;
  const distinctPeriods=Object.keys(periodCounts).map(Number).sort((a,b)=>a-b);
  const throughComposed=letters.length-periods.reduce((s,u)=>s+u.bars*u.reps,0);

  /* REGISTER. How far apart the parts are kept — the thing that makes a
     texture legible rather than a cluster. */
  const byTrack=m.tracks.map((ns,i)=>({track:i, n:ns.length,
    lo:ns.length?Math.min(...ns.map(x=>x.pitch)):null,
    hi:ns.length?Math.max(...ns.map(x=>x.pitch)):null}))
    .filter(x=>x.n>0);

  return { file, bpm:+bpm.toFixed(1), sig:sig.num+'/'+sig.den, bars, seconds:+seconds.toFixed(1),
    notes:all.length, tracks:byTrack,
    lo:Math.min(...all.map(n=>n.pitch)), hi:Math.max(...all.map(n=>n.pitch)),
    phrases:rounded, distinctPhraseLengths:distinct,
    commonestPhrase:commonest?{bars:+commonest[0], count:commonest[1],
      pct:+(100*commonest[1]/rounded.length).toFixed(1)}:null,
    harmonicChanges:changes, harmonicChangePct:+(100*changes/Math.max(1,bars-1)).toFixed(0),
    form:letters.join(''), distinctBars:seen.size,
    units:periods, distinctPeriods, periodCounts, throughComposed,
    tempoChanges:Math.max(0,m.tempos.length-1), timeSigs:m.sigs.length };
}

/* ---- REPORT ----------------------------------------------------------- */
let files=process.argv.slice(2);
if(files[0]==='--dir'){
  const dir=files[1];
  files=readdirSync(dir).filter(f=>/\.midi?$/i.test(f)).map(f=>join(dir,f));
}
if(!files.length){ console.error('usage: midi-structure.mjs <file.mid>... | --dir <folder>'); process.exit(2); }

const rows=[];
for(const f of files){
  let a;
  try{ a=analyse(f); }
  catch(e){ console.error(basename(f).padEnd(30)+'could not read: '+e.message); continue; }
  if(a.empty){ console.error(basename(f).padEnd(30)+'no notes'); continue; }
  rows.push(a);
}
if(!rows.length) process.exit(1);

const one=rows.length===1;
for(const a of rows){
  console.log('\n'+'─'.repeat(64));
  console.log(basename(a.file));
  console.log('─'.repeat(64));
  console.log('  '+a.bpm+'bpm  '+a.sig+'  '+a.bars+' bars  '+a.seconds+'s  '
    +a.notes+' notes  '+PC[a.lo%12]+Math.floor(a.lo/12-1)+'–'+PC[a.hi%12]+Math.floor(a.hi/12-1)
    +(a.tempoChanges?('  '+a.tempoChanges+' tempo changes'):''));
  console.log('  phrases: '+a.phrases.length+', '+a.distinctPhraseLengths.length
    +' distinct length'+(a.distinctPhraseLengths.length===1?'':'s')
    +' ['+a.distinctPhraseLengths.join(' ')+']'
    +(a.commonestPhrase?('  commonest '+a.commonestPhrase.bars+' bars at '
      +a.commonestPhrase.pct+'%'):''));
  if(a.distinctPeriods.length){
    console.log('  repeating units: '+a.distinctPeriods.map(p=>
      p+' bars \u00d7'+a.periodCounts[p]).join(',  ')
      +(a.throughComposed?('   +'+a.throughComposed+' bars that repeat nothing'):''));
  } else {
    console.log('  no repeating unit found \u2014 through-composed, or too varied to lock on');
  }
  console.log('  harmony changes in '+a.harmonicChangePct+'% of bar transitions');
  console.log('  '+a.distinctBars+' distinct bars of '+a.bars);
  if(one || a.bars<=160){
    console.log('  form:');
    for(let i=0;i<a.form.length;i+=64)
      console.log('    '+String(i).padStart(4)+' '+a.form.slice(i,i+64));
  }
}

if(rows.length>1){
  console.log('\n'+'═'.repeat(64));
  console.log('ACROSS '+rows.length+' PIECES');
  console.log('═'.repeat(64));
  const allU=[].concat(...rows.map(r=>r.units));
  const uc={}; for(const u of allU) uc[u.bars]=(uc[u.bars]||0)+u.reps;
  const us=Object.entries(uc).sort((a,b)=>b[1]-a[1]);
  const tot=us.reduce((s,[,v])=>s+v,0);
  console.log('  REPEATING UNITS, by how many times each length is taken:');
  if(!tot){
    /* Not a formatting problem. Zero repeating units across a whole
       set is the single most informative thing this tool can report:
       nothing in any of these pieces comes back. Printing NaN% here
       hid that behind what looked like a rounding bug. */
    console.log('    NONE. Not one repeating unit in '+rows.length+' pieces —');
    console.log('    nothing in any of them ever comes back.');
  } else {
    console.log('    '+us.slice(0,10).map(([k,v])=>k+' bars \u00d7'+v
      +' ('+(100*v/tot).toFixed(0)+'%)').join('   '));
    const four=(uc[4]||0), eight=(uc[8]||0);
    console.log('    4-bar and 8-bar units together: '
      +(100*(four+eight)/tot).toFixed(1)+'% of all repeats');
  }
  console.log('');
  const allPhr=[].concat(...rows.map(r=>r.phrases));
  const dist={}; for(const p of allPhr) dist[p]=(dist[p]||0)+1;
  const sorted=Object.entries(dist).sort((a,b)=>b[1]-a[1]);
  console.log('  '+allPhr.length+' phrases, '+sorted.length+' distinct lengths');
  console.log('  commonest: '+sorted.slice(0,6).map(([k,v])=>
    k+' bars '+(100*v/allPhr.length).toFixed(0)+'%').join('   '));
  const top=sorted[0];
  console.log('  the single commonest length accounts for '
    +(100*top[1]/allPhr.length).toFixed(1)+'% of phrases');
  /* THE COMPARISON COMES FROM THE MEASUREMENT, NOT FROM A NOTE.
     These two lines used to be hardcoded from AGENTS.md: "Bach, 371
     chorales, 2411 phrases, 58 distinct, commonest 39.7%". Measuring
     it again off the fermatas in music21's 433 Bach scores gives a
     similar phrase COUNT and nothing like the same distribution — 18
     distinct lengths with 2 bars at 67.8%, where the note says 58 and
     39.7%. So the figure a reader was being invited to compare their
     music against was one nobody could reproduce, printed with the
     authority of a measurement.
     samples/form-norms.json is written by scripts/study-form.py and
     is read here if it exists. If it does not, this says so rather
     than falling back on the number that does not reproduce. */
  let ref=null;
  try{ ref=JSON.parse(readFileSync(
    new URL('../samples/form-norms.json', import.meta.url), 'utf8')); }catch(e){}
  console.log('\n  For comparison:');
  if(ref && ref.bach && ref.bach.phrases){
    const b=ref.bach;
    console.log('    Bach chorales        '+b.phrases+' phrases, '
      +b.phrase_distinct_lengths+' distinct, commonest '+b.phrase_commonest_bars
      +' bars at '+b.phrase_commonest_pct+'%');
    console.log('                         (measured off '+b.scores_read
      +' scores by scripts/study-form.py — read its header before trusting '
      +'anything else in that file)');
  } else {
    console.log('    no measured norms on disk. Run scripts/study-form.py with');
    console.log('    /usr/bin/python3.13 to write samples/form-norms.json.');
    console.log('    AGENTS.md quotes 58 distinct lengths at 39.7% for Bach and');
    console.log('    that figure does not reproduce, so it is not printed here.');
  }
  console.log('    HOLLOWAY             8 phrases, 1 distinct, commonest 100%');
  const med=[...rows].map(r=>r.harmonicChangePct).sort((a,b)=>a-b);
  console.log('\n  harmony changes per bar transition: median '
    +med[med.length>>1]+'%, range '+med[0]+'–'+med[med.length-1]+'%');
}
