<!-- Getting the app onto a home screen.

     Most people sent a link run it in a browser tab: URL bar eating the screen,
     no offline guarantee, gone when the tab is. Chrome will hand us a real
     install dialog; iOS Safari will not prompt and has no API, so the only
     honest thing is to say where the button is.

     Two shapes, one component. `banner` is a one-time nudge that appears on a
     later visit so it does not collide with the first-run tour. `panel` is the
     permanent copy in the PROJ tab, so dismissing the nudge never makes
     installing undiscoverable. -->
<script>
  import { detectPlatform, installSteps, isInstalled } from '../pure/install.js';

  let { mode = 'panel' } = $props();

  const DISMISS = 'jbh_install_dismissed';
  const platform = detectPlatform(navigator.userAgent, navigator.vendor);
  const steps = installSteps(platform);

  let installed = $state(isInstalled());
  let canPrompt = $state(!!globalThis.__jbhInstall);
  let dismissed = $state(read(DISMISS));
  let expanded = $state(mode === 'panel');
  let busy = $state(false);
  let outcome = $state('');
  let accepted = $state(false);   // once they have said yes, stop offering the how-to

  function read(k) { try { return !!localStorage.getItem(k); } catch { return false; } }
  function write(k) { try { localStorage.setItem(k, '1'); } catch {} }

  $effect(() => {
    const gained = () => (canPrompt = true);
    const done = () => { installed = true; canPrompt = false; };
    addEventListener('jbh-installable', gained);
    addEventListener('jbh-installed', done);
    return () => { removeEventListener('jbh-installable', gained); removeEventListener('jbh-installed', done); };
  });

  async function install() {
    const ev = globalThis.__jbhInstall;
    if (!ev) { expanded = true; return; }
    busy = true;
    try {
      ev.prompt();
      const { outcome: o } = await ev.userChoice;
      accepted = o === 'accepted';
      outcome = accepted ? 'Installing… look for JBH-88 on your home screen.' : 'Maybe later, then.';
      if (accepted) { globalThis.__jbhInstall = null; canPrompt = false; }
    } catch (e) {
      outcome = 'That did not open — use your browser menu instead.';
      expanded = true;
    }
    busy = false;
  }

  function dismiss() { dismissed = true; write(DISMISS); }

  // the banner stays out of the way: nothing if installed, dismissed, or if the
  // first-run tour has not been dealt with yet
  const showBanner = $derived(mode === 'banner' && !installed && !dismissed && read('jbh_tour_v1'));
</script>

{#if mode === 'panel'}
  <div class="ip" data-svelte="install-panel">
    {#if installed}
      <div class="ok">✓ Installed — this is running as an app, offline and full-screen.</div>
    {:else}
      <div class="lead">Install it to your home screen: full-screen, and it keeps working with no connection.</div>
      {#if canPrompt}
        <button class="on" onclick={install} disabled={busy}>INSTALL THIS APP</button>
      {/if}
      <ol>{#each steps as s}<li>{s}</li>{/each}</ol>
      {#if outcome}<div class="out">{outcome}</div>{/if}
    {/if}
  </div>
{:else if showBanner}
  <div class="bar" data-svelte="install-banner">
    <div class="txt">
      <b>Add JBH-88 to your home screen</b> — full-screen, and it works offline.
      {#if expanded}<ol>{#each steps as s}<li>{s}</li>{/each}</ol>{/if}
      {#if outcome}<div class="out">{outcome}</div>{/if}
    </div>
    {#if accepted}
      <!-- they said yes; the appinstalled event will remove this entirely -->
    {:else if canPrompt}
      <button class="on" onclick={install} disabled={busy}>INSTALL</button>
    {:else}
      <button onclick={() => (expanded = !expanded)}>{expanded ? 'HIDE' : 'HOW'}</button>
    {/if}
    <button class="x" onclick={dismiss} aria-label="Dismiss the install prompt">&#215;</button>
  </div>
{/if}

<style>
  .bar { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px;
    background: var(--panel2); border-bottom: 1px solid var(--sel); font-size: 11px; }
  .bar .txt { flex: 1; line-height: 1.45; color: var(--txt); }
  .bar b { color: var(--sel); }
  .bar .x { padding: 4px 8px; }
  .ip { font-size: 11px; line-height: 1.5; color: var(--txt-dim); }
  .lead { margin-bottom: 6px; }
  .ok { color: var(--green); }
  ol { margin: 6px 0 0; padding-left: 18px; }
  li { margin: 2px 0; }
  .out { color: var(--lcd); margin-top: 4px; }
  button { margin-top: 4px; }
</style>
