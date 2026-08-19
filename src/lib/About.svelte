<!-- The first Svelte component in the app.

     It is deliberately small and additive: it renders the build string, how
     long the session has been open, and the licensing position — the sort of
     thing an app store listing asks for anyway. Its job here is to prove the
     whole pipeline end to end: that .svelte compiles, mounts into the running
     legacy app, and stays reactive, all inside the single inlined file. -->
<script>
  let { build = '' } = $props();

  let opened = Date.now();
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const uptime = $derived.by(() => {
    const s = Math.max(0, Math.floor((now - opened) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
  });

  /* Read live rather than hard-coded: the rate is whatever the device gave us
     and the depth is whatever MASTER OUT is set to. A claim about the export
     should be the actual state of the export.

     Through the engine's own accessors, not by reaching for its variables.
     `let AC` at the top of a classic script is a global LEXICAL binding, so it
     is reachable by bare name but is not a property of globalThis — reading
     globalThis.AC gets undefined and the line renders a dash forever. Top-level
     function declarations do become properties, so these two resolve. */
  const exportLine = $derived.by(() => {
    void now;                                    // re-read on the same tick as uptime
    try {
      const hz = globalThis.bounceRate?.();
      const bits = globalThis.wavDepth?.() ?? 16;
      if (!hz) return '—';
      const rate = (hz / 1000).toFixed(1) + 'k';
      return bits === 32
        ? `${rate} · 32-bit float — bit-exact, nothing resampled`
        : `${rate} · ${bits}-bit dithered — 32-BIT FLOAT in MASTER OUT is bit-exact`;
    } catch { return '—'; }
  });
</script>

<div class="about" data-svelte="about">
  <div class="line"><span>BUILD</span><b>{build || '—'}</b></div>
  <div class="line"><span>OPEN FOR</span><b>{uptime}</b></div>
  <div class="line"><span>EXPORT</span><b>{exportLine}</b></div>
  <div class="line"><span>AUDIO</span><b>bundled sounds are CC0 — yours to use in anything</b></div>
  <div class="line"><span>PRIVACY</span><b>everything stays on this device; nothing is uploaded</b></div>
</div>

<style>
  .about { font-size: 10px; line-height: 1.5; color: var(--txt-dim); }
  .line { display: flex; gap: 8px; }
  .line span { min-width: 62px; letter-spacing: 1px; flex: none; }
  .line b { color: var(--lcd); font-weight: 400; }
</style>
