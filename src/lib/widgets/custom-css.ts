import type { WidgetType } from './types';

/**
 * The six shared appearance knobs, set on every widget root as CSS custom
 * properties. They are the stable part of the public "custom CSS" API: a user
 * may override them (or the concrete properties they feed) with plain
 * selectors — no `!important` needed.
 */
export const SHARED_APPEARANCE_VARIABLES = [
	'--appearance-background',
	'--appearance-border',
	'--appearance-text-color',
	'--appearance-border-radius',
	'--appearance-padding',
	'--appearance-opacity'
] as const;

/**
 * Curated per-widget CSS API: the stable class names a user can target.
 * Anything not listed here is not guaranteed to keep working across versions.
 * The settings modal renders this so users never have to guess.
 */
export const WIDGET_CSS_API: Record<
	WidgetType,
	{ classes: string[]; example: string; note?: string }
> = {
	clock: {
		classes: [
			'.clock-widget',
			'.time-display',
			'.date-display',
			'.analog-clock',
			'.clock-face',
			'.clock-ring',
			'.tick',
			'.major-tick',
			'.clock-number',
			'.hour-hand',
			'.minute-hand',
			'.second-hand',
			'.center-dot'
		],
		example:
			'.clock-widget { background: linear-gradient(135deg, #1a1a2e, #16213e); }\n.time-display { font-family: "Courier New", monospace; letter-spacing: 0.2em; }'
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
		example: '.system-widget { background: #0a0f0d; }\n.stat-value { color: #22ff88; }'
	},
	weather: {
		classes: [
			'.weather-widget',
			'.current-summary',
			'.temperature',
			'.location',
			'.condition',
			'.condition-icon',
			'.forecast-list',
			'.forecast-item'
		],
		example:
			'.weather-widget { background: linear-gradient(180deg, #0f2027, #203a43); }\n.temperature { font-size: 3rem; }'
	},
	terminal: {
		classes: ['.terminal-widget', '.terminal-container', '.loading-overlay', '.loading-text'],
		example: '.terminal-widget { background: #0c0c0c; }\n.loading-text { color: #00ff00; }',
		note: 'Terminal text colors are drawn on a canvas by xterm.js and cannot be changed with CSS — use the terminal theme settings instead.'
	},
	tasklist: {
		classes: [
			'.tasklist-widget',
			'.tab-bar',
			'.task-tab',
			'.task-input',
			'.task-item',
			'.task-text',
			'.task-checkbox'
		],
		example:
			'.tasklist-widget { background: rgba(20, 20, 30, 0.9); }\n.task-text { font-size: 0.95rem; }'
	},
	music: {
		classes: [
			'.music-widget',
			'.album-art',
			'.song-title',
			'.song-artist',
			'.progress-bar',
			'.progress-fill',
			'.control-btn',
			'.play-btn'
		],
		example:
			'.music-widget { background: rgba(30, 30, 40, 0.8); }\n.song-title { font-weight: 700; }'
	},
	textbox: {
		classes: ['.textbox-widget', '.textbox-content'],
		example:
			'.textbox-widget { background: #1b1b2f; }\n.textbox-content { font-family: Georgia, serif; }'
	},
	memo: {
		classes: ['.memo-widget', '.memo-content'],
		example: '.memo-widget { background: #2d2013; }\n.memo-content { font-size: 1.1rem; }'
	},
	drawing: {
		classes: ['.drawing-widget', '.drawing-toolbar', '.tool-btn', '.canvas-wrapper'],
		example:
			'.drawing-widget { background: #151515; }\n.drawing-toolbar { background: rgba(255, 255, 255, 0.08); }'
	},
	slideshow: {
		classes: ['.slideshow-widget', '.slide-img', '.nav-btn', '.empty-state'],
		example: '.slideshow-widget { background: #000; }\n.slide-img { object-fit: cover; }'
	},
	sleep: {
		classes: ['.power-widget', '.default-icon', '.custom-icon', '.label'],
		example: '.power-widget { background: rgba(60, 30, 90, 0.6); }\n.label { font-weight: 600; }'
	},
	restart: {
		classes: ['.power-widget', '.default-icon', '.custom-icon', '.label'],
		example: '.power-widget { background: rgba(90, 60, 20, 0.6); }\n.label { font-weight: 600; }'
	},
	shutdown: {
		classes: ['.power-widget', '.default-icon', '.custom-icon', '.label'],
		example: '.power-widget { background: rgba(120, 30, 30, 0.6); }\n.label { font-weight: 600; }'
	},
	clipboard: {
		classes: [
			'.clipboard-widget',
			'.toolbar',
			'.search-box',
			'.entry-list',
			'.entry',
			'.entry-preview',
			'.entry-time',
			'.entry-actions',
			'.action-btn'
		],
		example:
			'.clipboard-widget { background: rgba(25, 25, 35, 0.95); }\n.entry { border-bottom: 1px solid rgba(255,255,255,0.1); }'
	},
	custom: {
		classes: ['.custom-widget'],
		example: '.custom-widget h1 { color: var(--appearance-text-color); }',
		note: 'Class names inside your HTML are your own — they are not part of the stable API. Prefer element selectors scoped under .custom-widget.'
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
