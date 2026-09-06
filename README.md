Another desktop layer with full customization.

## What is this

This app is like a floating canvas where you can place icons or widgets on it.
When launched, it appears on top of your desktop.
You can set a custom image, URL link, or app launching path on an icon. Widgets are the ones prepared to expect usual daily usage.
You can use this app as a canvas on the desktop to put or customize everything you need. And with one shortcut key, you can open it anytime.

<sample image or video>

## Motivation

- Usual background widget or icon system isn't for me, because I always open every app I use and they hide most of the background. It's not a good feeling when my favorite customization is being overridden by ADHD-opened browser, terminal, editor or anything else.
- It seems to me the current desktop customization situation is too OS (distro)-dependent. I think cross-platform solution should exist.
- I miss Windows Live Tiles that was a customizable start menu! I heard everyone misses it, right?

## Features

### View Mode and Edit Mode

View Mode is the default state you can interact with things you put. You can enter Edit Mode from the right-click menu or a configured keybind.
You are supposed to change any state of the app in Edit Mode.

### Icon Types

- image icon: you can add one from "Add Image/Link", and set an image or GIF as the thumbnail. Online URLs are supported. Set a URL, and clicking the tile opens it in the browser.
- app icon: you can add one from "Add App" which shows installed apps on your system. You can set an image for the thumbnail here too.
- widget: you can add one from "Add Widget", and choose from the prepared ones. You can apply custom CSS to them. And if you need more, check the custom HTML.

### Keybind

- app-level: toggle the app, enter edit mode...
- icon-level: trigger clicking event

### Grid & Snapping

- In edit mode, you can snap an icon onto a grid line to organize its position. You can turn grid-snapping on/off in settings.

### Presets

- You can save the layout as a preset, and import or export it as a JSON file.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```


## TODO

- [ ] autostart
- [ ] browser widget
- [ ] smooth preset change
- [ ] improve custom html
- [ ] Multi-monitor placement
- [ ] ai chat widget
- [ ] unaji mode (background mode)
- [ ] customization for settings modal
- [ ] tray or taskbar
- [ ] improve bulk style applying to icons
- [ ] more fancy effects

## Notes

This project is originally forked from [alysonhower/tauri2-svelte5-shadcn](https://github.com/alysonhower/tauri2-svelte5-shadcn). This is a pretty nice project, you should check this out!

## License

This project is licensed under the MIT License - see the LICENSE file for details.
