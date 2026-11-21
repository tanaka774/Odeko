import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ClockWidget from './ClockWidget.svelte';

vi.stubGlobal(
	'ResizeObserver',
	class {
		observe() {}
		disconnect() {}
	}
);

afterEach(cleanup);

describe('ClockWidget', () => {
	it('measures with a stable digit template while fitting', () => {
		const { container } = render(ClockWidget, {
			config: { format: '24h', showSeconds: true, showDate: true }
		});
		const probes = container.querySelectorAll('.fit-probe');
		expect(probes).toHaveLength(2);
		expect(probes[0].textContent).toMatch(/^88:88:88$/);
	});

	it('keeps the fixed size when fitting is off', () => {
		const { container } = render(ClockWidget, { config: { fitText: false } });
		expect(container.querySelector('.fit-probe')).toBeNull();
		const time = container.querySelector('.time-display:not(.fit-probe)') as HTMLElement;
		expect(time.style.fontSize).toBe('');
	});
});
