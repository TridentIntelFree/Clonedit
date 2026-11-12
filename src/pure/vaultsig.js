/* IS THIS THE AUDIO THAT IS ALREADY ON DISK?

   Reported: "the app crashes when a large file is loaded. A multiple
   minute full track."

   Measured with a six-minute stereo file through the real import path.
   Decoding it is fine. What is not fine is what happens 1.5 seconds after
   ANY edit — a step toggled, a fader moved — for as long as that file is
   in the project:

     main thread frozen      ~570ms          (a fast desktop; a phone is 3-5x)
     audio re-quantised      132MB -> 66MB   allocated fresh, every time
     written to IndexedDB    66MB            every time
     and every three minutes a REWIND checkpoint did all of it again,
     keeping three to six full copies

   The audio had not changed. The session document carried every sample
   inline, so saving "step 4 is now on" meant re-encoding and re-writing
   the whole track. On a phone with a few hundred megabytes of headroom
   that is not slow, it is a reaped tab — which is what a crash is there.

   So the audio is stored ONCE, in its own records, and the documents that
   used to carry it carry a key instead. That needs an answer to the
   question at the top of this file, and the obvious answer is wrong.

   WHY NOT "IS IT THE SAME BUFFER OBJECT". Because buffers here are not
   immutable. NORMALIZE multiplies workBuf in place and keeps the object.
   Keyed by identity, the vault would have gone on believing the old
   samples were current and RESTORE would have handed back un-normalised
   audio — silently, which is the one outcome the vault code refuses
   everywhere else. The key has to come from the CONTENT.

   WHY EXACT, NOT SAMPLED. A probe of a few thousand evenly spaced samples
   costs microseconds and catches every global edit. It also has a stride
   of 88ms on a six-minute file, and an in-place edit shorter than that
   which lands between probes would be written down as "unchanged" and
   then never saved, because nothing else would trigger another look. One
   pass over every word costs about 35ms a channel on that same file and
   cannot be fooled, and the caller spreads it across slices so nothing
   freezes. Correctness first; this is the file that decides whether
   somebody's work comes back.

   THE HASH is two independent 32-bit accumulators over the raw float
   bits — FNV-1a taken a word at a time, and a multiplicative sum. Both
   are order-dependent, so swapping two samples changes it, and it reads
   BITS rather than values, so nothing is lost to float comparison. It is
   a change detector for audio a person made, not a defence against
   someone constructing collisions, and it does not need to be.

   Resumable (`sigFeed` over a range) so a long channel can be hashed in
   slices with a yield between them. */

export function sigNew() { return { a: 0x811c9dc5 | 0, b: 0, n: 0 }; }

/* feed words [from, to) of a Uint32Array view of the samples */
export function sigFeed(s, u32, from, to) {
  let a = s.a, b = s.b;
  for (let i = from; i < to; i++) {
    const w = u32[i];
    a = Math.imul(a ^ w, 16777619);
    b = (Math.imul(b, 31) + w) | 0;
  }
  s.a = a; s.b = b; s.n += to - from;
  return s;
}

export function sigHex(s) {
  return (s.a >>> 0).toString(16).padStart(8, '0')
    + (s.b >>> 0).toString(16).padStart(8, '0');
}

/* the float bits, without copying them */
export function wordsOf(f32) {
  return new Uint32Array(f32.buffer, f32.byteOffset, f32.length);
}

/* one channel, all at once — for tests and for anything short */
export function chanSig(f32) {
  const u = wordsOf(f32);
  return sigHex(sigFeed(sigNew(), u, 0, u.length));
}

/* THE KEY CARRIES THE LENGTH as well as the hash, so two channels can
   only share a record if they are the same length AND hash alike — and
   so the key says something a person can read when one goes missing.

   PER CHANNEL, NOT PER BUFFER. A mono file decoded into a stereo buffer
   has two identical channels, which is common, and keyed per channel it
   is stored once. */
export const AUD_PREFIX = 'aud:';
export function audKey(length, hex) { return AUD_PREFIX + length + ':' + hex; }

/* Which stored audio does a document point at? Light documents carry
   `aud` keys where the old ones carried the samples themselves. */
export function audRefsOf(doc) {
  const out = [];
  if (!doc || !Array.isArray(doc.buffers)) return out;
  for (const b of doc.buffers)
    if (b && Array.isArray(b.aud)) for (const k of b.aud) out.push(k);
  return out;
}

/* A document is LIGHT when any of its buffers points at stored audio
   rather than holding it. An old document is neither wrong nor in need
   of converting — it still restores exactly as it always did. */
export function isLightDoc(doc) {
  return !!(doc && Array.isArray(doc.buffers) && doc.buffers.some(b => b && Array.isArray(b.aud)));
}

/* What can be deleted: stored audio that no document points at.
   `present` is every key in the store, `docs` every light document.
   Pure so the rule that decides what gets DELETED can be tested without
   a database — a sweep that is wrong destroys audio. */
export function audUnreferenced(present, docs) {
  const used = new Set();
  for (const d of docs || []) for (const k of audRefsOf(d)) used.add(k);
  return (present || []).filter(k => typeof k === 'string'
    && k.indexOf(AUD_PREFIX) === 0 && !used.has(k));
}
