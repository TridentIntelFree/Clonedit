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

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
