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
  /* and the orphaned close, which is the same mistake made backwards */
  const orphanBad = 'const a = 1;\n   prose pasted in front of a close */\nconst b = 2;\n';
  const orphanOk = "const re = /\\*\\//; const s = '*/'; /* a real comment */\nconst t = `*/`;\n";
  if (!orphanCloses(orphanBad).length) { console.error('MISSED: the orphaned close'); bad++; }
  if (orphanCloses(orphanOk).length) { console.error('FALSE POSITIVE: a star-slash in a string or regex'); bad++; }
  if (bad) { console.error(`\nself-test failed: ${bad}`); process.exit(1); }
  console.log(`self-test ok  (${must.length + 1} known-bad caught, ${mustNot.length + 1} known-good left alone)`);
  process.exit(0);
}

/* THE OTHER HALF OF THE SAME MISTAKE: A CLOSE WITH NO OPENER.
   The check above catches prose written AFTER a star-slash. It passed a
   file that failed to parse, because the slip had happened the other way
   round — a paragraph was pasted in front of an existing star-slash, so
   the prose came first and the orphaned close came after it:

       candidate ... has given away more than the shape term can pay back. ×/
       How much is free is not a taste: it is how much the pad's own gain can

   (that × is a real star-slash in the file being checked; written literally
   here it would close THIS comment, which is how the first draft of this
   very paragraph broke the script — the mistake is easy enough to make
   while documenting it.)

   Both lines are prose, neither follows a star-slash, and the file would
   not parse. `node --check` found it, but only at the top of a build, which
   is the delay this whole script exists to remove.
   Scanned rather than pattern-matched, because a star-slash inside a string
   or a regex is not an orphan and flagging one would make the check noisy —
   which it is not allowed to be. */
function orphanCloses(src) {
  const out = [];
  let inBlock = false, inLine = false, quote = '', line = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') { line++; inLine = false; continue; }
    if (inLine) continue;
    if (inBlock) { if (c === '*' && d === '/') { inBlock = false; i++; } continue; }
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && d === '/') { inLine = true; i++; continue; }
    if (c === '/' && d === '*') { inBlock = true; i++; continue; }
    /* a division or a regex can carry a star, but `*` followed by `/`
       outside any comment, string or template is not valid in either */
    /* ONLY AT THE END OF A LINE. A regex literal ending in a star -- the
       repo is full of them, any pattern whose last token is a star -- puts a star
       next to a slash in ordinary code, and flagging those produced nine
       false positives on a clean tree. The real mistake always lands with
       the orphaned close at the END of a prose line, so that is all this
       looks at: narrow, and allowed to miss things, but never noisy. */
    if (c === '*' && d === '/') {
      let j = i + 2;
      while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r')) j++;
      if (j >= src.length || src[j] === '\n') out.push(line);
      i++;
    }
  }
  return out;
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
  for (const ln of orphanCloses(src)) {
    console.error(`${f}:${ln}  a comment was closed that was never opened`);
    console.error(`    ${ln}: ${(lines[ln - 1] || '').trim().slice(0, 60)}`);
    bad++;
  }
}
if (bad) { console.error(`\n${bad} place${bad === 1 ? '' : 's'} to fix.`); process.exit(1); }
console.log(`comments ok  (${files.length} file${files.length === 1 ? '' : 's'})`);
