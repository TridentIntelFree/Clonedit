# Verify MVX-880 (index.html)

Single-file Web Audio app; no build. Surface is a browser GUI.

## Launch

```bash
cd "$SCRATCHPAD" && npm i playwright-core   # once
node driver.js                              # see recipe below
```

Driver essentials:
- `chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] })`
- Open `file:///home/user/Clonedit/index.html`, viewport ~430×900 (it's a phone UI).
- Click `#logo` first — it runs `ensureAudio()` and plays a test tone; `#lcdmsg` is the app's status line and the best assertion target (collect `pageerror` too; `window.onerror` also mirrors errors to the LCD).

## Flows worth driving

- Presets: SMPL tab → `#presetSel`/`#presetNote` → `#btnPresetLoad`; wait for `LOADED` in `#lcdmsg`, then check `S.buffers[S.pads[S.editPad].bufId]` peak > 0 in `page.evaluate`.
- Session restore: mutate `S`, `await idbPut('last', snapshotSession())`, `page.reload()`, click `#btnRestore`, compare `S` fields and live `AudioParam.value`s.
- Sequencer: `#btnPlay`, check `playing` and `AC.currentTime` advances.

## Gotchas

- App state is all in the global `S`; audio graph in `AC`/`LIVE`. Everything is reachable from `page.evaluate`.
- Live param changes go through `setTargetAtTime` — read `param.value` a few hundred ms after a change.
- File pickers (`#fileIn`, `#jsonIn`) need `page.setInputFiles`; decode requires AC, so click `#logo` first.

## PWA / service worker

SW only registers over http(s). Serve with `python3 -m http.server 8899` from the
repo root and drive `http://localhost:8899/index.html`. Test offline with
Playwright `context.setOffline(true)` + reload. TRAX flows: `armTrack(i)` then
`#btnPlay` rolls and records, `#btnStop` commits the take to `S.trax[i]`.
