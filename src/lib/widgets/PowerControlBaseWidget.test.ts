import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import PowerControlBaseWidget from './PowerControlBaseWidget.svelte';

const convertFileSrcMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
	convertFileSrc: (...args: unknown[]) => convertFileSrcMock(...args)
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
	ask: vi.fn()
}));

afterEach(() => {
	cleanup();
	convertFileSrcMock.mockReset();
});

function renderWidget(config: Record<string, unknown>) {
	return render(PowerControlBaseWidget, {
		config,
		actionType: 'shutdown',
		defaultIcon: '⏻'
	});
}

describe('PowerControlBaseWidget icon', () => {
	it('passes browser image urls through without convertFileSrc', () => {
		const { container } = renderWidget({
			iconType: 'custom',
			iconPath: 'https://example.com/icon.png'
		});

		const img = container.querySelector<HTMLImageElement>('.custom-icon');
		expect(img?.getAttribute('src')).toBe('https://example.com/icon.png');
		expect(convertFileSrcMock).not.toHaveBeenCalled();
	});

	it('converts local file paths with convertFileSrc', () => {
		convertFileSrcMock.mockReturnValue('asset://localhost/home/user/icon.png');
		const { container } = renderWidget({
			iconType: 'custom',
			iconPath: '/home/user/icon.png'
		});

		const img = container.querySelector<HTMLImageElement>('.custom-icon');
		expect(convertFileSrcMock).toHaveBeenCalledWith('/home/user/icon.png');
		expect(img?.getAttribute('src')).toBe('asset://localhost/home/user/icon.png');
	});

	it('falls back to the default icon when no custom icon is set', () => {
		const { container } = renderWidget({ iconType: 'default' });

		expect(container.querySelector('.default-icon')?.textContent).toBe('⏻');
		expect(container.querySelector('.custom-icon')).toBeNull();
	});
});
