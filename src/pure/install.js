/* Working out how — or whether — this app can be installed.

   The three cases behave completely differently and none of them announce
   themselves:

     Chrome/Edge fire `beforeinstallprompt`, which can be saved and replayed
     later as a real system install dialog.

     iOS Safari never prompts and has no API at all. Installing is Share →
     Add to Home Screen, and if nobody says so, nobody does it — which is why
     most people sent a link are running the app in a tab with a URL bar
     eating the screen and none of the offline behaviour.

     Everything else can usually still install from a browser menu, but the
     wording differs, so the honest thing is to say "look in your browser
     menu" rather than invent a path.

   Kept pure and separate so the parsing can be tested against real user-agent
   strings instead of whatever the test browser happens to be. */

export function detectPlatform(ua = '', vendor = '') {
  const s = String(ua);
  const ios = /iPad|iPhone|iPod/.test(s) || (/Macintosh/.test(s) && /Mobile/.test(s));
  // Chrome, Edge, Brave and Samsung Internet all support the install prompt.
  // On iOS every browser is Safari underneath, so none of them do.
  const chromium = !ios && /Chrome|Chromium|CriOS|Edg|SamsungBrowser/.test(s);
  if (ios) {
    const inApp = /FBAN|FBAV|Instagram|Line\//.test(s);   // no Share menu to reach
    return { id: 'ios', prompts: false, inApp };
  }
  if (/Android/.test(s)) return { id: 'android', prompts: chromium, inApp: /FBAN|FBAV|Instagram/.test(s) };
  if (chromium) return { id: 'desktop-chromium', prompts: true, inApp: false };
  if (/Firefox/.test(s)) return { id: 'firefox', prompts: false, inApp: false };
  if (/Safari/.test(s) || /Apple/.test(String(vendor))) return { id: 'mac-safari', prompts: false, inApp: false };
  return { id: 'other', prompts: false, inApp: false };
}

/* What to tell someone who cannot be given a button. */
export function installSteps(platform) {
  switch (platform.id) {
    case 'ios':
      return platform.inApp
        ? ['Open this page in Safari first — this in-app browser cannot install it.',
           'Tap the ⋯ or Safari icon, then “Open in Safari”.']
        : ['Tap the Share button at the bottom of Safari (the square with an arrow).',
           'Scroll down and tap “Add to Home Screen”.',
           'Tap Add. It then runs full-screen and works with no connection.'];
    case 'mac-safari':
      return ['In Safari’s menu bar choose File → Add to Dock.'];
    case 'firefox':
      return ['Firefox cannot install this. Open the page in Chrome, Edge or Safari to install it.'];
    case 'android':
      return platform.inApp
        ? ['Open this page in Chrome first — this in-app browser cannot install it.']
        : ['Open your browser’s menu (⋮) and choose “Install app” or “Add to Home screen”.'];
    default:
      return ['Look for “Install” or “Add to Home screen” in your browser’s menu.'];
  }
}

/* Already running as an installed app? Then say nothing at all. */
export function isInstalled(win = globalThis) {
  try {
    if (win.navigator && win.navigator.standalone) return true;          // iOS
    return !!(win.matchMedia && win.matchMedia('(display-mode: standalone)').matches
      || win.matchMedia && win.matchMedia('(display-mode: window-controls-overlay)').matches);
  } catch { return false; }
}
