/* FIRSTLIGHT — D aeolian, 88bpm, a noir piano-trio-plus-vibes.

   Written to the manual rather than to a number. The decisions that
   matter, each tied to a lesson in AGENTS.md:

   - THE HARMONY MOVES. The one failure the app cannot measure is a drone,
     and the one that cost the most ("drone machine noise") was a static
     bass under a looping figure. So the bass walks a changing root every
     bar and the progression is two different four-bar shapes:
        verse   Dm7  Bbmaj7  Gm7   Am7     (i  VI  iv  v)
        chorus  Dm7  Gm7     Bbmaj7 C       (i  iv  VI  VII)
     All diatonic to D aeolian, so there are no cross-relations to clash;
     the movement is in the roots and the voicings, not in borrowed chords.

   - REAL SOUNDS, CAST INTO ROLES. The ROOM sample kit is Naked Drums
     (velocity layers, round robins — a ghost note and an accent are
     different recordings), a contrabass and a Salamander grand, staged
     from their measured peaks. A vibraphone carries the lead and gives
     the mix a real top octave that a filtered oscillator never has to
     lose.

   - SPARSE, NOT DENSE. The kick plays 1 and the and-of-2, the snare the
     backbeat, the hats EIGHTHS not every sixteenth — the lesson that a
     hi-hat on every 16th is ten strokes a second and belongs in nothing.

   - A SHAPE, NOT A LOOP. Four distinct patterns in a real arrangement so
     form() sees intro / verse / chorus / outro rather than one bar
     repeated.

   - THE CHECKS READ AS PASS/FAIL, AND ONLY WHAT IS BROKEN IS FIXED. Every
     free check runs and its answer is printed. A number that says "this
     is fine as it is" leaves the music alone.

   Run:  npm run build  &&  node songs/firstlight.mjs
*/
import { chromium } from '/home/user/Clonedit/node_modules/playwright-core/index.mjs';
import { findBrowser, serve, boot } from '/home/user/Clonedit/tests/browser/harness.mjs';
import { writeFileSync, readFileSync } from 'node:fs';

const OUT = process.env.OUT || '/home/user/Clonedit/firstlight.wav';   // gitignored, like every bounce here
const say = (s) => console.log(s);

const srv = await serve();
const browser = await chromium.launch({ executablePath: await findBrowser(), args: ['--no-sandbox'] });
const { page, errors } = await boot(browser, srv.base);
page.on('console', m => { const t = m.text(); if (/^JBH /.test(t)) say('  ' + t.slice(4)); });

say('FIRSTLIGHT — building');

/* ---- SOUNDS ---------------------------------------------------------- */
const board = await page.evaluate(async () => {
  const J = window.JBH, L = [];
  await J.clear();

  // the ROOM kit: real drums + contrabass + grand, staged + velocity layers
  const kit = SAMPLE_KITS.find(k => k.id === 'room');
  await loadSampleKit(kit, false);
  const roleOf = {};
  for (let i = 0; i < 64; i++) { const p = S.pads[i];
    if (p.bufId >= 0 && p.role) (roleOf[p.role] = roleOf[p.role] || []).push(i); }
  L.push('kit ROOM: ' + Object.entries(roleOf).map(([r, a]) => r + '×' + a.length).join(' '));

  // a vibraphone for the lead and the top octave, staged toward -14dBFS
  await J.instrument('vibe', { pack: 'samples/vcsl-mallets.json', match: '^vc:vibs', lo: 72, hi: 91, max: 8 });
  for (const x of await J.instPads('vibe'))
    J.pad(x.pad, { gain: 0.9, att: 0.002, dec: 1.4, sus: 0.3, rel: 0.6 });
  L.push('vibe: ' + (await J.instPads('vibe')).length + ' pads');

  // THE BASS MUST NOT RING ACROSS A CHORD CHANGE. The contrabass sample
  // rings ~8s and a bar at 88bpm is ~2.7s, so an undamped root sustains
  // under the next two chords — which the (ring-aware) harmony check hears
  // as 50 notes a semitone off. Gated to a plucked ~1.5s it decays in its
  // own bar and the mud is gone.
  for (const x of await J.instPads('bass')) J.pad(x.pad, { att: 0.004, dec: 1.3, sus: 0, rel: 0.18 });
  // THE GRAND, DAMPED THE SAME WAY. A sustained comp chord rings into the
  // next bar and its top note lands a semitone off the new chord — 14 of
  // those. A ~2.2s decay clears most of it before the next downbeat and
  // still reads as a piano.
  for (const x of await J.instPads('keys')) J.pad(x.pad, { att: 0.006, dec: 1.8, sus: 0, rel: 0.35 });

  J.key('D', 'minor');
  J.set({ bpm: 88, swing: 0.16, human: 0.18 });
  return { L, roleOf, bass: (await J.instPads('bass')).length, keys: (await J.instPads('keys')).length };
});
for (const l of board.L) say('  ' + l);
say('  bass pads ' + board.bass + ', keys pads ' + board.keys);

/* ---- PARTS ----------------------------------------------------------- */
const built = await page.evaluate(async (roleOf) => {
  const J = window.JBH, L = [];
  const kick = roleOf.kick[0], snare = roleOf.snare[0], hat = roleOf.hat[0], ride = (roleOf.ride || [])[0];
  const V = (x) => x;   // readability: velocity

  // chord tables (MIDI), voiced close in a mid register for the piano
  const KEYS = {
    verse: [[50, 53, 57, 60], [46, 50, 53, 57], [43, 46, 50, 53], [45, 48, 52, 55]],   // Dm7 Bbmaj7 Gm7 Am7
    chorus: [[50, 53, 57, 60], [43, 46, 50, 53], [46, 50, 53, 57], [48, 52, 55, 60]],    // Dm7 Gm7 Bbmaj7 C
  };
  const ROOT = { verse: [38, 34, 31, 33], chorus: [38, 31, 34, 36] };   // bass roots: D Bb G A / D G Bb C

  // one 64-step pattern = 4 bars of 16. Build a pattern given its chord set + how busy.
  const buildBar = (pat, which, opt) => {
    J.pattern(pat, { plen: 64, clear: true, select: true });
    J.chords(pat, which === 'verse' ? ['Dm7', 'Bbmaj7', 'Gm7', 'Am7'] : ['Dm7', 'Gm7', 'Bbmaj7', 'C']);
    for (let bar = 0; bar < 4; bar++) {
      const b = bar * 16;
      // DRUMS — sparse groove, hats on eighths (not sixteenths)
      J.step(kick, b + 0, 0.95); J.step(kick, b + 6, 0.8);
      if (opt.busy) J.step(kick, b + 10, 0.6);
      J.step(snare, b + 4, 0.9); J.step(snare, b + 12, 0.95);
      if (opt.ghost) J.step(snare, b + 14, 0.3);
      for (let s = 0; s < 16; s += 2) J.step(hat, b + s, s % 4 === 0 ? 0.55 : 0.4);
      if (opt.ride && ride != null) for (let s = 0; s < 16; s += 4) J.step(ride, b + s + 2, 0.4);
      // BASS — root on the downbeat, the fifth on beat 3. Both short (the
      // pads are gated above), so each note belongs to its own chord and
      // the next root states the change cleanly. All diatonic chord tones,
      // no chromatic approach — the semitone clashes were the approach note.
      const roots = ROOT[which], r = roots[bar];
      const fifth = Math.max(28, Math.min(52, r + 7));
      J.note('bass', r, b + 0, 0.9);
      if (opt.walk) J.note('bass', fifth, b + 8, 0.55);
      // KEYS — the chord on the downbeat, left to decay in its own bar.
      // A mid-bar stab rang ~2.2s into the next chord and clashed; the
      // space it leaves is a noir trio's own sound anyway.
      J.note('keys', KEYS[which][bar], b + 0, 0.62);
    }
    return L.push(which + ' pattern ' + pat + ' written (' + JSON.stringify(opt) + ')');
  };

  // VERSE (pat 0): walking bass, comping, no ride
  buildBar(0, 'verse', { walk: true, comp: true, ghost: true });
  // CHORUS (pat 1): busier — ride, extra kick, the lead sits here
  buildBar(1, 'chorus', { walk: true, comp: true, ride: true, busy: true, ghost: true });

  // THE LEAD (vibraphone) — written only in the chorus, leaving the verse to breathe.
  // Composed over the changes by ear-principle: land on chord tones on strong
  // beats, leave space, answer the piano. AGENTS.md: when a generator ranks by
  // fault and the ear disagrees, the ear is right.
  J.pattern(1, { select: true });
  // Stepwise and singable, inside the vibe's sampled range (72-91), each
  // bar outlining its chord. More steps than leaps is what a tune is; the
  // repeated A in bar 0 is the ~21% a real melody has.
  const LEAD = [
    // bar 0 Dm7: A A G F — a sung descent landing on the 3rd
    [[81, 2, 0.72], [81, 3, 0.45], [79, 6, 0.6], [77, 10, 0.62]],
    // bar 1 Gm7: G A Bb — rise stepwise to the 3rd of Gm
    [[79, 0, 0.6], [81, 4, 0.58], [82, 8, 0.66]],
    // bar 2 Bbmaj7: D C Bb — step down to the root
    [[86, 2, 0.7], [84, 6, 0.6], [82, 10, 0.62]],
    // bar 3 C: C D E — rise to the bright 3rd, opening the loop round
    [[84, 0, 0.68], [86, 4, 0.6], [88, 8, 0.7]],
  ];
  for (let bar = 0; bar < 4; bar++) for (const [m, s, v] of LEAD[bar]) J.note('vibe', m, bar * 16 + s, v);
  L.push('lead: vibraphone over the chorus, ' + LEAD.reduce((a, b) => a + b.length, 0) + ' notes');

  // INTRO (pat 2): keys + bass only, sparse — sets the scene
  J.pattern(2, { plen: 64, clear: true, select: true });
  J.chords(2, ['Dm7', 'Bbmaj7', 'Gm7', 'Am7']);
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 16, r = ROOT.verse[bar];
    J.note('bass', r, b + 0, 0.7);
    J.note('keys', KEYS.verse[bar], b + 0, 0.5);
    J.step(roleOf.hat[0], b + 4, 0.3); J.step(roleOf.hat[0], b + 12, 0.3);
  }
  L.push('intro pattern 2: keys + bass');

  // OUTRO (pat 3): like the intro but let the last Dm7 ring
  J.pattern(3, { plen: 64, clear: true, select: true });
  J.chords(3, ['Dm7', 'Gm7', 'Bbmaj7', 'Dm7']);
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 16, r = ROOT.chorus[bar === 3 ? 0 : bar];
    J.note('bass', r, b + 0, 0.6);
    J.note('keys', (bar === 3 ? [38, 50, 53, 57, 62] : KEYS.chorus[bar]), b + 0, 0.5);
  }
  L.push('outro pattern 3');

  // ARRANGEMENT — a real shape, not one loop
  S.song = [[2, 2], [0, 4], [1, 4], [0, 2], [1, 2], [3, 2]].map(x => ({ pat: x[0], reps: x[1] }));
  S.songOn = true; S.songLoop = false;
  L.push('arrangement: intro×2 verse×4 chorus×4 verse×2 chorus×2 outro×2 = ' +
    S.song.reduce((a, s) => a + s.reps, 0) + ' bars');
  return L;
}, board.roleOf);
for (const l of built) say('  ' + l);

/* ---- THE CHECKS, READ AS PASS/FAIL ----------------------------------- */
say('\nCHECKS');
const checks = await page.evaluate(async () => {
  const J = window.JBH, out = {};
  const f = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = { err: String(e.message || e) }; } };
  await f('form', () => J.form({ src: 'song' }));
  await f('pulse', () => J.pulse({ src: 'song' }));
  await f('harmony', () => J.harmony({ src: 'song' }));
  await f('melody', () => J.melody('vibe', { src: 'song' }));
  await f('motif', () => J.motif('vibe', { src: 'song' }));
  await f('counterpoint', () => J.counterpoint(['bass', 'vibe'], { src: 'song' }));
  return out;
});
for (const [k, v] of Object.entries(checks)) {
  const s = v && v.says ? v.says : (v && v.err ? 'ERR ' + v.err : JSON.stringify(v).slice(0, 160));
  say('  ' + k.padEnd(13) + s.slice(0, 150));
}

/* ---- THE EXPENSIVE HALF: tone, phone, and what jumps out ------------- */
// Without a reference, tonal balance is not checked at all. This is a solo
// piano another agent bounced here and the listener called good — a fair
// target for a piano-trio timbre.
const prof = JSON.parse(readFileSync('/home/user/Clonedit/samples/ref-solo-piano.json', 'utf8'));
say('\nTONE & TRANSLATION (reference: solo piano)');
const deep = await page.evaluate(async (prof) => {
  const J = window.JBH, o = {};
  try { await J.reference(prof); } catch (e) { o.refErr = String(e.message); }
  const f = async (n, fn) => { try { o[n] = await fn(); } catch (e) { o[n] = { err: String(e.message || e) }; } };
  await f('critique', () => J.critique({ src: 'song' }));
  await f('translate', () => J.translate({ src: 'song' }));
  await f('loudness', () => J.loudness({ src: 'song' }));
  return o;
}, prof);
for (const k of ['critique', 'translate', 'loudness']) {
  const v = deep[k]; const s = v && v.says ? v.says : (v && v.err ? 'ERR ' + v.err : JSON.stringify(v).slice(0, 200));
  say('  ' + k.padEnd(10) + s.slice(0, 180));
}

/* ---- MASTER: solve the trim, do not ladder --------------------------- */
say('\nMASTER');
let probe = await page.evaluate(async () => { await window.JBH.set({ mTrim: -12 });
  return await window.JBH.render({ src: 'song', loops: 1, loudness: true }); });
const target = -15.0;   // a noir trio is spacious; not the -11.5 cliché
const trim = Math.max(-24, Math.min(12, -12 + (target - probe.lufs)));
say('  probe @ -12 trim: ' + (probe.lufs != null ? probe.lufs.toFixed(1) : '?') +
  ' LUFS  ->  solving for ' + target + ': trim ' + trim.toFixed(1));

/* ---- BOUNCE ---------------------------------------------------------- */
const wav = await page.evaluate(async (t) => { await window.JBH.set({ mTrim: t });
  return await window.JBH.render({ src: 'song', loops: 1, wav: true, depth: 24, loudness: true }); }, +trim.toFixed(1));
say('  bounced: ' + (wav.seconds != null ? wav.seconds.toFixed(1) + 's' : '?') +
  '  peak ' + (wav.peak != null ? wav.peak.toFixed(3) : '?') +
  '  ' + (wav.lufs != null ? wav.lufs.toFixed(1) + ' LUFS' : ''));
writeFileSync(OUT, Buffer.from(wav.wavBase64, 'base64'));
say('  wrote ' + OUT + ' (' + Math.round(wav.bytes / 1024) + ' KB)');

say('\njs errors: ' + (errors.length ? errors.slice(0, 3).join(' | ') : 'none'));
await browser.close(); await srv.close();
