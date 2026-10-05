# Custom CSS widget themes

Ready-to-paste **Custom CSS** themes for every widget type, plus one for canvas
icons. Each `.css` file is a complete, self-contained theme — copy the whole
file into one item's Custom CSS field.

Every theme here is deliberately loud: strong colors, textures and typography,
so it is obvious at a glance that the look came from custom CSS and not from
the built-in appearance controls.

## How to install

1. Enter edit mode (F2) → right-click the item → **Open Settings…**.
2. Open the **Appearance** tab and turn on **Enable Custom CSS**
   ("Override the look with my own CSS").
3. Expand **Advanced: Custom CSS**, delete the placeholder text, and paste the
   whole content of the file.
4. Press **Save Changes**.

The CSS applies to **that one item only**. To reuse a theme, paste it into
another item (or duplicate the item first).

## What each file is

| File            | Item           | Theme                                                                       |
| --------------- | -------------- | --------------------------------------------------------------------------- |
| `clock.css`     | Clock          | Synthwave Neon — violet gradient, hot-pink border, glowing cyan digits      |
| `system.css`    | System monitor | CRT Phosphor — scanlines, green monospace readouts, glowing bars            |
| `weather.css`   | Weather        | Aurora Glass — deep-sky glass panel, gradient temperature, chip forecast    |
| `terminal.css`  | Terminal       | Amber Phosphor Frame — amber bezel and glow around the terminal             |
| `tasklist.css`  | Task list      | Sticky Pastel — card-style tasks, pill tabs, struck-through completed items |
| `music.css`     | Music player   | Vinyl Lounge — plum gradient, circular glowing album art, gradient progress |
| `textbox.css`   | Text box       | Typewriter Paper — cream ruled paper with serif ink                         |
| `memo.css`      | Memo           | Kraft Sticky Note — yellow note with a folded-corner accent                 |
| `drawing.css`   | Drawing        | Blueprint — navy canvas with a grid, floating toolbar                       |
| `slideshow.css` | Slideshow      | Cinema — black stage, rounded photo, glassy round nav buttons               |
| `sleep.css`     | Sleep          | Moonlight — night gradient, soft glow and a gentle pulse                    |
| `restart.css`   | Restart        | Sunrise Amber — warm gradient, glowing icon that turns on hover             |
| `shutdown.css`  | Shutdown       | Red Alert — charcoal panel with a pulsing red glow                          |
| `clipboard.css` | Clipboard      | Frosted Glass — translucent panel, card entries, accent badge               |
| `custom.css`    | Custom HTML    | Poster — bold frame plus typography for the HTML inside                     |
| `icon.css`      | Canvas icon    | Glossy Tile — vivid gradient tile, inner highlight, uppercase label         |

## How the CSS is scoped

The app injects your CSS into a `<style>` element that is appended after its
own stylesheet, and prefixes every selector with `[data-item-id="…"]`:

```css
/* you write */
.time-display {
	color: cyan;
}
/* the app injects */
[data-item-id='abc123'] .time-display {
	color: cyan;
}
```

That has a few consequences worth knowing:

- **Write flat selectors.** CSS nesting (`&`) is not rewritten, so keep rules
  at the top level. Comma-separated selector lists are prefixed one by one.
- **`@media`, `@supports`, `@container` and `@layer`** blocks are scoped
  recursively, so responsive tweaks work.
- **`@keyframes` and `@font-face` are passed through unchanged.** Keyframe
  names are global, so two widgets using the same name collide — the themes
  here prefix theirs with `odeko-`.
- **`!important` is not needed** to override the built-in look: the injected
  stylesheet comes last, so an equally specific rule wins.

## Overriding the appearance variables

The eight `--appearance-*` variables are written as **inline styles** on the
item root, and inline styles outrank stylesheet rules. So a rule that redefines
one of them on the root element needs `!important`:

```css
/* ineffective — the inline value wins */
.clock-widget {
	--appearance-background: #123;
}

/* works, but prefer overriding the concrete property instead */
.clock-widget {
	background: #123;
}
```

Overriding the concrete properties the variables feed needs no `!important`,
and that is what these themes do:

| Variable                     | Feeds                                     |
| ---------------------------- | ----------------------------------------- |
| `--appearance-background`    | `background` on the item root             |
| `--appearance-border`        | `border` on the item root                 |
| `--appearance-text-color`    | `color`                                   |
| `--appearance-font-family`   | `font-family`                             |
| `--appearance-font-size`     | `font-size` (widget text uses `em` units) |
| `--appearance-border-radius` | `border-radius`                           |
| `--appearance-padding`       | `padding`                                 |
| `--appearance-opacity`       | `opacity`                                 |

## Which classes can I use?

Open **Appearance → Enable Custom CSS → Advanced: Custom CSS → What can I
style?** — it lists the curated classes for the selected item, and the shared
variables above. That list comes from
[`src/lib/widgets/custom-css.ts`](../../src/lib/widgets/custom-css.ts), which is
the source of truth; the themes in this folder only use those classes (a test
keeps the two in sync).

## Recipes

Small tweaks that mix well with any theme:

```css
/* Recolor a theme without rewriting it */
.clock-widget {
	background: linear-gradient(160deg, #06321f, #04150d);
}

/* Blur the panel behind a translucent theme */
.clipboard-widget {
	backdrop-filter: blur(14px) saturate(1.4);
}

/* Lift the whole tile on hover */
.app-icon:hover {
	transform: translateY(-2px);
	box-shadow: 0 14px 28px rgba(0, 0, 0, 0.5);
}

/* Hide a widget's chrome while keeping the content */
.textbox-widget {
	border: none;
	background: transparent;
}
```

## Troubleshooting

| Symptom                                             | Likely cause                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing changed                                     | "Enable Custom CSS" is off, or the modal was closed without **Save Changes**                                                          |
| One rule is ignored                                 | Class name typo — check the "What can I style?" list                                                                                  |
| Recoloring `--appearance-*` did nothing             | The variable is set inline; override the concrete property or add `!important`                                                        |
| Terminal text keeps its colors                      | xterm.js paints on a canvas — use the terminal theme settings for text                                                                |
| Custom HTML body is unstyled                        | Only the widget chrome and elements under `.html-content` are reachable; content inside an embedded `<iframe>` is a separate document |
| Can't restyle the edit-mode outline or context menu | Edit-mode chrome (`.draggable-widget`, `.context-menu*`, `.floating-toolbar`) is not part of the public class API                     |
| Music progress bar / play button keeps its color    | Those elements carry inline theme-color styles; the `music.css` theme re-tints them with `filter` instead of `background`             |
| Terminal background stays grey while loading        | The loading overlay's background is inline; only its border and text are stylable                                                     |
