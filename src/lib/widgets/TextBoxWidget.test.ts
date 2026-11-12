import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TextBoxWidget from './TextBoxWidget.svelte';
import { getTextEffectShadow } from './text-style';

afterEach(cleanup);

describe('TextBoxWidget', () => {
	it('passes typography settings to the root', () => {
		const { container } = render(TextBoxWidget, {
			config: { content: 'Hi', fontWeight: 700, lineHeight: 2, letterSpacing: 0.1 }
		});
		const style = (container.querySelector('.textbox-widget') as HTMLElement).getAttribute('style');
		expect(style).toContain('--font-weight: 700');
		expect(style).toContain('--line-height: 2');
		expect(style).toContain('--letter-spacing: 0.1em');
	});

	it('fits the textarea to its text when not top-aligned', () => {
		const { container } = render(TextBoxWidget, {
			config: { content: 'Hi', verticalAlign: 'middle' }
		});
		const root = container.querySelector('.textbox-widget') as HTMLElement;
		expect(root.getAttribute('style')).toContain('--vertical-justify: center');
		expect(container.querySelector('.textbox-content')?.classList.contains('fit')).toBe(true);
	});
});

describe('getTextEffectShadow', () => {
	it('maps each effect', () => {
		expect(getTextEffectShadow({})).toBe('none');
		expect(getTextEffectShadow({ textEffect: 'glow', textEffectColor: '#ff0000' })).toContain(
			'0 0 6px rgba(255, 0, 0, 1)'
		);
		expect(getTextEffectShadow({ textEffect: 'outline' }).match(/rgba/g)).toHaveLength(8);
	});
});

describe('TextBoxWidget state', () => {
	it('marks an empty box', () => {
		const { container } = render(TextBoxWidget, { config: { content: '  ' } });
		expect(container.querySelector('.textbox-widget')?.hasAttribute('data-empty')).toBe(true);
	});

	it('drops the mark once there is text', () => {
		const { container } = render(TextBoxWidget, { config: { content: 'Hi' } });
		expect(container.querySelector('.textbox-widget')?.hasAttribute('data-empty')).toBe(false);
	});
});
