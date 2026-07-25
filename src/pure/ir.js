/* Reverb impulse-response sizing.

   Each space overrides the length you ask for: a ROOM that rings for six
   seconds is not a room, and a CATHEDRAL that stops after one is not a
   cathedral. Callers need this separately from generating the IR, because the
   pre-verb render has to size its offline context from the length that will
   ACTUALLY be produced — sizing it from the requested length cut cathedral
   tails off at a third of their length. */

export function irDur(size, type){       // ROOM/GATED/SPRING/CATH override the size you ask for
  const t=type||'hall'; let dur=size||3;
  if(t==='room') dur=Math.min(dur,1.2);
  else if(t==='gated') dur=0.55;
  else if(t==='spring') dur=Math.min(dur,2.2);
  else if(t==='cath') dur=Math.max(dur,4.5);
  return Math.max(0.25,dur);
}
