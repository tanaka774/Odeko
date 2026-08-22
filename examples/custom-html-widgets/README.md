# Custom HTML widget examples

Ready-to-paste examples for the launcher's **Custom HTML** widget. Each `.html`
file contains exactly what goes into the widget's HTML editor — copy the whole
file content.

## How to install

1. Enter edit mode (F2) → **Add Widget** → **Custom HTML**.
2. Right-click the widget → **Open Settings...** → **HTML** tab.
3. Delete the placeholder and paste the whole file content.
4. **Save Changes**.

Optional styling: **Appearance** tab → enable **Custom CSS** → paste a snippet
from the "Custom CSS ideas" section below.

## Ground rules

- Interactive examples are **sandboxed iframes**: they need
  `sandbox="allow-scripts"` and inline `srcdoc` (a remote `src` is dropped).
- The `srcdoc` attribute is double-quoted — use **single quotes** for all
  attributes inside it.
- Attach button handlers with `addEventListener` inside the `<script>` block.
  Inline `onclick` attributes are **not executed** inside the sandbox
  (WebKitGTK quirk).
- Nothing persists inside an iframe — its state resets when the widget
  re-renders or the launcher restarts (a Game of Life pattern survives only
  while the widget stays mounted).
- Network access goes through the launcher's **fetch proxy**: an iframe script
  calls `widgetFetch(url)` (see `weather-ticker.html` and `crypto-ticker.html`),
  which posts a message to the app. The app asks you to **Allow** the host the
  first time and remembers app-wide. Local/private addresses are blocked unless
  you enable "Allow local network" in the widget's **Network** tab.
- The full rules are enforced by the sanitizer in
  `src/lib/widgets/custom-html.ts` (see `sanitization-demo.html` for what gets
  stripped).

## Network fetch

Live-data widgets (weather, crypto, RSS…) fetch through the launcher's proxy,
not `fetch()` directly — the CSP blocks `fetch()` inside the sandbox. Drop this
helper into your `<script>` block and use it like `fetch`:

```html
<script>
var pending = {};
var nextId = 1;
window.addEventListener('message', function (event) {
  var msg = event.data;
  if (!msg || msg.kind !== 'widget-fetch-result') return;
  var entry = pending[msg.id];
  if (!entry) return;
  delete pending[msg.id];
  if (msg.ok) { entry.resolve({ status: msg.status, body: msg.body }); }
  else { entry.reject(new Error(msg.error || 'request failed')); }
});
function widgetFetch(url) {
  return new Promise(function (resolve, reject) {
    var id = nextId++;
    pending[id] = { resolve: resolve, reject: reject };
    parent.postMessage({ kind: 'widget-fetch', id: id, url: url }, '*');
  });
}
</script>
```

Then `await widgetFetch(url)` resolves to `{ status, body }`; `body` is the raw
response text — use `JSON.parse(result.body)` for JSON APIs.

### Rules for network widgets

- **No double quotes inside the `srcdoc`.** The `srcdoc` attribute is
  double-quoted, so any `"` inside it terminates the attribute early and blanks
  the iframe. Use single quotes for HTML attributes, and build dynamic markup
  with `createElement` + `textContent` (never `innerHTML` containing `"`), like
  `crypto-ticker.html`.
- **`&` in URLs is fine** — e.g. `?ids=bitcoin&vs_currencies=usd` survives
  sanitization and reaches the iframe intact.
- **Check `status` and parse in a `try/catch`** — show `status`/`error` on
  failure so a bad host or a rate limit is visible instead of a silent hang.
- **Consent is app-wide.** The first request to a host prompts **Allow/Deny**;
  the choice applies to every widget. Revoke hosts in a widget's **Network**
  tab (the "Allow local network" toggle is there too).
- **Respect the API's rate limit.** Public APIs are often tight — CoinGecko's
  free tier is ~10–30/min, so `crypto-ticker.html` refreshes every 30s. A
  rate-limited API returns e.g. `HTTP 429`, which the widget shows in its
  error line.
- **Plain `toLocaleString` can be unreliable inside the sandbox** — format
  numbers manually (see `crypto-ticker.html`'s `fmtPrice`).

## Examples

| File | What it is | Needs network |
| --- | --- | --- |
| `link-hub.html` | Styled link list; links open in your browser | no |
| `status-board.html` | Rich document: tables, nested lists, quote, code, image, anchors | no |
| `pomodoro.html` | 25/5 minute focus timer with Start/Break/Stop | no |
| `game-of-life.html` | Conway's Game of Life — click cells to toggle them | no |
| `world-clock.html` | Three timezones, ticking every second | no |
| `weather-ticker.html` | Current weather for a city via the Open-Meteo API | yes (prompts for Open-Meteo) |
| `crypto-ticker.html` | BTC/ETH price + 24h change, refreshing every 30s | yes (prompts for CoinGecko) |
| `sanitization-demo.html` | Shows what the sanitizer strips (scripts, handlers, forms, media, unsafe iframes) | no |

## Custom CSS ideas

Each widget's Custom CSS applies only to that one widget. Examples:

```css
/* link-hub */
.custom-widget { background: rgba(15, 18, 28, 0.85); padding: 14px; }
.custom-widget a { color: #8ec5ff; text-decoration: none; }
.custom-widget li { margin: 6px 0; }

/* status-board */
.custom-widget { background: rgba(15, 18, 28, 0.85); padding: 14px; }
.custom-widget table { font-size: 0.85rem; width: 100%; }
.custom-widget img { border-radius: 8px; }
```

Iframes fill the widget (and resize with it); style the frame itself with:

```css
.custom-widget iframe { border-radius: 10px; }
```
