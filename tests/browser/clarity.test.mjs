/* CLARITY, AND THE CROSSOVER UNDERNEATH IT.

   The OUT panel makes four claims that are all measurable, so they are all
   measured here against the app's own graph rather than a reimplementation of
   it: MUD, AIR, FOCUS and DE-ESS are exactly transparent at their defaults;
   BASS MONO sums flat; and DE-ESS compresses sibilance without tearing a hole
   at the crossover.

   The crossover check exists because the shipped one was wrong for two builds.
   Web Audio reads the Q attribute in DECIBELS for lowpass and highpass and as
   a real Q for peaking and shelving, so Math.SQRT1_2 — correct everywhere else
   in the file — asked for 0.71dB of resonance rather than a Q of 0.71, and the
   pair recombined +7.4dB up at the crossover instead of flat. A control that
   claimed only to centre the image was applying a large boost.

   Everything is swept with SINE TONES AT AWKWARD FREQUENCIES. The first sweep
   written for the de-esser used round numbers and reported the topology flat
   when it was not: 500, 2000, 4000, 6000 and the rest are all a whole number
   of cycles of a 288-sample delay, so the phase error the test existed to find
   was invisible in every single reading. Frequencies that do not divide are
   not a detail here, they are the test. */

import { boot, checker } from './harness.mjs';

/* Prime-ish, and none of them a whole number of cycles of 288 samples @48k. */
const F = [131, 523, 1103, 2093, 3011, 4187, 5099, 6047, 7013, 9041, 13907];

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    const r = await page.evaluate(async (F) => {
      const o = {};
      const SR = AC.sampleRate, N = Math.round(SR * 0.55);
      const AN0 = Math.round(SR * 0.15), AN = N - AN0;      // analyse after the filters settle

      /* Goertzel: the amplitude at exactly f. Used instead of a peak reading so
         every frequency can be measured from ONE render of a summed multitone
         rather than one render per frequency.
         That matters more than it sounds: buildGraph synthesises a fresh
         reverb impulse response on every call, so the per-frequency version
         built 138 of them and was by a wide margin the slowest suite in the
         run. Linear stages cannot intermodulate, so the readings are the same;
         for DE-ESS, which is not linear, a broadband probe is if anything the
         more realistic one, and reference and test see the identical input. */
      const goertzel = (d, f) => {
        const w = 2 * Math.PI * f / SR, cr = 2 * Math.cos(w);
        let s1 = 0, s2 = 0;
        for (let i = AN0; i < d.length; i++) { const s = d[i] + cr * s1 - s2; s2 = s1; s1 = s; }
        return 2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - cr * s1 * s2)) / AN;
      };

      /* One render of every test tone at once, through the app's OWN master
         graph — buildGraph and applyMasterG, the same code the speakers and
         the bounce use. */
      const render = async (state, stereo) => {
        const oc = new OfflineAudioContext(stereo ? 2 : 1, N, SR);
        const g = buildGraph(oc);
        const save = {};
        for (const k in state) { save[k] = S[k]; S[k] = state[k]; }
        applyMasterG(g, oc);
        for (const k in save) S[k] = save[k];
        return { oc, g };
      };
      const multitone = async (state) => {
        const { oc, g } = await render(state, false);
        const amp = state.__amp != null ? state.__amp : 0.05;
        for (const f of F) {
          const osc = oc.createOscillator(); osc.frequency.value = f;
          const a = oc.createGain(); a.gain.value = amp;
          osc.connect(a); a.connect(g.master); osc.start();
        }
        const d = (await oc.startRendering()).getChannelData(0);
        const out = {};
        for (const f of F) out[f] = goertzel(d, f);
        return out;
      };

      /* Every reading is a DIFFERENCE against the same graph at rest, so the
         master compressor, trim and limiter cancel out and what is left is the
         stage under test. */
      const FLAT = { mEqLo: 0, mEqMid: 0, mEqHi: 0, mWidth: 1, mMono: 0, mByp: false,
        mMud: 0, mAir: 0, mFocus: 0, mDeess: 0 };
      /* The level must match on both sides of the subtraction. DE-ESS needs a
         hotter probe to cross its threshold, and running the reference at the
         quiet level offset that whole column by +7.96dB — which read as the
         de-esser boosting the bass. One reference per amplitude, reused. */
      const refs = {};
      const refFor = async (amp) => {
        const k = String(amp);
        if (!refs[k]) { const st = Object.assign({}, FLAT);
          if (amp != null) st.__amp = amp; refs[k] = await multitone(st); }
        return refs[k];
      };
      const sweep = async (state) => {
        const ref = await refFor(state.__amp != null ? state.__amp : null);
        const got = await multitone(Object.assign({}, FLAT, state));
        const out = {};
        for (const f of F) out[f] = +(20 * Math.log10((got[f] || 1e-30) / (ref[f] || 1e-30))).toFixed(2);
        return out;
      };
      const worstOf = m => Object.values(m).reduce((w, v) => Math.abs(v) > Math.abs(w) ? v : w, 0);

      o.defaults = await sweep({});                       // must be identically 0
      o.monoOn = await sweep({ mMono: 6047 });            // the crossover, at a swept frequency
      o.mud = await sweep({ mMud: -6 });
      o.air = await sweep({ mAir: 6 });
      o.deessOff = await sweep({ mDeess: 0 });
      o.deessOn = await sweep({ mDeess: 1, __amp: 0.12 });
      /* The other half of the makeup-gain bug: an uncompensated compressor
         lifts the band it is watching whether or not anything is above the
         threshold, so a quiet mix would come back BRIGHTER for turning a
         de-esser on. Nothing here may rise. */
      o.deessQuiet = await sweep({ mDeess: 1, __amp: 0.004 });
      o.worst = { defaults: worstOf(o.defaults), monoOn: worstOf(o.monoOn),
        deessOff: worstOf(o.deessOff) };

      /* FOCUS is a stereo effect, so it needs a stereo probe: a tone hard
         centred (pure mid) and the same tone in anti-phase (pure side). */
      const ms = async (focus, side) => {
        const { oc, g } = await render(Object.assign({}, FLAT, { mFocus: focus }), true);
        const osc = oc.createOscillator(); osc.frequency.value = 1811;
        const mg = oc.createChannelMerger(2);
        const L = oc.createGain(), R = oc.createGain();
        L.gain.value = 0.2; R.gain.value = side ? -0.2 : 0.2;   // anti-phase = pure side
        osc.connect(L); osc.connect(R);
        L.connect(mg, 0, 0); R.connect(mg, 0, 1);
        mg.connect(g.master); osc.start();
        const d = (await oc.startRendering()).getChannelData(0);
        return 20 * Math.log10(goertzel(d, 1811) || 1e-30);
      };
      const mid0 = await ms(0, false), side0 = await ms(0, true);
      o.focusUp = { mid: +(await ms(1, false) - mid0).toFixed(2),
        side: +(await ms(1, true) - side0).toFixed(2) };
      o.focusDown = { mid: +(await ms(-1, false) - mid0).toFixed(2),
        side: +(await ms(-1, true) - side0).toFixed(2) };

      o.constants = { BW_Q, DS_F, DS_LAT, FC_F, FOCUS_DB, DEESS_DB };
      o.dsTable = MAKEUP_DS.length;

      /* Off means off in the state too, not just in the graph: BYPASS has to
         neutralise the new controls the way it neutralises the old ones. */
      o.bypassed = await sweep({ mMud: -9, mAir: 9, mFocus: 1, mDeess: 1, mByp: true });
      o.worst.bypassed = worstOf(o.bypassed);
      return o;
    }, F);

    const show = m => F.map(f => f + ':' + m[f].toFixed(2)).join(' ');

    t.head('NOTHING IS TOUCHED UNTIL YOU TOUCH IT');
    t.note('    ' + show(r.defaults));
    t.ok('CLARITY at its defaults is exactly transparent — 0.00dB at every frequency',
      Math.abs(r.worst.defaults) === 0, 'worst ' + r.worst.defaults.toFixed(2) + ' dB');
    t.note('    ' + show(r.deessOff));
    t.ok('DE-ESS at 0 passes the mix through untouched, crossover and all',
      Math.abs(r.worst.deessOff) === 0, 'worst ' + r.worst.deessOff.toFixed(2) + ' dB');
    t.note('    ' + show(r.bypassed));
    t.ok('and BYPASS neutralises all four with every one of them up',
      Math.abs(r.worst.bypassed) === 0, 'worst ' + r.worst.bypassed.toFixed(2) + ' dB');

    t.head('THE BASS MONO CROSSOVER SUMS FLAT');
    t.note('    ' + show(r.monoOn));
    t.ok('Butterworth Q is given in the dB the spec asks for, not as a raw Q',
      Math.abs(r.constants.BW_Q + 3.0103) < 0.001, 'BW_Q ' + r.constants.BW_Q);
    t.ok('splitting and recombining costs under 0.2dB anywhere',
      Math.abs(r.worst.monoOn) < 0.2, 'worst ' + r.worst.monoOn.toFixed(2) + ' dB');
    t.ok('and specifically not the +7.4dB it used to add at the crossover',
      Math.abs(r.monoOn[6047]) < 0.2, r.monoOn[6047].toFixed(2) + ' dB at 6047Hz');

    t.head('MUD AND AIR LAND WHERE THEY SAY');
    t.note('    MUD -6dB @300  ' + show(r.mud));
    t.ok('MUD cuts around 300Hz', r.mud[523] < -1.5 && r.mud[131] < -0.2,
      r.mud[131].toFixed(2) + ' @131  ' + r.mud[523].toFixed(2) + ' @523');
    t.ok('and leaves the top alone', Math.abs(r.mud[9041]) < 0.3,
      r.mud[9041].toFixed(2) + ' dB @9041');
    t.note('    AIR +6dB @12k   ' + show(r.air));
    t.ok('AIR lifts the top', r.air[13907] > 4, r.air[13907].toFixed(2) + ' dB @13907');
    t.ok('and leaves the voice range alone', Math.abs(r.air[2093]) < 0.5,
      r.air[2093].toFixed(2) + ' dB @2093');
    t.ok('sitting above TONE\'s HIGH so it opens rather than hardens',
      r.air[13907] - r.air[6047] > 2,
      '+' + (r.air[13907] - r.air[6047]).toFixed(2) + ' dB more at 13.9k than at 6k');

    t.head('DE-ESS COMPRESSES SIBILANCE, NOT THE MIX');
    t.note('    ' + show(r.deessOn));
    t.ok('it pulls the sibilant band down, by the depth the ratio implies',
      r.deessOn[9041] < -8 && r.deessOn[13907] < -14,
      r.deessOn[9041].toFixed(2) + ' dB @9041, ' + r.deessOn[13907].toFixed(2) + ' dB @13907'
      + ' (was -2.03 / -2.51 with the makeup gain left in)');
    t.ok('harder the higher it goes', r.deessOn[13907] < r.deessOn[7013],
      r.deessOn[7013].toFixed(2) + ' → ' + r.deessOn[13907].toFixed(2) + ' dB');
    t.ok('while the body of the mix is left alone',
      Math.abs(r.deessOn[131]) < 0.6 && Math.abs(r.deessOn[523]) < 0.6,
      r.deessOn[131].toFixed(2) + ' @131  ' + r.deessOn[523].toFixed(2) + ' @523');
    t.ok('NO COMB NOTCH AT THE CROSSOVER — the 6ms latency really is compensated',
      r.deessOn[5099] > -2.5 && r.deessOn[4187] > -2.5,
      r.deessOn[4187].toFixed(2) + ' @4187  ' + r.deessOn[5099].toFixed(2)
      + ' @5099 (was -7.18 uncompensated)');
    t.ok('the compensation matches the measured pre-delay',
      Math.abs(r.constants.DS_LAT - 0.006) < 1e-9, r.constants.DS_LAT + 's');
    t.note('    quiet source  ' + F.map(f => f + ':' + r.deessQuiet[f].toFixed(2)).join(' '));
    t.ok('and it never BRIGHTENS quiet material — the makeup gain is cancelled',
      Math.max(...F.map(f => r.deessQuiet[f])) < 0.5,
      'worst rise ' + Math.max(...F.map(f => r.deessQuiet[f])).toFixed(2) + ' dB');
    t.ok('the makeup table was actually measured, not defaulted to 1',
      r.dsTable > 4, r.dsTable + ' points');

    t.head('FOCUS MOVES THE CENTRE AGAINST THE SIDES');
    t.ok('turned up, centred material rises and the sides fall',
      r.focusUp.mid > 3 && r.focusUp.side < -3,
      'mid ' + r.focusUp.mid.toFixed(2) + ' dB, side ' + r.focusUp.side.toFixed(2) + ' dB');
    t.ok('turned down, the opposite — toward an instrumental',
      r.focusDown.mid < -3 && r.focusDown.side > 3,
      'mid ' + r.focusDown.mid.toFixed(2) + ' dB, side ' + r.focusDown.side.toFixed(2) + ' dB');
    t.ok('and the two legs move by the same amount, so the level barely shifts',
      Math.abs(r.focusUp.mid + r.focusUp.side) < 1.0,
      'net ' + (r.focusUp.mid + r.focusUp.side).toFixed(2) + ' dB');

    t.head('THE SETTINGS SURVIVE, AND OLD PROJECTS DO NOT SPROUT THEM');
    const persist = await page.evaluate(async () => {
      const o = {};
      const set = (id, v) => { const e = document.getElementById(id);
        e.value = v; e.dispatchEvent(new Event('input')); };
      set('mMud', -4.5); set('mAir', 3.5); set('mFocus', 0.62); set('mDeess', 0.4);
      o.before = { mMud: S.mMud, mAir: S.mAir, mFocus: S.mFocus, mDeess: S.mDeess };
      /* structuredClone, not JSON — snapshotSession stores each channel as a
         raw ArrayBuffer of Int16 PCM, which is exactly what IndexedDB keeps
         and exactly what JSON.stringify turns into {}. Round-tripping this doc
         through JSON silently empties every sample and the render comes back
         at peak 0.0000, which looks like an engine fault and is not one. */
      const snap = structuredClone(snapshotSession());
      S.mMud = 0; S.mAir = 0; S.mFocus = 0; S.mDeess = 0;
      applySessionDoc(structuredClone(snap), docToBuffers(structuredClone(snap)));
      o.after = { mMud: S.mMud, mAir: S.mAir, mFocus: S.mFocus, mDeess: S.mDeess };
      o.ui = ['mMud','mAir','mFocus','mDeess'].map(i => +document.getElementById(i).value);
      /* A project written before these controls existed must open with them
         OFF. Anything else means loading an old session quietly applies
         processing its author never chose. */
      const old = structuredClone(snap);
      delete old.mMud; delete old.mAir; delete old.mFocus; delete old.mDeess;
      applySessionDoc(old, docToBuffers(structuredClone(old)));
      o.legacy = { mMud: S.mMud, mAir: S.mAir, mFocus: S.mFocus, mDeess: S.mDeess };
      /* Two different contracts, and they are different on purpose.
         A number outside the control's range is a value the loader can honour
         by clamping — the project is real, one setting was extreme.
         A field of the WRONG TYPE is a damaged file, and docAccept refuses it
         whole rather than applying half of it. */
      const evil = structuredClone(snap);
      evil.mMud = -999; evil.mAir = 999; evil.mFocus = 50; evil.mDeess = 0.5;
      applySessionDoc(evil, docToBuffers(structuredClone(evil)));
      o.clamped = { mMud: S.mMud, mAir: S.mAir, mFocus: S.mFocus, mDeess: S.mDeess };

      const bent = structuredClone(snap);
      bent.mDeess = 'x';
      o.bentRefused = applySessionDoc(bent, docToBuffers(structuredClone(bent))) === false;
      o.afterBent = { mMud: S.mMud, mAir: S.mAir, mFocus: S.mFocus, mDeess: S.mDeess };
      /* And the round-trip must leave the instrument playable, not just
         carry four numbers. */
      applySessionDoc(structuredClone(snap), docToBuffers(structuredClone(snap)));
      const back = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
      let pk = 0;
      if (back) { const d = back.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } }
      o.peakAfterLoad = pk;
      return o;
    });
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    t.ok('a save/load round-trip returns every value',
      same(persist.before, persist.after), JSON.stringify(persist.after));
    t.ok('and the sliders redraw to match',
      same(persist.ui, [-4.5, 3.5, 0.62, 0.4]), JSON.stringify(persist.ui));
    t.ok('a project saved before these existed opens with them OFF',
      Object.values(persist.legacy).every(v => v === 0), JSON.stringify(persist.legacy));
    t.ok('an out-of-range NUMBER is clamped to the control\'s range',
      persist.clamped.mMud === -9 && persist.clamped.mAir === 9
      && persist.clamped.mFocus === 1 && persist.clamped.mDeess === 0.5,
      JSON.stringify(persist.clamped));
    t.ok('but a field of the wrong TYPE is refused whole, not half-applied',
      persist.bentRefused
      && JSON.stringify(persist.afterBent) === JSON.stringify(persist.clamped),
      'refused: ' + persist.bentRefused + ', state held at ' + JSON.stringify(persist.afterBent));
    t.ok('and the reloaded project still makes sound', persist.peakAfterLoad > 0.05,
      'peak ' + persist.peakAfterLoad.toFixed(4));

    t.head('AND IT IS IN THE FILE, NOT JUST THE SPEAKERS');
    const inFile = await page.evaluate(async () => {
      const band = (buf, lo, hi) => { const d = buf.getChannelData(0); let a = 0;
        const g = f => { const w = 2 * Math.PI * f / buf.sampleRate, cr = 2 * Math.cos(w);
          let s1 = 0, s2 = 0;
          for (let i = 0; i < d.length; i++) { const s = d[i] + cr * s1 - s2; s2 = s1; s1 = s; }
          return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - cr * s1 * s2)) / d.length; };
        for (let f = lo; f <= hi; f += (hi - lo) / 8) { const v = g(f); a += v * v; }
        return a; };
      /* Driven through the controls, not by assigning to S.
         Setting S directly raced the app: applySessionDoc calls outWrite(),
         which writes S back into the sliders, and any later outRead() then
         writes the SLIDERS back into S — wiping a value assigned behind the
         UI's back. It passed alone and failed in the full run, which is the
         worst kind of test. Moving the slider is what a person does and it
         cannot drift out of step with the DOM. */
      /* The demo has almost nothing above 11kHz — dry band energy measured
         between 1.8e-13 and 1.5e-11 across runs, which is numerical noise, and
         Chrome's float summing varies by about -74dB render to render anyway.
         Reading AIR as a ratio of that to itself gave +6.03dB, -4.88dB and
         +5.63dB on three consecutive runs of the same code. The band needs
         real material in it, so a broadband noise pad goes in and gets a step:
         now both bands are well above the floor and the reading is stable. */
      const nb = AC.createBuffer(1, Math.round(AC.sampleRate * 0.45), AC.sampleRate);
      const nd = nb.getChannelData(0);
      let seed = 2463534242;
      for (let i = 0; i < nd.length; i++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed |= 0;
        nd[i] = (seed / 0x80000000) * 0.35;
      }
      S.buffers.push(nb);
      const P = 0;
      Object.assign(S.pads[P], { bufId: S.buffers.length - 1, gain: 1, pitch: 0, pan: 0,
        rev: 0, dly: 0, fcut: 1, fres: 0, start: 0, end: 1, rel: 1, reverse: false });
      S.patterns[S.pattern].steps[P].fill(0);
      S.patterns[S.pattern].steps[P][0] = 1;
      if (S.patterns[S.pattern].poly) delete S.patterns[S.pattern].poly[P];
      if (LIVE) reapplyLivePads();

      const set = (id, v) => { const e = document.getElementById(id);
        e.value = v; e.dispatchEvent(new Event('input')); };
      ['mMud','mAir','mFocus','mDeess'].forEach(id => set(id, 0));
      if (S.mByp) document.getElementById('btnMByp').click();
      const dry = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
      const dTop = band(dry, 11000, 16000), dMud = band(dry, 250, 400);
      set('mAir', 9); set('mMud', -9);
      const armed = { mAir: S.mAir, mMud: S.mMud, byp: S.mByp };   // reported, so a flake explains itself
      const wet = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
      const wTop = band(wet, 11000, 16000), wMud = band(wet, 250, 400);
      ['mMud','mAir'].forEach(id => set(id, 0));
      return { air: 10 * Math.log10(wTop / dTop), mud: 10 * Math.log10(wMud / dMud),
        armed, held: { mAir: S.mAir, mMud: S.mMud }, dTop, dMud };
    });
    t.ok('the controls really were up for the second render',
      inFile.armed.mAir === 9 && inFile.armed.mMud === -9 && !inFile.armed.byp,
      JSON.stringify(inFile.armed));
    t.ok('and there is material in both bands to measure',
      inFile.dTop > 1e-8 && inFile.dMud > 1e-8,
      'top ' + inFile.dTop.toExponential(2) + ', mud ' + inFile.dMud.toExponential(2));
    t.ok('AIR is in the exported bounce', inFile.air > 2,
      '+' + inFile.air.toFixed(2) + ' dB across 11-16kHz of the render');
    t.ok('MUD is in the exported bounce', inFile.mud < -2,
      inFile.mud.toFixed(2) + ' dB across 250-400Hz of the render');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
