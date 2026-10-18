# Custom shader examples

Animated canvas backgrounds written as GLSL fragment shaders, Shadertoy style.

## How to install

Settings → **Background** → **Shader**: pick one from **Insert example…**, or
paste a file's content into the editor. The canvas previews it live; **Save
Changes** keeps it.

## Writing a shader

Define `mainImage`; everything below is declared for you (GLSL ES 3.00).

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	fragColor = vec4(fragCoord / iResolution.xy, 0.5, 1.0);
}
```

Shadertoy inputs, same names and types:

| Input                   | Type        |                                                                          |
| ----------------------- | ----------- | ------------------------------------------------------------------------ |
| `iResolution`           | `vec3`      | canvas size in pixels                                                    |
| `iTime`                 | `float`     | seconds since start                                                      |
| `iTimeDelta`            | `float`     | seconds since the last frame                                             |
| `iFrame`                | `int`       | frame counter                                                            |
| `iMouse`                | `vec4`      | Shadertoy convention: `xy` while the button is held, `zw` press position |
| `iDate`                 | `vec4`      | year, month (0–11), day, seconds of the day                              |
| `iChannel0`             | `sampler2D` | the wallpaper image/video from the Background tab (black when none)      |
| `iChannelResolution[0]` | `vec3`      | wallpaper size in pixels (`0` when none)                                 |

Odeko inputs (positions in canvas pixels, origin bottom-left like `fragCoord`):

| Input               | Type    |                                                                                              |
| ------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `odPixelRatio`      | `float` | canvas pixels per CSS pixel — multiply sizes by it                                           |
| `odPointer`         | `vec3`  | pointer position (no click needed), `z` = 0–1 presence                                       |
| `odPointerVelocity` | `vec2`  | pointer velocity in CSS pixels per second                                                    |
| `odHover`           | `vec4`  | hovered icon rect `x, y, w, h` (`w` = 0 when none)                                           |
| `odHoverAmount`     | `float` | 0–1, fades in/out with hovering                                                              |
| `odPulse`           | `vec3`  | last icon click position, `z` = seconds since it                                             |
| `odClicks[8]`       | `vec3`  | last 8 clicks anywhere on the canvas, newest first; `z` = seconds since (`1000` when unused) |
| `odIcons[64]`       | `vec4`  | every icon's rect `x, y, w, h`                                                               |
| `odIconCount`       | `int`   | how many entries of `odIcons` are used                                                       |

Helpers (distance arguments in CSS pixels):

- `odHoverGlow(p, reach)` — 0–1 glow hugging the hovered icon
- `odPointerGlow(p, reach)` — 0–1 glow around the pointer
- `odPulseRing(p, speed, width, life)` — 0–1 ring expanding from the last icon click
- `odHoverDistance(p)` — distance to the hovered icon's edge
- `odIconDistance(p)` — distance to the nearest icon edge (negative inside)
- `odBufferAt(fragCoord)` — the feedback buffer at a pixel (see below)
- `odCoverUv(fragCoord)` — `iChannel0` coordinates that fill the canvas like
  "cover", without stretching

Not supported: `iChannel1`–`3` and Shadertoy's multi-pass buffers (use the
feedback buffer below instead).

## Feedback buffer

Also define `bufferImage` to get a buffer that remembers the previous frame —
for trails, simulations and cellular automata:

```glsl
void bufferImage(out vec4 fragColor, in vec2 fragCoord) {
	// odBufferAt reads the buffer's previous frame.
	fragColor = odBufferAt(fragCoord) * 0.98 + vec4(odPointerGlow(fragCoord, 20.0));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	// Here odBufferAt reads the frame bufferImage just wrote.
	fragColor = vec4(odBufferAt(fragCoord).rgb, 1.0);
}
```

- `bufferImage` runs first every frame and its full RGBA is stored
  (16-bit float where the GPU supports it, so negative values work).
- The buffer starts as all zeros, also after the canvas resizes; write a
  marker into alpha to know whether it has been initialized.
- It updates once per frame (max 60 fps), so simulation speed depends on
  frame rate and Render Quality.

## Generating one with an LLM

Paste this README into the chat and describe the effect. If it doesn't
compile, use **Copy error** under the editor and send the error back.

## Performance

The shader runs for every pixel at up to 60 fps. If it stutters, lower
**Render Quality** in the same panel.
