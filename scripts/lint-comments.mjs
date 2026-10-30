/* PROSE AFTER A CLOSED COMMENT.

   Writing a paragraph, closing it with a star-slash, then carrying on
   writing is the most repeated mistake in this repo — five times in one
   session, in src/legacy.js and in two song scripts. It is not an
   interesting bug; `node --check` catches it instantly. The whole cost
   is in WHEN it is caught, because a song script is syntax-checked at
   the top of a twenty-minute render and nowhere else, so the failure
   lands after the wait instead of before it.

   The first version of this check flagged seven places and every one
   was an object property sitting under a comment — `mEqLo:0,` and
   `judgedOver:rows.length,` and so on. A check that cries wolf gets
   ignored and may as well not exist, so the test below is deliberately
   narrow: a continued comment is a line of several WORDS that does not
   end the way a line of code ends and does not open like an object key.
   It is allowed to miss things. It is not allowed to be noisy. */
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2).filter(f => f !== '--self-test');
const SELFTEST = process.argv.includes('--self-test');

const continuesComment = (line) => {
  if (!/^\s{2,}[A-Za-z`]/.test(line)) return false;        // indented, opens like prose
  const s = line.trim();
  if (/[,;{[(]$/.test(s)) return false;                     // code line endings
  if (/^[\w$]+\s*:/.test(s)) return false;                  // object key
  if (/=>|[!<>=]=|[^=]=[^=]/.test(s)) return false;         // assignment or comparison
  /* statement punctuation. Prose in this codebase does not contain a
     semicolon, a brace or a quote; code almost always contains one of
     them. This single line removed every one of the eight remaining
     false positives (all `try{ … }catch(e){}`) and cost none of the
     five real cases. */
  if (/[;{}'"]|\/\//.test(s)) return false;
  if (/^(return|const|let|var|if|for|while|case|break|await|throw|function|try|catch|else|switch|do|new|delete|typeof)\b/.test(s)) return false;
  return s.split(/\s+/).length >= 4;                        // prose has words
};

if (SELFTEST) {
  /* A checker nobody has run against a known-bad input is not a
     checker. These are the five real cases from this session plus the
     seven false positives it used to raise. */
  const must = [
    '   THE APPROACH IS CHOSEN AGAINST BOTH CHORDS, not just taken as the',
    '   TAPE() DE-REGISTERS THE INSTRUMENT, and nothing says so. instPads()',
    '   A sampled instrument is one sound across many pads, so the lead goes',
    '   THE HATS ARE NOT ON EVERY SIXTEENTH, and the first version of this',
    '   Trimming to `reach` alone was wrong in the other direction: the',
  ];
  const mustNot = [
    '  mEqLo:0, mEqMid:0, mEqHi:0, mWidth:1, mCeil:-1.0, mMono:0,',
    "  notInTheSongDoc:['tape lanes','the LIVE instrument','pads'],",
    '  stretched, stretchLimit:limit,',
    '  judgedOver:rows.length, notOccupied:outside,',
    '  first: [',
    "  says:'Write music first: chords that change, a line with contour.',",
    '  vl: vl ? +vl[1] : null,',
    '  const N=Math.max(1, Math.min(tLen, outN));',
    '  return { pad:target, name, from:(o.target|0) };',
  ];
  let bad = 0;
  for (const m of must) if (!continuesComment(m)) { console.error('MISSED: ' + m.trim()); bad++; }
  for (const m of mustNot) if (continuesComment(m)) { console.error('FALSE POSITIVE: ' + m.trim()); bad++; }
  if (bad) { console.error(`\nself-test failed: ${bad}`); process.exit(1); }
  console.log(`self-test ok  (${must.length} known-bad caught, ${mustNot.length} known-good left alone)`);
  process.exit(0);
}

if (!files.length) { console.error('usage: lint-comments.mjs [--self-test] <file>...'); process.exit(2); }
let bad = 0;
for (const f of files) {
  let src; try { src = readFileSync(f, 'utf8'); } catch { continue; }
  const lines = src.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/\*\/\s*$/.test(lines[i])) continue;
    if (!continuesComment(lines[i + 1])) continue;
    console.error(`${f}:${i + 2}  a comment was closed and then continued`);
    console.error(`    ${i + 1}: …${lines[i].trim().slice(-56)}`);
    console.error(`    ${i + 2}: ${lines[i + 1].trim().slice(0, 56)}…`);
    bad++;
  }
}
if (bad) { console.error(`\n${bad} place${bad === 1 ? '' : 's'} to fix.`); process.exit(1); }
console.log(`comments ok  (${files.length} file${files.length === 1 ? '' : 's'})`);
