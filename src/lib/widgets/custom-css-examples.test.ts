import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { prefixSelectors, WIDGET_CSS_API, type CssApiItemType } from './custom-css';

// Vitest's root is the repo root (see vite.config.ts), so relative example
// paths resolve from the process cwd.
const REPO_ROOT = process.cwd();
const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples', 'custom-css');
const SCOPE = '[data-item-id="example"]';

/**
 * Component that renders each curated item type. The drift test proves every
 * class advertised in `WIDGET_CSS_API` still exists in that component's
 * markup, so the in-app "What can I style?" list cannot rot silently.
 */
const MARKUP_SOURCES: Record<CssApiItemType, string> = {
	clock: 'src/lib/widgets/ClockWidget.svelte',
	system: 'src/lib/widgets/SystemWidget.svelte',
	weather: 'src/lib/widgets/WeatherWidget.svelte',
	terminal: 'src/lib/widgets/TerminalWidget.svelte',
	tasklist: 'src/lib/widgets/TaskListWidget.svelte',
	music: 'src/lib/widgets/MusicPlayerWidget.svelte',
	textbox: 'src/lib/widgets/TextBoxWidget.svelte',
	memo: 'src/lib/widgets/MemoWidget.svelte',
	drawing: 'src/lib/widgets/DrawingWidget.svelte',
	slideshow: 'src/lib/widgets/SlideshowWidget.svelte',
	sleep: 'src/lib/widgets/PowerControlBaseWidget.svelte',
	restart: 'src/lib/widgets/PowerControlBaseWidget.svelte',
	shutdown: 'src/lib/widgets/PowerControlBaseWidget.svelte',
	clipboard: 'src/lib/widgets/ClipboardWidget.svelte',
	custom: 'src/lib/widgets/CustomWidget.svelte',
	icon: 'src/lib/components/AppIcon.svelte'
};

const TYPES = Object.keys(WIDGET_CSS_API) as CssApiItemType[];

function exampleCss(type: CssApiItemType): string {
	return readFileSync(`${EXAMPLES_DIR}/${type}.css`, 'utf8');
}

/** Markup only: everything after the last `</script>` and before `<style>`. */
function markupOf(source: string): string {
	const afterScript = source.includes('</script>')
		? source.slice(source.lastIndexOf('</script>') + '</script>'.length)
		: source;
	const styleStart = afterScript.indexOf('<style>');
	return styleStart === -1 ? afterScript : afterScript.slice(0, styleStart);
}

/** Selector preludes — the text before each `{`, minus at-rule preludes. */
function selectorPreludes(css: string): string[] {
	const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const preludes: string[] = [];
	let start = 0;

	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (ch === '"' || ch === "'") {
			const quote = ch;
			i++;
			while (i < src.length && src[i] !== quote) {
				if (src[i] === '\\') i++;
				i++;
			}
			continue;
		}
		if (ch === '{') {
			const prelude = src.slice(start, i).trim();
			if (prelude && !prelude.startsWith('@')) preludes.push(prelude);
			start = i + 1;
		} else if (ch === '}') {
			start = i + 1;
		}
	}

	return preludes;
}

function classTokens(preludes: string[]): string[] {
	const tokens = new Set<string>();
	for (const prelude of preludes) {
		for (const match of prelude.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
			tokens.add(`.${match[1]}`);
		}
	}
	return [...tokens];
}

function mentionsClass(markup: string, className: string): boolean {
	const name = className.slice(1);
	return new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`).test(markup);
}

describe('custom CSS examples', () => {
	it('ships exactly one example per curated item type', () => {
		const files = readdirSync(EXAMPLES_DIR).filter((name) => name.endsWith('.css'));
		expect(new Set(files)).toEqual(new Set(TYPES.map((type) => `${type}.css`)));
	});

	it.each(TYPES)('%s example is scoped and avoids constructs that cannot work', (type) => {
		const css = exampleCss(type);
		const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

		// Every rule must survive prefixing, and the injected stylesheet must
		// actually be scoped to the instance.
		expect(prefixSelectors(css, SCOPE).trim().length).toBeGreaterThan(0);
		expect(prefixSelectors(css, SCOPE)).toContain(SCOPE);

		// Inline --appearance-* styles outrank a stylesheet declaration, so
		// redefining one here would silently do nothing.
		expect(stripped).not.toMatch(/--appearance-[a-z-]+\s*:/);
		expect(stripped).not.toContain('!important');
		// @import is not fetched inside the widget scope, and `&` nesting is
		// not rewritten by prefixSelectors.
		expect(stripped).not.toContain('@import');
		expect(stripped).not.toContain('&');
	});

	it.each(TYPES)('%s example prefixes into fully scoped, balanced CSS', (type) => {
		const scoped = prefixSelectors(exampleCss(type), SCOPE);

		const open = (scoped.match(/\{/g) ?? []).length;
		const close = (scoped.match(/\}/g) ?? []).length;
		expect(open).toBeGreaterThan(0);
		expect(open).toBe(close);

		// @keyframes bodies keep their own `from`/`50%` preludes — prefixSelectors
		// passes them through verbatim, so drop them before the scope check.
		const withoutKeyframes = scoped.replace(
			/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,
			''
		);

		const unscoped = selectorPreludes(withoutKeyframes).filter(
			(prelude) => !prelude.startsWith(SCOPE)
		);
		expect(unscoped).toEqual([]);
	});

	it.each(TYPES)('%s example only uses classes from the curated API', (type) => {
		const allowed = new Set(WIDGET_CSS_API[type].classes);
		const unknown = classTokens(selectorPreludes(exampleCss(type))).filter(
			(token) => !allowed.has(token)
		);
		expect(unknown).toEqual([]);
	});

	it.each(TYPES)('%s curated classes still exist in the component markup', (type) => {
		const markup = markupOf(readFileSync(`${REPO_ROOT}/${MARKUP_SOURCES[type]}`, 'utf8'));
		const missing = WIDGET_CSS_API[type].classes.filter(
			(className) => !mentionsClass(markup, className)
		);
		expect(missing).toEqual([]);
	});
});
