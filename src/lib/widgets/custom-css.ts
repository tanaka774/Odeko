import type { WidgetType } from './types';

/** Grid items that expose a curated custom CSS class list. */
export type CssApiItemType = WidgetType | 'icon';

/**
 * The eight shared appearance knobs, set on the root of every grid item
 * (widgets and icons) as CSS custom properties. They are the stable part of
 * the public "custom CSS" API.
 *
 * The app writes them as *inline* styles on the root element, so a user rule
 * that redefines one of these variables on that same element needs
 * `!important` — inline styles outrank stylesheet rules. Overriding the
 * concrete properties they feed (`background`, `border`, `color`, `padding`,
 * …) works with a plain scoped selector, because the injected stylesheet is
 * appended after the app's own CSS.
 */
export const SHARED_APPEARANCE_VARIABLES = [
	'--appearance-background',
	'--appearance-border',
	'--appearance-text-color',
	'--appearance-font-family',
	'--appearance-font-size',
	'--appearance-border-radius',
	'--appearance-padding',
	'--appearance-opacity'
] as const;

/**
 * Curated per-widget CSS API: the stable class names a user can target.
 * Anything not listed here is not guaranteed to keep working across versions.
 * The settings modal renders this so users never have to guess, and the
 * ready-to-paste themes in `examples/custom-css/` only use these classes
 * (a drift test keeps markup, API and examples in sync).
 */
export const WIDGET_CSS_API: Record<
	CssApiItemType,
	{ classes: string[]; example: string; note?: string }
> = {
	clock: {
		classes: [
			'.clock-widget',
			'.analog-clock',
			'.clock-svg',
			'.clock-face',
			'.clock-ring',
			'.tick',
			'.major-tick',
			'.clock-number',
			'.hour-hand',
			'.minute-hand',
			'.second-hand',
			'.center-dot',
			'.time-display',
			'.date-display'
		],
		example:
			'.clock-widget { background: linear-gradient(160deg, #1b1035, #0b0718); border: 1px solid #ff2fb9; }\n.time-display { color: #4df3ff; text-shadow: 0 0 14px rgba(77, 243, 255, 0.8); }'
	},
	system: {
		classes: [
			'.system-widget',
			'.stats-container',
			'.stat-row',
			'.stat-label',
			'.stat-value',
			'.progress-bar',
			'.progress-fill'
		],
		example:
			'.system-widget { background: #04090a; border: 1px solid #1f6f4a; }\n.stat-value { color: #35ff9b; font-family: "Courier New", monospace; }'
	},
	weather: {
		classes: [
			'.weather-widget',
			'.current-summary',
			'.weather-primary',
			'.temperature',
			'.location',
			'.weather-condition',
			'.condition-icon',
			'.condition',
			'.forecast-list',
			'.forecast-item',
			'.forecast-time',
			'.forecast-temp',
			'.state-view',
			'.spin',
			'.error'
		],
		example:
			'.weather-widget { background: linear-gradient(180deg, rgba(56, 189, 248, 0.28), rgba(15, 23, 42, 0.92)); border: 1px solid rgba(148, 233, 255, 0.35); }\n.temperature { color: #7dd3fc; text-shadow: 0 0 18px rgba(125, 211, 252, 0.55); }'
	},
	terminal: {
		classes: ['.terminal-widget', '.terminal-container', '.loading-overlay', '.loading-text'],
		example:
			'.terminal-widget { background: #120c02; border: 1px solid #ff9f1c; box-shadow: 0 0 22px rgba(255, 159, 28, 0.35); }\n.loading-text { color: #ffb347; letter-spacing: 0.2em; text-transform: uppercase; }',
		note: 'Terminal text colors are drawn on a canvas by xterm.js and cannot be changed with CSS — use the terminal theme settings instead.'
	},
	tasklist: {
		classes: [
			'.tasklist-widget',
			'.tab-bar-container',
			'.tab-bar',
			'.task-tab',
			'.tab-name',
			'.tab-scroll-btn',
			'.add-tab-btn',
			'.task-input-container',
			'.task-input',
			'.task-list',
			'.task-section',
			'.completed-section',
			'.task-item',
			'.task-checkbox',
			'.task-checkbox-label',
			'.checkbox-custom',
			'.task-text',
			'.delete-btn',
			'.active',
			'.completed'
		],
		example:
			'.tasklist-widget { background: linear-gradient(180deg, #1e1b4b, #312e81); }\n.task-item { background: rgba(255, 255, 255, 0.07); border-radius: 10px; }\n.task-item.completed .task-text { opacity: 0.5; text-decoration: line-through; }'
	},
	music: {
		classes: [
			'.music-widget',
			'.album-art',
			'.album-image',
			'.placeholder-art',
			'.song-info',
			'.song-title',
			'.song-artist',
			'.progress-section',
			'.progress-bar',
			'.progress-fill',
			'.time-display',
			'.controls',
			'.main-controls',
			'.control-btn',
			'.play-btn',
			'.player-selector',
			'.player-dropdown-btn',
			'.player-dropdown-menu',
			'.player-option',
			'.option-name',
			'.option-playing',
			'.option-paused',
			'.disabled',
			'.selected'
		],
		example:
			'.music-widget { background: radial-gradient(circle at 20% 0%, #3b1d5e, #120a1f 70%); }\n.album-art { border-radius: 50%; box-shadow: 0 0 22px rgba(217, 70, 239, 0.45); }\n.song-title { letter-spacing: 0.04em; text-transform: uppercase; }',
		note: 'The album art, progress fill and play button carry inline theme-color styles — recolor them with filter (or the music settings) instead of background.'
	},
	textbox: {
		classes: ['.textbox-widget', '.textbox-content'],
		example:
			'.textbox-widget { background: #fdf6e3; border: 1px solid #d8c9a3; color: #3b3226; }\n.textbox-content { font-family: Georgia, serif; line-height: 1.6; }'
	},
	memo: {
		classes: ['.memo-widget', '.memo-content'],
		example:
			'.memo-widget { background: linear-gradient(180deg, #ffe066, #ffd43b); color: #4a3b00; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35); }\n.memo-content { font-family: "Segoe Print", "Comic Sans MS", cursive; }'
	},
	drawing: {
		classes: [
			'.drawing-widget',
			'.canvas-wrapper',
			'.drawing-toolbar',
			'.tool-btn',
			'.tool-btn-danger',
			'.toolbar-divider',
			'.color-picker-btn',
			'.color-swatch',
			'.color-input',
			'.slider-group',
			'.slider-label',
			'.slider-value',
			'.slider',
			'.active'
		],
		example:
			'.drawing-widget { background: #0b2545; }\n.canvas-wrapper { background-image: linear-gradient(rgba(120, 190, 255, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(120, 190, 255, 0.12) 1px, transparent 1px); background-size: 24px 24px; }\n.drawing-toolbar { background: rgba(6, 20, 40, 0.85); border-radius: 12px; }'
	},
	slideshow: {
		classes: [
			'.slideshow-widget',
			'.image-stack',
			'.slide-img',
			'.nav-controls',
			'.nav-btn',
			'.nav-prev',
			'.nav-next',
			'.empty-state',
			'.empty-icon',
			'.empty-text',
			'.active'
		],
		example:
			'.slideshow-widget { background: #050505; }\n.slide-img { border-radius: 10px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7); }\n.nav-btn { background: rgba(255, 255, 255, 0.12); border-radius: 999px; }'
	},
	sleep: {
		classes: ['.power-widget', '.default-icon', '.custom-icon', '.label'],
		example:
			'.power-widget { background: radial-gradient(circle at 50% 30%, #2b3a8f, #0b1030 70%); border: 1px solid rgba(160, 180, 255, 0.35); }\n.label { letter-spacing: 0.14em; text-transform: uppercase; }'
	},
	restart: {
		classes: ['.power-widget', '.default-icon', '.custom-icon', '.label'],
		example:
			'.power-widget { background: linear-gradient(160deg, #3a2408, #120b02); border: 1px solid #ffb703; }\n.default-icon { filter: drop-shadow(0 0 10px rgba(255, 183, 3, 0.75)); }'
	},
	shutdown: {
		classes: ['.power-widget', '.default-icon', '.custom-icon', '.label'],
		example:
			'.power-widget { background: #160607; border: 1px solid #ff4d4d; box-shadow: 0 0 22px rgba(255, 77, 77, 0.4); }\n.label { color: #ff8080; letter-spacing: 0.14em; text-transform: uppercase; }'
	},
	clipboard: {
		classes: [
			'.clipboard-widget',
			'.toolbar',
			'.toolbar-btn',
			'.search-box',
			'.search-icon',
			'.entry-list',
			'.entry',
			'.entry-main',
			'.entry-thumb',
			'.entry-preview',
			'.entry-time',
			'.entry-actions',
			'.action-btn',
			'.edit-box',
			'.edit-actions',
			'.confirm',
			'.danger',
			'.copied-badge',
			'.copied',
			'.clickable'
		],
		example:
			'.clipboard-widget { background: rgba(17, 24, 39, 0.78); }\n.entry { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }\n.entry-preview { color: #cbd5e1; }'
	},
	custom: {
		classes: [
			'.custom-widget',
			'.html-content',
			'.net-prompt',
			'.net-prompt-text',
			'.net-prompt-actions',
			'.net-prompt-allow',
			'.net-prompt-deny',
			'.placeholder-text'
		],
		example:
			'.custom-widget { background: linear-gradient(140deg, #111827, #4c1d95); border: 1px solid rgba(196, 181, 253, 0.4); }\n.html-content h1 { color: #f0abfc; letter-spacing: 0.04em; }\n.html-content a { color: #67e8f9; }',
		note: 'Class names inside your HTML are your own — they are not part of the stable API. Prefer element selectors scoped under .html-content. The iframe document itself cannot be reached from here.'
	},
	icon: {
		classes: [
			'.app-icon',
			'.icon-content',
			'.icon-image',
			'.icon-label',
			'.icon-placeholder',
			'.icon-initial',
			'.url-badge',
			'.keybind-badge',
			'.image-type',
			'.gif'
		],
		example:
			'.app-icon { background: linear-gradient(150deg, #0ea5e9, #7c3aed); border-radius: 18px; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45); }\n.icon-label { text-transform: uppercase; letter-spacing: 0.08em; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6); }'
	}
};

/**
 * Prefixes every top-level selector in `css` with `scopeSelector` so the
 * styles only apply inside the widget they belong to.
 *
 * - Comma-separated selector lists are prefixed per selector.
 * - `@media`, `@supports`, `@container` and `@layer` blocks are prefixed
 *   recursively (the at-rule itself is kept).
 * - `@keyframes`, `@font-face` and statement at-rules (`@import`, …) are
 *   passed through unchanged. Keyframe names are global, so two widgets using
 *   the same animation name would collide — documented v1 limitation.
 * - Comments are removed.
 *
 * Limitation: CSS nesting (`&`) is not rewritten; keep custom CSS flat.
 */
export function prefixSelectors(css: string, scopeSelector: string): string {
	const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
	return transform(source, scopeSelector).trimStart();
}

function transform(css: string, scope: string): string {
	let out = '';
	let i = 0;
	const len = css.length;

	function skipString() {
		const quote = css[i];
		i++;
		while (i < len && css[i] !== quote) {
			if (css[i] === '\\') i++;
			i++;
		}
		i++;
	}

	/** Returns the index just past the closing brace of the block that starts
	 *  with `css[open] === '{'`. */
	function findBlockEnd(open: number): number {
		let depth = 1;
		let j = open + 1;
		while (j < len && depth > 0) {
			const ch = css[j];
			if (ch === '"' || ch === "'") {
				const quote = ch;
				j++;
				while (j < len && css[j] !== quote) {
					if (css[j] === '\\') j++;
					j++;
				}
			} else if (ch === '{') {
				depth++;
			} else if (ch === '}') {
				depth--;
			}
			j++;
		}
		return j;
	}

	while (i < len) {
		const ch = css[i];
		if (/\s/.test(ch)) {
			out += ch;
			i++;
			continue;
		}

		// Scan the prelude (selector list or at-rule) up to '{' or ';'.
		const preludeStart = i;
		while (i < len) {
			const c = css[i];
			if (c === '"' || c === "'") {
				skipString();
				continue;
			}
			if (c === '{' || c === ';') break;
			i++;
		}
		const prelude = css.slice(preludeStart, i);
		if (i >= len) {
			out += prelude;
			return out;
		}
		if (css[i] === ';') {
			out += prelude + ';';
			i++;
			continue;
		}

		const atRuleName = prelude.trimStart().match(/^@([a-z-]+)/)?.[1];
		if (atRuleName) {
			const blockEnd = findBlockEnd(i);
			if (
				atRuleName === 'media' ||
				atRuleName === 'supports' ||
				atRuleName === 'container' ||
				atRuleName === 'layer'
			) {
				out += prelude + '{' + transform(css.slice(i + 1, blockEnd - 1), scope) + '}';
			} else {
				// @keyframes, @font-face, @import, … — cannot be scoped, keep verbatim.
				out += css.slice(preludeStart, blockEnd);
			}
			i = blockEnd;
			continue;
		}

		const blockEnd = findBlockEnd(i);
		const trailingWhitespace = prelude.match(/\s+$/)?.[0] ?? '';
		out +=
			prefixSelectorList(prelude, scope) +
			trailingWhitespace +
			'{' +
			css.slice(i + 1, blockEnd - 1) +
			'}';
		i = blockEnd;
	}
	return out;
}

function prefixSelectorList(selectorList: string, scope: string): string {
	let out = '';
	let part = '';
	let depth = 0; // parens + brackets
	let quote: string | null = null;

	const push = (selector: string) => {
		const trimmed = selector.trim();
		if (!trimmed) return;
		if (out) out += ', ';
		out += scope + ' ' + trimmed;
	};

	for (let j = 0; j < selectorList.length; j++) {
		const ch = selectorList[j];
		if (quote) {
			part += ch;
			if (ch === '\\' && j + 1 < selectorList.length) {
				part += selectorList[++j];
				continue;
			}
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			part += ch;
			continue;
		}
		if (ch === '(' || ch === '[') {
			depth++;
			part += ch;
			continue;
		}
		if (ch === ')' || ch === ']') {
			depth--;
			part += ch;
			continue;
		}
		if (ch === ',' && depth === 0) {
			push(part);
			part = '';
			continue;
		}
		part += ch;
	}
	push(part);
	return out;
}
