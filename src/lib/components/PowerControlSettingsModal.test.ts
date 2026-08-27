import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/svelte';

vi.mock('@tauri-apps/plugin-dialog', () => ({
	open: vi.fn()
}));

import PowerControlSettingsModal from './PowerControlSettingsModal.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

async function openModal(onSave = vi.fn()) {
	render(PowerControlSettingsModal, {
		isOpen: true,
		widgetName: 'Shutdown',
		onSave
	});
	await screen.findByRole('dialog');
	return onSave;
}

function clickSave() {
	fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

beforeEach(() => {
	settingsStore.resetToDefaults();
});

afterEach(cleanup);

describe('PowerControlSettingsModal icon', () => {
	it('offers the Enter URL button for custom icons', async () => {
		await openModal();

		fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Enter URL' })).toBeTruthy();
		});
	});

	it('saves a remote image URL as the custom icon', async () => {
		const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('https://example.com/power.png');
		const onSave = await openModal();
		fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Enter URL' })).toBeTruthy();
		});

		fireEvent.click(screen.getByRole('button', { name: 'Enter URL' }));
		clickSave();

		expect(promptSpy).toHaveBeenCalledWith('Enter image URL:', 'https://');
		expect(onSave).toHaveBeenCalledWith(
			expect.objectContaining({ iconType: 'custom', iconPath: 'https://example.com/power.png' })
		);
		promptSpy.mockRestore();
	});
});
