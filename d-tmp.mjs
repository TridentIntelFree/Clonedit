import { findBrowser, serve, boot } from './tests/browser/harness.mjs';
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: await findBrowser(),
  args: ['--autoplay-policy=no-user-gesture-required'] });
const { base, close } = await serve();
const { ctx, page } = await boot(browser, base);
console.log(JSON.stringify(await page.evaluate(async () => {
  const pk = b => { let m = 0; const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; } return +m.toFixed(4); };
  const o = {};
  const before = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
  o.peakBefore = pk(before);
  o.padsBefore = S.pads.filter(p => p.bufId >= 0).length;
  o.bufsBefore = S.buffers.length;
  o.bufLenBefore = S.buffers[0] ? S.buffers[0].length : -1;

  const doc = snapshotSession();
  o.docBufs = (doc.buffers || []).length;
  o.docBuf0Len = doc.buffers && doc.buffers[0] ? doc.buffers[0].len : -1;
  o.docPads = (doc.pads || []).filter(p => p.bufId >= 0).length;

  const round = JSON.parse(JSON.stringify(doc));
  const bufs = docToBuffers(round);
  o.decodedBufs = bufs.length;
  o.decodedLen = bufs[0] ? bufs[0].length : -1;
  o.decodedPeak = bufs[0] ? pk(bufs[0]) : -1;

  applySessionDoc(round, bufs);
  o.padsAfter = S.pads.filter(p => p.bufId >= 0).length;
  o.bufsAfter = S.buffers.length;
  const after = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
  o.peakAfter = after ? pk(after) : 'NULL';
  o.stepsAfter = S.patterns[S.pattern].steps.flat().filter(v => v > 0).length;
  return o;
})));
await ctx.close(); await browser.close(); close();
