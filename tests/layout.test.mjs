/* WHERE A CONTROL LIVES IS PART OF WHETHER IT WORKS.

   Five buttons — PAINT, MUTATE, REBUILD, FREEZE and RUN TO TAPE — act on
   S.editPad, the pad selected over in PADS ▸ EDIT. They spent several
   releases on the PROJ tab, which is about saving and exporting and names no
   pad anywhere. So every one of them operated on a sound the person could not
   see, and PAINT was the sharp end of it: it reaches loadIntoTarget with
   noAsk, so pressing it replaced whatever sample was on the selected pad,
   silently, from a page titled "Projects and export".

   Nothing caught that, and nothing would have. The browser suite clicked the
   buttons and read the log, which is a test of the WIRING; the buttons were
   wired perfectly and pointed at an invisible target. tests/mcp-coverage
   already does the equivalent job one layer down — it fails when an MCP tool
   forwards an option no function reads — and this is the same shape of check
   for the layout: a control whose subject is not on screen.

   The rule, declared in the markup rather than listed here, so a control
   carries its own scope and a new one cannot be forgotten:

     data-acts="pad"   this control acts on the SELECTED pad, which may have
                       been selected on a different tab
     data-padname      this element states which pad that is

   and a view holding the first must hold the second. The EDIT panel's own
   sliders are not tagged: they sit beside the pad they edit and their subject
   was never in doubt. What is tagged is the class that caused the bug —
   controls acting on a selection made somewhere else. Today that is the five
   tools and the mixer's two send sliders, and the mixer passes, which is the
   point: the rule is about where a control sits, not about which tab it is.

   The rest of the file checks the two-row navigation holds together: every
   tab belongs to exactly one activity, every activity is reachable, every
   view has a tab and every tab has a view — and that the top row stays at
   five. That last one is a cap, not an observation. The bar this replaced
   grew to twelve one tab at a time, each addition reasonable on its own, and
   the CSS comment that ended up over it read "Ten tabs already crowded a
   phone and an eleventh will not fit at all." */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

/* Views are top-level and each opens its own line, so splitting on that is
   enough structure for these questions — no parser, and nothing to keep in
   step with one. */
function views() {
  const out = [];
  const re = /^<div class="view[^"]*"[^>]*id="v-([a-z]+)"/gm;
  const marks = [];
  let m;
  while ((m = re.exec(html))) marks.push({ name: m[1], at: m.index });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : html.length;
    out.push({ name: marks[i].name, body: html.slice(marks[i].at, end) });
  }
  return out;
}

function tabs() {
  const out = [];
  const bar = html.slice(html.indexOf('<div id="tabs"'), html.indexOf('</div>', html.indexOf('<div id="tabs"')));
  const re = /<button[^>]*data-g="([a-z]+)"[^>]*data-v="([a-z]+)"/g;
  let m;
  while ((m = re.exec(bar))) out.push({ group: m[1], view: m[2] });
  return out;
}

function groups() {
  const bar = html.slice(html.indexOf('<div id="groups"'), html.indexOf('</div>', html.indexOf('<div id="groups"')));
  return [...bar.matchAll(/<button[^>]*data-g="([a-z]+)"/g)].map((m) => m[1]);
}

test('a control that acts on the selected pad sits where the pad is named', () => {
  let tagged = 0;
  for (const v of views()) {
    const acts = [...v.body.matchAll(/<(?:button|input|select)[^>]*data-acts="pad"[^>]*id="([a-zA-Z]+)"/g)]
      .concat([...v.body.matchAll(/<(?:button|input|select)[^>]*id="([a-zA-Z]+)"[^>]*data-acts="pad"/g)])
      .map((m) => m[1]);
    const uniq = [...new Set(acts)];
    tagged += uniq.length;
    if (!uniq.length) continue;
    assert.ok(/data-padname/.test(v.body),
      'v-' + v.name + ' holds ' + uniq.length + ' control(s) that act on the selected pad ('
      + uniq.join(', ') + ') and never says which pad that is. '
      + 'Put a [data-padname] element on the tab, or move the control to a tab that has one.');
  }
  /* A rule nothing is subject to passes for the wrong reason. */
  assert.ok(tagged >= 7, 'only ' + tagged + ' pad-scoped controls found — the tagging has been lost');
});

test('every pad-name element is one the engine actually writes', () => {
  const ids = [...html.matchAll(/id="([a-zA-Z]+)"[^>]*data-padname/g)].map((m) => m[1]);
  assert.deepEqual(ids.sort(), ['epTitle', 'mxPad', 'seqPadName', 'tlPad']);
  const js = readFileSync(new URL('../src/legacy.js', import.meta.url), 'utf8');
  for (const id of ids) {
    assert.ok(js.includes("'" + id + "'"),
      id + ' is marked as naming the selected pad and nothing in the engine writes to it');
  }
});

test('the primary bar stays at five activities', () => {
  const g = groups();
  assert.equal(g.length, 5, 'the activity row is ' + g.length + ' wide: ' + g.join(', '));
  assert.equal(new Set(g).size, 5, 'two activities share a name');
});

test('every tab belongs to exactly one activity, and every activity has a tab', () => {
  const g = groups(), t = tabs();
  assert.equal(t.length, 13, 'expected 13 tabs, found ' + t.length);
  for (const x of t) assert.ok(g.includes(x.group), x.view + ' is in activity "' + x.group + '", which is not in the top row');
  for (const name of g) assert.ok(t.some((x) => x.group === name), 'activity "' + name + '" has no tabs, so it opens nothing');
});

test('every tab has a view and every view has a tab', () => {
  const t = tabs().map((x) => x.view).sort();
  const v = views().map((x) => x.name).sort();
  assert.deepEqual(t, v);
});

test('the engine agrees with the markup about which activity each tab is in', () => {
  const js = readFileSync(new URL('../src/legacy.js', import.meta.url), 'utf8');
  const table = js.slice(js.indexOf('const TABGROUPS=['), js.indexOf(']', js.indexOf("{g:'song'")) + 1);
  for (const { group, view } of tabs()) {
    const row = new RegExp("\\{g:'" + group + "',\\s*tabs:\\[([^\\]]*)\\]").exec(table);
    assert.ok(row, 'TABGROUPS has no row for "' + group + '"');
    assert.ok(row[1].includes("'" + view + "'"),
      view + ' is marked data-g="' + group + '" in the markup but TABGROUPS does not list it there — '
      + 'the CSS would hide the tab and showGroup would never open it');
  }
});
