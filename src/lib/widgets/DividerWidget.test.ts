import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import DividerWidget from './DividerWidget.svelte';

afterEach(cleanup);

describe('DividerWidget', () => {
	it('renders a single line without a label', () => {
		const { container } = render(DividerWidget, { config: {} });
		expect(container.querySelectorAll('.divider-line')).toHaveLength(1);
		expect(container.querySelector('.divider-label')).toBeNull();
	});

	it('splits the line around a label', () => {
		const { container } = render(DividerWidget, { config: { label: 'Work' } });
		expect(container.querySelectorAll('.divider-line')).toHaveLength(2);
		expect(container.querySelector('.divider-label')?.textContent).toBe('Work');
	});

	it('applies orientation and fade classes', () => {
		const { container } = render(DividerWidget, {
			config: { orientation: 'vertical', lineStyle: 'fade' }
		});
		const root = container.querySelector('.divider-widget');
		expect(root?.classList.contains('vertical')).toBe(true);
		expect(root?.classList.contains('fade')).toBe(true);
	});
});
