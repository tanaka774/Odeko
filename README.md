Another customizable layer on top of your desktop.

## What is this

This app is like a floating launcher where you can put on icons or widgets. You can set free image, jump url link or app launching path on a icon. Widgets are the ones prepared to expect usual daily usage.
You can use this app as canvas on desktop to put or customize everything you need. And with one shortcut key you open anytime.


<sample image or video>

## Motivation

- Usual background widget or icon system isn't for me, because I always open every app I use and they hide most of the background. It's not good feeing when my favorite customization being overridden by ADHD-opened browser, terminal, editor or anything.
- It seems to me current desktop customization situation is too os-dependant. I think cross-platform solution should exist.
- I miss windows live tile! I heard everyone miss that, right?

## Features

### View Mode and Edit Mode

View Mode is default state you can interact with things you put. You can enter Edit Mode from right-click menu or specified keybind.
You are supposed to change any state of the app in edit mode.

### Icon Types

- image icon: you can add from "Add Image/Link", and set image or gif as thumbnail. Online Url is possible to use.
- app icon: you can add from "Add App" which shows installed apps on your system. You can set image for thumbnail here too.
- widget: you can add from "Add Widget", and choose from prepared ones. You can apply custom css to them. And if you need more check custom html.

### Keybind

- app-level: toggle app, enter edit mode...
- icon-level: trigger clicking event

### Grid & Snapping

- In edit mode, you can snap an icon into grid line to organize its position. You can turn on/off grid-snapping on settings.

### Presets

- You can save the layout as preset, and import or export as json file.

## TODO

- [ ] autostart
- [ ] browser widget
- [ ] smooth preset change
- [ ] improve custom html
- [ ] Multi-monitor placement
- [ ] ai chat widget
- [ ] unaji mode(background mode)
- [ ] custom css for settings modal or icon thumbnail too?
























# Odeko

A customizable desktop layer that stays on top of everything, built with Tauri (Rust + Web).

## Overview

Odeko is a frameless, transparent overlay that acts as a secondary shell over your OS. It provides quick access to applications, files, and widgets through a beautiful, customizable interface, on Linux, macOS, and Windows.

## Architecture

```
┌─────────────────────────────────────────┐
│      Frontend (Svelte 5 + Runes)        │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │  Icons  │ │ Widgets │ │  Layout  │  │
│  └─────────┘ └─────────┘ └──────────┘  │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│           Tauri Bridge                  │
│    (Commands + Event System)            │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│         Rust Backend                    │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │Process  │ │ Config  │ │  Window  │  │
│  │Commands │ │  (JSON) │ │  Manager │  │
│  └─────────┘ └─────────┘ └──────────┘  │
└─────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: Svelte 5 (Runes) + TypeScript
- **Backend**: Rust
- **Framework**: Tauri

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Icon Types

All items on the grid use a shared `AppIconData` model with an `icon_type` field. The three main types are:

### App Launcher (`'app'`)

- Scans installed system apps via `.desktop` files (Linux) or `/Applications` (macOS).
- Clicking launches the app as a native process (via `src/lib/launch.ts` → `invoke('launch_app')`).
- Can customize the icon image, CLI arguments, and assign a per-icon keybind.
- Rendered by `AppIcon.svelte`.

### Image / Link (`'image'` and `'link'`)

- Displays a custom image (local file or URL) as the icon.
- Optionally opens a URL in the browser on click.
- `'image'` has a transparent background and hides the name label by default; `'link'` has a distinct background and always shows the name.
- Uses `src/lib/icon-image.ts` to load images into data URLs (cached in-memory).
- Also rendered by `AppIcon.svelte`.

### Widgets (`'widget'`)

- Interactive mini-apps: clock, system monitor, weather, terminal, task list, music, text box, memo, drawing, slideshow, sleep/restart/shutdown.
- Wrapped by `DraggableWidget.svelte` (drag/resize/context-menu); dispatched by `WidgetContainer.svelte`.
- All widget type definitions and defaults live in `src/lib/widgets/types.ts` (13 types, shared `WidgetAppearanceConfig`).
- Power widgets (sleep/restart/shutdown) can have global keybinds that work even when the launcher is hidden.

All icon data is stored as JSON in `~/.config/odeko/presets/`.

## Custom HTML & Custom CSS

Every widget has a **Custom CSS** editor (Appearance tab) whose CSS is scoped to
that one widget. The stable, stylable class names are listed in the editor's
hint text (see also `src/lib/widgets/custom-css.ts`).

The **Custom HTML** widget renders sanitized user HTML — scripts, event handlers,
inline `<style>`, and forms are removed. Interactive content runs in sandboxed
`srcdoc` iframes, and live-data widgets fetch through an allowlisted Rust proxy
via a `widgetFetch()` helper. Ready-to-paste examples are in
[`examples/custom-html-widgets/`](examples/custom-html-widgets/).

---

## Edit Mode vs View Mode

The launcher has two modes:

### View Mode

Default state. Click an app/link/image to launch it. Widgets are interactive — typing in a memo or checking tasks auto-saves immediately.

### Edit Mode

Enter via F2 or right-click context menu. Icons get dashed borders and resize handles. You can drag, resize, multi-select, delete, add new items, and undo (Ctrl+Z). Changes are staged in memory — only written to disk on **Save & Exit**; reverted on **Cancel**.

---

## Keybind System

### Global launcher shortcuts

Three app-level keybinds are registered with the OS via Tauri's global shortcut API (Rust side: `update_global_shortcut` in `src-tauri/src/lib.rs`):

- **Toggle launcher** (default: `Win+Alt+Z`) — shows/hides the overlay.
- **Toggle edit mode** (default: `F2`) — enters/exits edit mode.
- **Hide launcher** (default: `Escape`) — hides the overlay.

### Per-icon keybinds

Each icon/widget can have a custom keybind. Two modes:

- **Local** — works only when the launcher is visible. Handled in `App.svelte`'s `handleKeydown` by iterating icons and matching `KeybindConfig` fields (`key`, `ctrl`, `alt`, `shift`, `meta`).
- **Global** (`keybind_global: true`) — registered with the OS via `update_icon_shortcuts`. Works even when the launcher is hidden. Power widgets (sleep/restart/shutdown) emit a `power-widget-shortcut` event to show a confirmation dialog; other icons launch directly.

Keybind conflicts are checked live via `findKeybindConflict()` in `settings.svelte.ts`. The `KeybindRecorder` component captures a single keypress to record a shortcut.

---

## Preset System

Layouts are saved as named presets under `~/.config/odeko/`:

```
~/.config/odeko/
├── config.json           # { "active_preset": "Default" }
└── presets/
    └── Default.json       # { icons: [...], settings: {...} }
```

Available presets are managed in the **Settings → Presets** tab:

- Switch active preset, rename, delete, export to a file, or import from a file.
- Save current layout as a new preset.

All preset CRUD is handled by Rust commands in `src-tauri/src/commands/launcher.rs` (load, save, rename, delete, export, import, set active).

---

## Grid & Snapping

Icons are positioned absolutely in a pixel-space grid inside the launcher. Two settings control it:

- **Grid size** — the spacing used for visual grid lines (visible in edit mode) and snap positions.
- **Magnetic snap** (default: on) — during drag or resize, edges snap to the nearest grid line.

Snapping works by rounding an edge to `round(position / gridSize) * gridSize`. Both top-left and bottom-right edges are considered — the closer target wins. Group-drag uses the selection's bounding box edges. Drag uses Pointer Events with capture (not mouse events) for reliable tracking.

---

## Save / Cancel Behavior

### Two independent persistence layers

Global launcher settings and per-icon layout changes have **separate ownership** so the
"Save" and "Cancel" buttons always do what you expect.

### Global settings (Settings modal)

The **Settings** button on the edit toolbar opens the global settings modal. All fields
here — background, size, position, grid, keybinds, icon defaults — are persisted
**immediately on the modal's own Save button**. Cancel in the modal only discards what
you changed since opening it.

Edit-mode **Cancel will never revert global settings**: once you press Save in the
settings modal, those changes are final.

### Icon layout and per-item settings

Adding, moving, resizing, deleting icons, and changes made through each icon's own
**Settings** (right-click an icon → Open Settings) all belong to the **edit session**
— they are staged in memory and only reach disk when you:

- **Save & Exit** — writes everything to disk.
- **Cancel** — reverts all unstaged icon changes.

### Widget content

In view mode (outside edit mode), typing in a memo widget, drawing, or checking tasks
auto-saves immediately — there is no Cancel scope.

In edit mode, widget config changes are staged like any other icon change and follow
edit-mode Save & Exit / Cancel.

### Summary table

| Change type                                    | Saved via                | When does it reach disk? | Edit-mode Cancel reverts it? |
| ---------------------------------------------- | ------------------------ | ------------------------ | ---------------------------- |
| Background, size, position, grid, app keybinds | Settings modal Save      | Immediately              | No                           |
| Icon add/move/resize/delete                    | In-memory (staged)       | Edit-mode Save & Exit    | Yes                          |
| Icon name, image, font, keybind, URL           | Icon's own Settings Save | Edit-mode Save & Exit    | Yes                          |
| Widget content (view mode)                     | Automatic                | Immediately              | N/A (no session)             |
| Widget content (edit mode)                     | In-memory (staged)       | Edit-mode Save & Exit    | Yes                          |
