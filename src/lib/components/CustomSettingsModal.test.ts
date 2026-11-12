import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/svelte';

const invokeMock = vi.fn(async () => null);
vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...(args as [])),
	convertFileSrc: (path: string) => path
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

import CustomSettingsModal from './CustomSettingsModal.svelte';

afterEach(() => {
	cleanup();
	invokeMock.mockClear();
});

function previewDoc() {
	return document.querySelector('.preview-surface iframe')?.getAttribute('srcdoc') ?? '';
}

describe('CustomSettingsModal', () => {
	it('previews the page and updates it on Run', async () => {
		render(CustomSettingsModal, {
			isOpen: true,
			config: { content: '<h1>Initial</h1>', scripts: false },
			onSave: vi.fn()
		});
		await waitFor(() => expect(previewDoc()).toContain('<h1>Initial</h1>'));

		await fireEvent.input(document.querySelector('#widget-custom-html') as HTMLTextAreaElement, {
			target: { value: '<h1>Live</h1>' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
		await waitFor(() => expect(previewDoc()).toContain('<h1>Live</h1>'));
	});

	it('saves the edited page and the scripts switch', async () => {
		const onSave = vi.fn();
		render(CustomSettingsModal, { isOpen: true, config: { content: '' }, onSave });

		await fireEvent.input(document.querySelector('#widget-custom-html') as HTMLTextAreaElement, {
			target: { value: '<p>x</p>' }
		});
		await fireEvent.click(screen.getByLabelText('Run JavaScript'));
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		expect(onSave).toHaveBeenCalledWith(
			expect.objectContaining({ content: '<p>x</p>', scripts: false })
		);
	});

	it('clears the widget data from the Network & Data tab', async () => {
		render(CustomSettingsModal, { isOpen: true, config: {}, widgetId: 'w1', onSave: vi.fn() });
		await fireEvent.click(screen.getByRole('tab', { name: 'Network & Data' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Clear saved data' }));
		expect(invokeMock).toHaveBeenCalledWith('widget_data_clear', { widgetId: 'w1' });
	});
});
