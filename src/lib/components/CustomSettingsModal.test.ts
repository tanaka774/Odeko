import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/svelte';
import CustomSettingsModal from './CustomSettingsModal.svelte';

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn()
}));

afterEach(cleanup);

describe('CustomSettingsModal live preview', () => {
	it('renders the typed HTML in the preview as you type', async () => {
		render(CustomSettingsModal, {
			isOpen: true,
			config: { content: '<h1>Initial</h1>' },
			onSave: vi.fn()
		});

		// The preview starts with the current content.
		expect(document.querySelector('.preview-surface h1')?.textContent).toBe('Initial');

		// Typing updates the preview without saving.
		await fireEvent.input(document.querySelector('#widget-custom-html') as HTMLTextAreaElement, {
			target: { value: '<h1>Live</h1><p>typed</p>' }
		});
		expect(document.querySelector('.preview-surface h1')?.textContent).toBe('Live');
		expect(document.querySelector('.preview-surface p')?.textContent).toBe('typed');
	});

	it('preview is sanitized exactly like the widget', async () => {
		render(CustomSettingsModal, { isOpen: true, config: {}, onSave: vi.fn() });

		await fireEvent.input(document.querySelector('#widget-custom-html') as HTMLTextAreaElement, {
			target: { value: '<p>safe</p><script>window.__pwned = true;</script>' }
		});

		expect(document.querySelector('.preview-surface p')?.textContent).toBe('safe');
		expect(document.querySelector('.preview-surface script')).toBeNull();
	});

	it('shows the empty placeholder when the content is blank', async () => {
		render(CustomSettingsModal, { isOpen: true, config: {}, onSave: vi.fn() });

		expect(document.querySelector('.preview-surface .placeholder-text')).not.toBeNull();

		await fireEvent.input(document.querySelector('#widget-custom-html') as HTMLTextAreaElement, {
			target: { value: '   ' }
		});
		expect(document.querySelector('.preview-surface .placeholder-text')).not.toBeNull();
	});

	it('keeps the editor and preview on the HTML tab', () => {
		const { container } = render(CustomSettingsModal, {
			isOpen: true,
			config: {},
			onSave: vi.fn()
		});

		expect(screen.getByLabelText('HTML')).toBeTruthy();
		expect(container.querySelector('.preview-surface')).not.toBeNull();
	});
});
