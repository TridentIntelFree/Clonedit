/* PATTERN MORPH — melt pattern A into pattern B.

   Every cell (track + step, plus the silencer row) is given a rank in [0,1) by
   the chosen ORDER. At morph amount t the cell shows B when t > rank and A
   otherwise, so the pattern crosses over one cell at a time instead of
   switching in one jump. ORDER is what makes it musical rather than random:

     weight   metric weight, weakest first — the 16ths mutate, then the 8ths,
              then the beats, and the downbeat is the last thing to go, so the
              groove keeps its backbone until the very end.
     strong   the same ranking inverted: the skeleton changes first.
     sweep    straight left-to-right through the bar — a wipe.
     scatter  a hash of (track, step): scattered but deterministic, so the same
              morph sounds identical every time and bounces the same.
     track    one instrument at a time, in pad order.

   The endpoints are exact: t<=0 IS pattern A and t>=1 IS pattern B, returned by
   reference, so an arrived morph is bit-identical to selecting B — including
   its own length and per-track polymeter, which an interpolated buffer cannot
   carry. In between, the blend keeps A's length and A's track lengths and reads
   B modulo its own, so a 16-step B tiles into a 32-step A. */
import { NPADS, patLen, trackLen, rowUsed, newPattern } from './pattern.js';

export function morphRanker(curve, L, pads){
  if(curve==='scatter'){
    return (p,st)=>{ let h=(((p+3)*73856093)^((st+1)*19349663))>>>0;
      h^=h>>>13; h=(h*1274126177)>>>0; h^=h>>>16; return (h%100003)/100003; };
  }
  if(curve==='track'){
    const n=Math.max(1,pads.length);
    return (p,st)=>{ let i=pads.indexOf(p); if(i<0) i=n-1;       // the silencer row rides with the last pad
      return (i + (st%L)/L)/n; };
  }
  if(curve==='sweep'){ return (p,st)=>(st%L)/L; }
  // metric weight: class 0 = odd steps (weakest) … class C-1 = step 0 (strongest)
  const order=[];
  for(let st=0;st<L;st++){ const v = st===0 ? L : (st & -st); order.push({st, cls:Math.round(Math.log2(v))}); }
  order.sort((a,b)=> (curve==='strong' ? b.cls-a.cls : a.cls-b.cls) || a.st-b.st);
  const pos=new Array(L);
  order.forEach((o,i)=>{ pos[o.st]=i/L; });
  return (p,st)=>pos[st%L];
}
export function morphPattern(A, B, t, curve, velX){
  if(!A||!B) return A||B;
  if(!(t>0)) return A;
  if(t>=1)   return B;
  const L=patLen(A), LB=patLen(B);
  const out=newPattern(L);
  out.bpm=A.bpm;
  out.len=(Array.isArray(A.len)?A.len.slice():new Array(NPADS).fill(L));
  out.autom=(t<0.5?A:B).autom;
  const pads=[]; for(let p=0;p<NPADS;p++) if(rowUsed(A,p)||rowUsed(B,p)) pads.push(p);
  const rank=morphRanker(curve,L,pads);
  const alk=A.locks||{}, blk=B.locks||{};
  for(let p=0;p<NPADS;p++){
    const la=trackLen(A,p), lb=trackLen(B,p);
    for(let st=0;st<la;st++){
      const useB = t > rank(p,st);
      const bi=st%lb;
      const av=A.steps[p][st]||0, bv=B.steps[p][bi]||0;
      let v = useB ? bv : av;
      if(velX && av>0 && bv>0) v = av+(bv-av)*t;       // both sides hit: ride the level across
      out.steps[p][st]=v;
      if(v>0){ const lk = useB ? blk[p+':'+bi] : alk[p+':'+st]; if(lk) out.locks[p+':'+st]=lk; }
    }
  }
  for(let st=0;st<L;st++){                              // the silencer row morphs on the same schedule
    const useB = t > rank(-1,st);
    out.sil[st] = useB ? ((B.sil&&B.sil[st%LB])||0) : ((A.sil&&A.sil[st])||0);
  }
  return out;
}
