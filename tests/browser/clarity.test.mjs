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

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
