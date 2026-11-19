/* review({quick:true}) ON A TRACK BUILT THE WAY THE MANUAL SAYS TO.

   Found by making a song over MCP: with a key and chords declared on every
   pattern, the quick review still said "no progression was given" and never
   checked the harmony, and it ran motif() on the kick, snare, hat and ride —
   six "nothing here comes back" findings about a drum kit, burying the real
   ones. Both are the reading a person acts on, so both are checked on a
   board that has a kit laid out with instrument() and a declared progression. */
import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    const r = await page.evaluate(async () => {
      JBH.clear();
      await JBH.instrument('kick', { pack: 'samples/nakeddrums.json', match: 'Bottom_Black' });
      await JBH.instrument('keys', { pack: 'samples/salamander.json', match: 'sal:', lo: 48, hi: 72, max: 6 });
      JBH.key('C', 'major');
      JBH.pattern(0, { plen: 64, clear: true, select: true });
      JBH.chords(0, ['C', 'F', 'G', 'C']);
      const V = [[60, 64, 67], [60, 65, 69], [59, 62, 67], [60, 64, 67]];
      const tune = [[64, 67, 72, 71], [69, 67, 65, 64], [62, 67, 65, 62], [64, 60, 64, 60]];
      for (let b = 0; b < 4; b++) {
        JBH.note('keys', V[b], b * 16, 0.6, { beats: 2 });
        tune[b].forEach((m, i) => JBH.note('keys', m, b * 16 + i * 4 + 2, 0.7, { beats: 1 }));
        for (const s of [0, 4, 8, 12]) JBH.note('kick', 36, b * 16 + s, 0.9, { beats: 0.5 });
      }
      return await JBH.review({ quick: true, src: 'pat' });
    });
    t.head('A DECLARED PROGRESSION IS USED');
    t.ok('harmony runs without being handed the chords', r.ran.includes('harmony'),
      'ran: ' + r.ran.join(', '));
    t.ok('and the stale "nothing stores a progression" claim is gone',
      !(r.notApplicable || []).some(x => /Nothing in this app stores/.test(x)),
      JSON.stringify(r.notApplicable || []).slice(0, 120));
    t.head('A KIT IS NOT A MELODY');
    t.ok('the kick is not examined as a line', !r.lines.includes('kick'), 'lines: ' + r.lines.join(', '));
    t.ok('and no motif finding is about it',
      !r.findings.some(f => /^kick:/.test(f.says)), r.findings.map(f => f.says.slice(0, 40)).join(' | '));
    t.ok('while the pitched part still is', r.lines.includes('keys'));
    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally { await ctx.close(); }
  return t;
}
