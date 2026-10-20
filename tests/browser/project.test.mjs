/* THE PROJECT FORMAT.

   Backwards compatibility was never the risk: every field is read as
   `doc.x != null ? doc.x : default`, so a project from twenty builds ago opens
   fine and should keep doing so. Forwards is the risk. If a later build changes
   what a field MEANS — ms to seconds, an index to an id, a flag inverted — a
   project written by that build and opened here reads as a valid number in the
   wrong unit. It does not fail; it loads wrong.

   Refusing is only worth anything if it leaves no damage, so the checks below
   compare the whole session before and after a refused load. Writing them found
   a hole in the gate: version alone cannot decide, because a pre-R139 document
   has no version either — so an arbitrary object read as "old project",
   migrated, and then threw halfway through applySessionDoc, leaving the session
   in pieces. Refused whole or applied whole, never half. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    const r = await page.evaluate(async () => {
      const o = {};
      S.bpm = 131; setBpm(131); S.swing = 0.21;
      const pad = S.pads.findIndex(x => x.bufId >= 0);
      S.patterns[S.pattern].steps[pad][2] = 0.77;
      const fingerprint = () => {
        const pt = S.patterns && S.patterns[S.pattern], row = pt && pt.steps && pt.steps[pad];
        return JSON.stringify({ bpm: S.bpm, swing: S.swing, ptn: S.pattern,
          npat: S.patterns ? S.patterns.length : 'NONE',
          steps: row ? Array.from(row) : null, name: document.getElementById('projName').value });
      };

      const doc = snapshotSession();
      o.fmt = doc.fmt; o.v = doc.v; o.build = doc.build; o.DOC_V = DOC_V;

      // --- a document from a future build ---
      const before = fingerprint();
      const future = JSON.parse(JSON.stringify(snapshotSession()));
      future.v = DOC_V + 7;
      future.build = 'JBH-88 · R999 · 2030-01-01 · from the future';
      future.bpm = 60; future.swing = 0;            // obvious if they were applied
      future.patterns[S.pattern].steps[pad] = future.patterns[S.pattern].steps[pad].map(() => 0);
      o.futureAccepted = applySessionDoc(future, docToBuffers(future));
      o.unchanged = before === fingerprint();
      o.said = document.getElementById('lcdmsg').textContent;

      // --- a document from before versioning existed ---
      const legacy = JSON.parse(JSON.stringify(snapshotSession()));
      delete legacy.v; delete legacy.build;         // exactly what R138 wrote
      legacy.bpm = 96; legacy.swing = 0.33;
      o.legacyAccepted = applySessionDoc(legacy, docToBuffers(legacy));
      o.legacyBpm = S.bpm; o.legacySwing = S.swing; o.legacyMigratedTo = legacy.v;

      // --- undo/redo routes through the same gate ---
      S.bpm = 120; setBpm(120); dirty();
      await new Promise(x => setTimeout(x, 900));
      S.bpm = 77; setBpm(77); dirty();
      await new Promise(x => setTimeout(x, 900));
      const beforeUndo = S.bpm;
      undo();
      o.undoMoved = S.bpm !== beforeUndo; o.undoFrom = beforeUndo; o.undoTo = S.bpm;

      // --- something that is not a project at all ---
      const b4 = fingerprint();
      o.threw = '';
      try { applySessionDoc({ hello: 'world' }, []); } catch (e) { o.threw = e.message; }
      o.junkLeftItAlone = b4 === fingerprint();

      // --- and one wearing the right format name but the wrong shape ---
      const b5 = fingerprint();
      o.threw2 = '';
      try { applySessionDoc({ fmt: DOC_FMT, v: DOC_V, pads: 'not an array' }, []); }
      catch (e) { o.threw2 = e.message; }
      o.malformedLeftItAlone = b5 === fingerprint();
      return o;
    });

    t.head('WHAT A SAVED DOCUMENT CARRIES');
    t.note('    fmt "' + r.fmt + '" · v ' + r.v + ' · build "' + String(r.build).slice(0, 30) + '…"');
    t.ok('the format is named', r.fmt === 'mvx880-project');
    t.ok('the schema version is present', r.v === r.DOC_V, 'v=' + r.v);
    t.ok('the writing build is recorded', typeof r.build === 'string' && r.build.length > 0);

    t.head('A DOCUMENT FROM A FUTURE BUILD');
    t.ok('is refused', r.futureAccepted === false, 'applySessionDoc returned ' + r.futureAccepted);
    t.ok('WITH THE SESSION BIT-FOR-BIT UNCHANGED', r.unchanged);
    t.note('    it says: "' + r.said + '"');
    t.ok('and names the build that wrote it', /R999/.test(r.said));
    t.ok('rather than only saying "failed"', !/^LOAD FAILED\.?$/i.test(r.said.trim()));

    t.head('A DOCUMENT FROM BEFORE VERSIONING');
    t.ok('still opens', r.legacyAccepted === true);
    t.ok('with its BPM applied', r.legacyBpm === 96, 'bpm=' + r.legacyBpm);
    t.ok('and its swing applied', Math.abs(r.legacySwing - 0.33) < 1e-6, 'swing=' + r.legacySwing);
    t.ok('and is migrated to the current version', r.legacyMigratedTo === r.DOC_V,
      'v=' + r.legacyMigratedTo);

    t.head('UNDO STILL WORKS THROUGH THE SAME GATE');
    t.ok('undo changed the session', r.undoMoved, r.undoFrom + ' → ' + r.undoTo);

    t.head('THINGS THAT ARE NOT PROJECTS');
    t.ok('arbitrary JSON does not throw', !r.threw, r.threw);
    t.ok('and leaves the session alone', r.junkLeftItAlone);
    t.ok('the right format name with the wrong shape does not throw', !r.threw2, r.threw2);
    t.ok('and leaves the session alone too', r.malformedLeftItAlone);

    /* R204. The app has had a song-doc format and a window.JBH since early on,
       so "can an agent drive this" was already half true: it could WRITE a
       beat. It could not know anything about one — not whether the doc
       loaded, not whether the result made a sound, not whether it clipped.
       An agent composing with no way to check its own work is a worse
       collaborator than a person with the same handicap, because it cannot
       hear.

       state() and render() close that. What is guarded here is the whole
       round trip an agent actually performs: write a doc, load it, read the
       state back, bounce it, and find out whether anything came out. */
    t.head('AN AGENT CAN DRIVE IT, AND CHECK ITS OWN WORK');
    const api = await page.evaluate(async () => {
      ensureAudio(); await new Promise(x => setTimeout(x, 350));
      /* Set up our own audible state. Earlier sections of this suite leave
         pads muted and the master down, and the first version of this read
         peak 0 on a working render — measuring what the suite had done to the
         session rather than what the API does. */
      S.pads.forEach(p => { p.mute = false; });
      S.masterVol = 0.9;
      try { reapplyLivePads(); } catch (e) {}
      await new Promise(x => setTimeout(x, 150));
      const o = {};
      o.members = Object.keys(window.JBH).sort();
      o.aliasIsSame = window.JBH === window.MVX;
      o.state = JBH.state();
      /* Render a doc WE wrote rather than whatever the suite left behind.
         Earlier sections here leave the session in states that legitimately
         bounce to silence, and the first version of this measured one of them
         — a passing app reading as a failure. The property under test is that
         render() reports what is really there, which needs a known input. */
      JBH.load({ fmt: 'mvx-songdoc-1', title: 'api probe', bpm: 120,
        pads: [{ preset: 'dkick', note: 36, gain: 1 }],
        patterns: [{ steps: { "0": [[0, 1], [4, 1], [8, 1], [12, 1]] } }] });
      await new Promise(x => setTimeout(x, 700));
      o.render = await JBH.render();
      const withWav = await JBH.render({ wav: true });
      o.wavLooksLikeWav = typeof withWav.wavBase64 === 'string' &&
        atob(withWav.wavBase64.slice(0, 8)).slice(0, 4) === 'RIFF';
      o.wavBytes = withWav.bytes;
      /* a doc written from outside must load and be visible in state() */
      const before = JBH.state().hits;
      /* Deliberately a DIFFERENT shape from the probe doc above — six hits at
         128 rather than four at 120 — so "it loaded" cannot be satisfied by
         the session simply not having changed. */
      JBH.load({ fmt: 'mvx-songdoc-1', title: 'agent test', bpm: 128,
        pads: [{ preset: 'dsnare', note: 38, gain: 1 }],
        patterns: [{ steps: { "0": [[0, 1], [3, 1], [6, 1], [9, 1], [12, 1], [15, 1]] } }] });
      await new Promise(x => setTimeout(x, 600));
      const after = JBH.state();
      o.loaded = { bpm: after.bpm, hits: after.hits, padsLoaded: after.pads.loaded, before };
      o.renderAfterLoad = await JBH.render();
      return o;
    });
    t.note('    window.JBH: ' + api.members.join(', '));
    t.ok('the API is reachable under both names', api.aliasIsSame &&
      ['load','export','play','stop','state','render','spec','version'].every(k => api.members.includes(k)));
    t.ok('state() reports what is loaded and what is playing',
      api.state.pads.loaded > 0 && api.state.patterns > 0 &&
      typeof api.state.playing === 'boolean' && api.state.audio.rate > 0,
      api.state.pads.loaded + ' pads, ' + api.state.hits + ' hits in pattern ' + api.state.pattern);
    t.ok('and says plainly what the song doc does NOT carry, rather than leaving it to be inferred',
      Array.isArray(api.state.notInTheSongDoc) && api.state.notInTheSongDoc.length >= 3,
      api.state.notInTheSongDoc.join(' · '));
    t.note('    render(): ' + api.render.seconds + 's, peak ' + api.render.peak + ', rms ' + api.render.rms);
    t.ok('render() bounces and returns real measurements, not just a promise',
      api.render.seconds > 0.1 && api.render.peak > 0.01 &&
      api.render.clipping === false && api.render.silent === false);
    t.ok('and hands back genuine WAV bytes when asked',
      api.wavLooksLikeWav && api.wavBytes > 10000,
      api.wavBytes + ' bytes, RIFF header');
    t.note('    a doc written from outside: ' + api.loaded.before + ' hits before, ' +
      api.loaded.hits + ' after, at ' + api.loaded.bpm + ' BPM');
    t.ok('A DOC WRITTEN FROM OUTSIDE LOADS, and state() shows it did',
      api.loaded.bpm === 128 && api.loaded.hits === 6 && api.loaded.padsLoaded === 1 &&
      api.loaded.hits !== api.loaded.before,
      api.loaded.before + ' hits at the probe doc, ' + api.loaded.hits + ' at ' + api.loaded.bpm + ' BPM after');
    t.ok('and the thing it made actually sounds',
      api.renderAfterLoad && api.renderAfterLoad.silent === false &&
      api.renderAfterLoad.peak > 0.05,
      'peak ' + (api.renderAfterLoad || {}).peak);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
