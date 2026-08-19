/* EXPORT FIDELITY.

   "How close to lossless can we get?" is a measurable question, so it is
   measured here rather than asserted in a comment.

   Two things stood between the render and the file. The bounce ran a 44100
   OfflineAudioContext while the engine runs at 48k and imports decode at 48k,
   so every sample went through a 160/147 conversion on the way out — for a
   rate nobody asked for. And the writer only spoke 16-bit, so the floats the
   renderer produced were quantised to a 1/32767 grid before they reached disk.

   Neither is inherent. The render rate now follows the engine, and 32-bit
   float writes the renderer's own Float32 values verbatim. The claim that
   makes is strong and specific — the file contains the identical bits the
   renderer produced — so the test is the strong version too: parse the WAV
   this app writes, byte by byte, and compare every sample against the source
   with ===, not a tolerance. A tolerance would pass on a writer that was
   merely close, which is the thing being ruled out.

   16 and 24-bit are checked the other way: they MUST differ from the source
   (they quantise, and they dither, so an exact match would mean the dither
   was not applied) but must stay inside their own LSB. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    const r = await page.evaluate(async () => {
      const o = {};

      /* A WAV parser that knows nothing about how the app wrote the file —
         it walks the chunk list the way any other program would. If the app
         writes a header only the app understands, this fails. */
      const parseWav = ab => {
        const dv = new DataView(ab);
        const tag = off => String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1),
          dv.getUint8(off + 2), dv.getUint8(off + 3));
        if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
        if (dv.getUint32(4, true) !== ab.byteLength - 8) throw new Error('RIFF size wrong');
        const out = { chunks: [] };
        let p = 12;
        while (p + 8 <= ab.byteLength) {
          const id = tag(p), sz = dv.getUint32(p + 4, true);
          out.chunks.push(id);
          if (id === 'fmt ') {
            out.fmt = dv.getUint16(p + 8, true);
            out.ch = dv.getUint16(p + 10, true);
            out.sr = dv.getUint32(p + 12, true);
            out.byteRate = dv.getUint32(p + 16, true);
            out.blockAlign = dv.getUint16(p + 20, true);
            out.bits = dv.getUint16(p + 22, true);
            out.fmtSize = sz;
          } else if (id === 'fact') {
            out.factFrames = dv.getUint32(p + 8, true);
          } else if (id === 'data') {
            out.dataOff = p + 8; out.dataSize = sz;
          }
          p += 8 + sz + (sz & 1);
        }
        if (out.dataOff == null) throw new Error('no data chunk');
        const bps = out.bits >> 3, frames = out.dataSize / (bps * out.ch);
        out.frames = frames;
        const L = new Float32Array(frames), R = new Float32Array(frames);
        for (let i = 0; i < frames; i++) {
          const b = out.dataOff + i * out.ch * bps;
          if (out.bits === 32 && out.fmt === 3) {
            L[i] = dv.getFloat32(b, true); R[i] = dv.getFloat32(b + 4, true);
          } else if (out.bits === 16) {
            L[i] = dv.getInt16(b, true) / 32767; R[i] = dv.getInt16(b + 2, true) / 32767;
          } else if (out.bits === 24) {
            const rd = k => { const u = dv.getUint8(k) | (dv.getUint8(k + 1) << 8) | (dv.getUint8(k + 2) << 16);
              return (u & 0x800000 ? u - 0x1000000 : u) / 8388607; };
            L[i] = rd(b); R[i] = rd(b + 3);
          } else throw new Error('unexpected format ' + out.fmt + '/' + out.bits);
        }
        out.L = L; out.R = R;
        return out;
      };

      /* A source buffer with the awkward cases in it deliberately: samples
         that land exactly on and just off the quantisation grid, a full-scale
         excursion, an OVER-scale sample that only float can carry, and a very
         quiet tail where dither and truncation are audible in real life. */
      const SR = 48000, N = 4096;
      let src;
      try { src = new AudioBuffer({ length: N, sampleRate: SR, numberOfChannels: 2 }); }
      catch (e) { src = AC.createBuffer(2, N, SR); }
      const a = src.getChannelData(0), b = src.getChannelData(1);
      for (let i = 0; i < N; i++) {
        a[i] = 0.7 * Math.sin(2 * Math.PI * 220 * i / SR) + 1e-7 * Math.sin(2 * Math.PI * 3000 * i / SR);
        b[i] = -a[i] * 0.5;
      }
      a[0] = 1; a[1] = -1; a[2] = 1.9; a[3] = -1.9;      // over 0dBFS on purpose
      a[4] = 1 / 32767; a[5] = 0.5 / 32767; a[6] = 0; a[7] = -1e-9;
      o.srcSR = SR;

      const bytes = d => encodeWav(src, d).arrayBuffer();

      // ---- 32-bit float: must be bit-exact ----
      const f = parseWav(await bytes(32));
      o.f32 = { fmt: f.fmt, bits: f.bits, ch: f.ch, sr: f.sr, fmtSize: f.fmtSize,
        blockAlign: f.blockAlign, byteRate: f.byteRate, frames: f.frames,
        factFrames: f.factFrames, chunks: f.chunks.join(',') };
      let exact = 0;
      for (let i = 0; i < N; i++) if (f.L[i] === a[i] && f.R[i] === b[i]) exact++;
      o.f32.exact = exact;
      /* Compared in here against the Float32Array itself: 1.9 and -1e-9 are
         not float32 values, so checking the parsed sample against the decimal
         literal would fail on the rounding the source buffer already did. */
      o.f32.keptOver = f.L[2] === a[2] && f.L[2] > 1.89;   // over 0dBFS, uncrushed
      o.f32.keptTiny = f.L[7] === a[7] && f.L[7] < 0;      // far below the 16-bit floor
      o.f32.overVal = f.L[2];

      // ---- 16-bit: quantised, dithered, inside its LSB ----
      const s16 = parseWav(await bytes(16));
      o.i16 = { fmt: s16.fmt, bits: s16.bits, sr: s16.sr, blockAlign: s16.blockAlign };
      let worst16 = 0;
      for (let i = 8; i < N; i++) {                      // skip the deliberate clip cases
        const d = Math.abs(s16.L[i] - a[i]); if (d > worst16) worst16 = d;
      }
      o.i16.worst = worst16;
      o.i16.clipped = s16.L[2];                          // integer PCM must clamp, not wrap
      /* Dither is noise, so the honest test is that encoding the SAME input
         twice does not produce the same file. A writer that merely rounded
         would be identical every time.
         Counted per SAMPLE, not per byte: a dithered sample usually moves by
         one LSB, which changes its low byte and leaves its high byte alone, so
         a byte-level count reads about half of the real figure and invites a
         threshold that means nothing. */
      const q1 = parseWav(await bytes(16)), q2 = parseWav(await bytes(16));
      let differing = 0;
      for (let i = 0; i < N; i++) if (q1.L[i] !== q2.L[i] || q1.R[i] !== q2.R[i]) differing++;
      o.i16.reencodeDiff = differing / N;
      const f2 = new Uint8Array(await bytes(32));
      const f1 = new Uint8Array(await bytes(32));
      let fdiff = 0;
      for (let i = 0; i < f1.length; i++) if (f1[i] !== f2[i]) fdiff++;
      o.f32.reencodeDiff = fdiff;                        // must be zero — no dither on the float path

      // ---- 24-bit: same deal, 256x finer ----
      const s24 = parseWav(await bytes(24));
      o.i24 = { fmt: s24.fmt, bits: s24.bits, sr: s24.sr, blockAlign: s24.blockAlign };
      let worst24 = 0;
      for (let i = 8; i < N; i++) { const d = Math.abs(s24.L[i] - a[i]); if (d > worst24) worst24 = d; }
      o.i24.worst = worst24;
      o.i24.clipped = s24.L[2];

      // ---- sizes scale with depth, and the default is unchanged ----
      o.sizes = { b16: encodeWav(src, 16).size, b24: encodeWav(src, 24).size,
        b32: encodeWav(src, 32).size, dflt: encodeWav(src).size };

      // ---- the render rate now follows the engine ----
      o.rate = { bounce: bounceRate(), live: AC.sampleRate };
      return o;
    });

    t.head('32-BIT FLOAT IS THE LOSSLESS PATH');
    t.ok('the header says IEEE float, 32-bit, stereo',
      r.f32.fmt === 3 && r.f32.bits === 32 && r.f32.ch === 2,
      'fmt ' + r.f32.fmt + ' / ' + r.f32.bits + '-bit / ' + r.f32.ch + 'ch');
    t.ok('a non-PCM fmt chunk carries cbSize and a fact chunk', r.f32.fmtSize === 18
      && /fact/.test(r.f32.chunks), r.f32.fmtSize + '-byte fmt, chunks: ' + r.f32.chunks);
    t.ok('the fact chunk states the real frame count', r.f32.factFrames === 4096,
      String(r.f32.factFrames));
    t.ok('block align and byte rate agree with the format',
      r.f32.blockAlign === 8 && r.f32.byteRate === r.f32.sr * 8,
      r.f32.blockAlign + ' / ' + r.f32.byteRate);
    t.ok('EVERY sample survives bit-exact — 4096 of 4096, both channels',
      r.f32.exact === 4096, r.f32.exact + ' exact');
    t.ok('a sample above 0dBFS is carried, not flattened', r.f32.keptOver,
      String(r.f32.overVal));
    t.ok('and a sample far below the 16-bit floor is carried too', r.f32.keptTiny);
    t.ok('the float path adds no dither — two encodes are byte-identical',
      r.f32.reencodeDiff === 0, r.f32.reencodeDiff + ' bytes differ');

    t.head('THE INTEGER DEPTHS QUANTISE — AND SAY SO');
    t.ok('16-bit writes PCM at the source rate', r.i16.fmt === 1 && r.i16.bits === 16
      && r.i16.sr === r.srcSR && r.i16.blockAlign === 4);
    t.ok('16-bit error stays inside one dithered LSB', r.i16.worst <= 1 / 32767 * 1.5,
      'worst ' + (20 * Math.log10(r.i16.worst)).toFixed(1) + ' dBFS');
    t.ok('dither is real noise — the same input twice gives two different files',
      r.i16.reencodeDiff > 0.3,
      (r.i16.reencodeDiff * 100).toFixed(0) + '% of frames differ between encodes');
    t.ok('24-bit writes 3-byte PCM', r.i24.fmt === 1 && r.i24.bits === 24
      && r.i24.blockAlign === 6);
    t.ok('24-bit error stays inside ITS LSB — ~48dB quieter than 16',
      r.i24.worst <= 1 / 8388607 * 1.5,
      'worst ' + (20 * Math.log10(r.i24.worst)).toFixed(1) + ' dBFS');
    t.ok('both integer depths clamp an over-scale sample rather than wrapping',
      r.i16.clipped > 0.999 && r.i24.clipped > 0.999,
      r.i16.clipped.toFixed(5) + ' / ' + r.i24.clipped.toFixed(5));

    t.head('SIZE AND DEFAULT');
    t.ok('the file grows with the depth, in proportion',
      r.sizes.b24 > r.sizes.b16 && r.sizes.b32 > r.sizes.b24
      && Math.abs((r.sizes.b32 - 68) / (r.sizes.b16 - 44) - 2) < 0.01,
      r.sizes.b16 + ' / ' + r.sizes.b24 + ' / ' + r.sizes.b32 + ' bytes');
    t.ok('calling it without a depth still writes 16-bit', r.sizes.dflt === r.sizes.b16);

    t.head('NO RESAMPLING ON THE WAY OUT');
    t.ok('the bounce renders at the rate the engine runs at',
      r.rate.bounce === r.rate.live,
      'bounce ' + r.rate.bounce + ' Hz, engine ' + r.rate.live + ' Hz');
    t.ok('which is full-bandwidth, not the old hard-coded 44100',
      r.rate.bounce >= 44100, r.rate.bounce + ' Hz');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
