import { describe, it, expect } from 'vitest';
import { prefixSelectors, SHARED_APPEARANCE_VARIABLES, WIDGET_CSS_API } from './custom-css';

const SCOPE = '[data-widget-id="abc"]';

describe('prefixSelectors', () => {
	it('prefixes a plain rule', () => {
		expect(prefixSelectors('.clock-widget { color: red; }', SCOPE)).toBe(
			'[data-widget-id="abc"] .clock-widget { color: red; }'
		);
	});

	it('prefixes every selector in a comma-separated list', () => {
		expect(prefixSelectors('.a, .b, .c { color: red; }', SCOPE)).toBe(
			'[data-widget-id="abc"] .a, [data-widget-id="abc"] .b, [data-widget-id="abc"] .c { color: red; }'
		);
	});

	it('does not split commas inside :is() / :not()', () => {
		expect(prefixSelectors(':is(.a, .b) > .c { color: red; }', SCOPE)).toBe(
			'[data-widget-id="abc"] :is(.a, .b) > .c { color: red; }'
		);
	});

	it('does not split commas inside attribute selectors with strings', () => {
		expect(prefixSelectors('[data-x="a,b"] { color: red; }', SCOPE)).toBe(
			'[data-widget-id="abc"] [data-x="a,b"] { color: red; }'
		);
	});

	it('keeps pseudo-classes and pseudo-elements attached to the selector', () => {
		expect(prefixSelectors('.task-item:hover::before { content: ""; }', SCOPE)).toBe(
			'[data-widget-id="abc"] .task-item:hover::before { content: ""; }'
		);
	});

	it('recurses into @media blocks', () => {
		const css = '@media (max-width: 100px) { .a { color: red; } .b { color: blue; } }';
		expect(prefixSelectors(css, SCOPE)).toBe(
			'@media (max-width: 100px) { [data-widget-id="abc"] .a { color: red; } [data-widget-id="abc"] .b { color: blue; } }'
		);
	});

	it('recurses into @supports blocks', () => {
		expect(prefixSelectors('@supports (display: grid) { .a { display: grid; } }', SCOPE)).toBe(
			'@supports (display: grid) { [data-widget-id="abc"] .a { display: grid; } }'
		);
	});

	it('passes @keyframes through unchanged', () => {
		const css = '@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }';
		expect(prefixSelectors(css, SCOPE)).toBe(css);
	});

	it('passes @font-face through unchanged', () => {
		const css = '@font-face { font-family: "X"; src: url(x.woff2); }';
		expect(prefixSelectors(css, SCOPE)).toBe(css);
	});

	it('passes @import statements through unchanged', () => {
		expect(prefixSelectors('@import url(other.css);', SCOPE)).toBe('@import url(other.css);');
	});

	it('removes comments', () => {
		expect(prefixSelectors('/* note */ .a { color: red; /* inner */ }', SCOPE)).toBe(
			'[data-widget-id="abc"] .a { color: red;  }'
		);
	});

	it('handles multiple rules', () => {
		expect(prefixSelectors('.a { color: red; } .b { color: blue; }', SCOPE)).toBe(
			'[data-widget-id="abc"] .a { color: red; } [data-widget-id="abc"] .b { color: blue; }'
		);
	});

	it('returns an empty string for empty or whitespace-only input', () => {
		expect(prefixSelectors('', SCOPE)).toBe('');
		expect(prefixSelectors('   \n  ', SCOPE)).toBe('');
	});
});

describe('SHARED_APPEARANCE_VARIABLES', () => {
	it('covers the six root-level appearance knobs', () => {
		expect(SHARED_APPEARANCE_VARIABLES).toEqual([
			'--appearance-background',
			'--appearance-border',
			'--appearance-text-color',
			'--appearance-border-radius',
			'--appearance-padding',
			'--appearance-opacity'
		]);
	});
});

describe('WIDGET_CSS_API', () => {
	it('covers every widget type and lists classes', () => {
		const types = [
			'clock',
			'system',
			'weather',
			'terminal',
			'tasklist',
			'music',
			'textbox',
			'memo',
			'drawing',
			'slideshow',
			'sleep',
			'restart',
			'shutdown',
			'clipboard',
			'custom'
		];
		for (const type of types) {
			const entry = WIDGET_CSS_API[type as keyof typeof WIDGET_CSS_API];
			expect(entry.classes.length).toBeGreaterThan(0);
			expect(entry.example.length).toBeGreaterThan(0);
		}
	});
});
