import {
	SHARED_APPEARANCE_VARIABLES,
	WIDGET_CSS_API,
	type CssApiItemType
} from '$lib/widgets/custom-css';
import { WIDGET_REGISTRY } from '$lib/widgets/types';
import exampleFiles from 'virtual:odeko-examples';

const cssReadme = exampleFiles['custom-css/README.md'] ?? '';
const shaderReadme = exampleFiles['custom-shaders/README.md'] ?? '';
const htmlWidgetReadme = exampleFiles['custom-html-widgets/README.md'] ?? '';
const htmlBackgroundReadme = exampleFiles['custom-html-backgrounds/README.md'] ?? '';

const EXAMPLES: Record<string, string> = Object.fromEntries(
	Object.entries(exampleFiles).filter(([file]) => !file.endsWith('.md'))
);

export const DOC_TOPICS = [
	'css',
	'shader',
	'html-widget',
	'html-background',
	'settings',
	'widgets'
] as const;
export type DocTopic = (typeof DOC_TOPICS)[number];

const SETTINGS_DOC = `# Canvas settings (/settings)

- width_percent, height_percent: canvas panel size, 10-100 (% of screen)
- position_x, position_y: panel center, 0-100 (% of screen)
- border_radius: panel corner radius in px
- backdrop_darkness: 0-1, how dark the backdrop behind the panel is
- backdrop_blur: native blur behind the window; blur_strength "light" (panel only) | "full" (whole screen)
- open_animation, close_animation: "none" | "fade" | "zoom" | "slide"; slide_edge "top" | "bottom" | "left" | "right"
- animation_duration_ms; tile_cascade: tiles sweep in one after another
- magnetic_snap, grid_size (px); grid_line_color is "R, G, B" (no hex, no rgb())
- keybind_*: { key, ctrl, alt, shift, meta }. Only change when asked.
- default_appearance: appearance template stamped onto NEW icons/widgets only (does not restyle existing ones; custom CSS is stripped here)
- modal_appearance: look of settings dialogs. { global?: {...}, modals?: { "<modal key>": {...} } }
  fields: overlayColor, overlayOpacity, overlayBlur, surfaceColor, surfaceOpacity, surfaceBlur, borderColor, borderWidth, radius,
  shadowColor, shadowStrength (0-1), width, height, accentColor, accentTextColor, headerBackground, titleColor, titleSize,
  dividerColor, footerBackground, textColor, mutedColor, fontSize, fontFamily, inputBackground, inputBorderColor, controlRadius,
  customCssEnabled, customCss
  modal keys: app-settings, icon, widget-picker, app-picker, and every widget type

## background_layers (array, bottom first)
Common: { id, name, type, enabled, opacity 0-1, blend (CSS mix-blend-mode), placement "below" | "above" (above draws over icons and never takes input) }
- color: { color "R, G, B", color2 "R, G, B" | null (null = solid, else linear gradient), angle 0-360 }
- media: { src (http(s) URL or file path), fit "cover" | "contain" | "stretch", position "center" | "top left" ..., repeat }
- shader: { source (GLSL, see the shader topic), file null, watch false, texture null | image URL, quality 0.25-1, fps 0 | 15 | 30 | 60 }
- html: { source (full HTML page, see html-background), file null, watch false, scripts true, interactive true }
New layers need a unique id like "layer-ai-1". Set file to null when you write source yourself.

# Icons (/icons/<id>)
{ name, path, icon_type "app" | "image" | "widget", widget_type, widget_config, x, y, width, height, z, icon_path, url, args,
  show_name, custom_name, keybind, keybind_global, appearance }
- x, y: top-left in px inside the canvas panel; z: stacking order (higher on top)
- app/image icons keep their appearance in /icons/<id>/appearance
- widgets keep theirs in /icons/<id>/widget_config/appearance

# Appearance object
{ backgroundColor, backgroundOpacity 0-1, textColor, fontSize px, fontFamily, borderColor, borderWidth px,
  borderStyle "solid" | "dashed" | "dotted" | "double" | "none", borderRadius px, padding px, opacity 0-1,
  gradientColor (second fill color, "" = solid), gradientAngle deg,
  shadowBlur px (0 = no shadow), shadowOffsetY px, shadowColor, shadowOpacity 0-1,
  backdropBlur px (frosted glass), hoverEffect "none" | "lift" | "grow",
  customCssEnabled, customCss }
customCssEnabled true makes the item ignore the built-in controls in favor of customCss. Read the css topic first.
`;

function widgetsDoc(): string {
	const rows = WIDGET_REGISTRY.map(
		(meta) =>
			`- ${meta.type}: ${meta.description} (default ${meta.defaultWidth}x${meta.defaultHeight})`
	).join('\n');
	return `# Widget types\n${rows}

Adding a widget: add /icons/widget-ai-<something> with icon_type "widget", widget_type, x, y (width/height/widget_config default when left out).
Custom HTML widget content lives in widget_config.content (see the html-widget topic).
Widget-specific widget_config fields (besides appearance) are best learned by reading an existing widget with get_config.`;
}

function cssDoc(): string {
	const api = (Object.keys(WIDGET_CSS_API) as CssApiItemType[])
		.map((type) => {
			const entry = WIDGET_CSS_API[type];
			return `## ${type}\nclasses: ${entry.classes.join(' ')}${entry.states ? `\nstates on the root: ${entry.states.join(' ')}` : ''}${entry.note ? `\nnote: ${entry.note}` : ''}`;
		})
		.join('\n\n');
	return `${cssReadme}\n\n# Stable class names per item type\nShared variables: ${SHARED_APPEARANCE_VARIABLES.join(', ')}\n\n${api}\n\nFull themes: read examples like "custom-css/clock.css" with get_docs.`;
}

export function getDocs(topic: string): string {
	if (topic in EXAMPLES) return EXAMPLES[topic];
	switch (topic as DocTopic) {
		case 'css':
			return cssDoc();
		case 'shader':
			return shaderReadme;
		case 'html-widget':
			return htmlWidgetReadme;
		case 'html-background':
			return htmlBackgroundReadme;
		case 'settings':
			return SETTINGS_DOC;
		case 'widgets':
			return widgetsDoc();
	}
	throw new Error(
		`Unknown topic "${topic}". Topics: ${DOC_TOPICS.join(', ')}, or an example file: ${exampleNames().join(', ')}`
	);
}

export function exampleNames(): string[] {
	return Object.keys(EXAMPLES).sort();
}
