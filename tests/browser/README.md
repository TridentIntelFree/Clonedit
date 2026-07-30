# Browser tests

```
npm run test:browser          # all of them
npm run test:browser midi     # just the suites whose filename matches
npm run verify                # build, then all of them
```

They run against the published `index.html`, so build first.

## Why these exist separately from `npm test`

`npm test` covers `src/pure/` — 53 tests over about 330 lines. That is roughly
3% of the code. The other 11,000 lines are one classic script talking to Web
Audio, Web MIDI and IndexedDB, and almost nothing in it can be shown to be
right without a browser running it. Whether a step the grid does not show can
be heard, whether a bounce repeats, whether a project from a future build is
refused — those are only true or false inside a running page.

Before this directory existed, all of that lived in ad-hoc scripts in a temp
directory on one machine, which is the same as not having it.

## What is in here

| suite | guards |
|---|---|
| `midi` | Notes, CCs, program change, velocity curves, channel filtering, chromatic mode, BLE packet parsing, and the 24 PPQN clock **measured** in and out |
| `sequencer` | The 1:1 rule — the sequencer plays and saves exactly what it shows |
| `meters` | LUFS and true peak, against signals with known answers |
| `samplerate` | An import survives a session degraded to 16 kHz |
| `project` | A project from a future build is refused with the session intact |
| `offline` | The instrument works with the network cut, and says that it is offline |

## Writing one

A suite default-exports a function and returns the checker it filled in:

```js
import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('WHAT THIS SECTION IS ABOUT');
    t.ok('a claim, phrased as the thing that must be true', condition, measurement);
    t.near('a number that has a right answer', got, want, tolerance, 'ms');
  } finally {
    await ctx.close();
  }
  return t;
}
```

Two habits worth keeping, both learned by getting them wrong here:

**Carry the measurement.** Every check takes a detail string, and a failure
should read as evidence rather than "expected true, got false". `t.near` does
this for you.

**Validate the instrument before trusting it on the subject.** The meters suite
checks its true-peak meter against a sine whose answer is known by construction
before it points that meter at any music. Three earlier implementations of that
meter were self-consistent and wrong.

And one thing to be careful of: several checks in here compare rendered audio.
Chrome's summing order for more than about five concurrent sources is not
repeatable, so an unchanged render differs from itself by around −73 dB — but
roughly one run in eight comes back bit-identical. A threshold expressed
relative to a single control sample will fail intermittently for reasons that
have nothing to do with what is being tested. Take the worst of several.
