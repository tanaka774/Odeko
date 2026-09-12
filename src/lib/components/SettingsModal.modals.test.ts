import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/svelte';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args),
	convertFileSrc: (path: string) => `asset://localhost${path}`
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
	open: vi.fn(),
	save: vi.fn()
}));

import SettingsModal from './SettingsModal.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

function savedSettings(): Record<string, unknown> {
	const call = invokeMock.mock.calls.find((args) => args[0] === 'save_active_settings');
	return (call?.[1] as { settings: Record<string, unknown> })?.settings;
}

async function openModalsTab() {
	render(SettingsModal, { isOpen: true });
	await screen.findByRole('dialog');
	await fireEvent.click(screen.getByRole('tab', { name: 'Modals' }));
	await waitFor(() => expect(document.querySelector('#modal-target-select')).not.toBeNull());
}

function accentInput(): HTMLInputElement {
	return document.querySelector('#modal-accentColor') as HTMLInputElement;
}

beforeEach(() => {
	invokeMock.mockReset();
	invokeMock.mockImplementation((cmd: string) => {
		if (cmd === 'list_presets') return Promise.resolve([]);
		if (cmd === 'get_autostart') return Promise.resolve(false);
		return Promise.resolve('Default');
	});
	settingsStore.resetToDefaults();
});

afterEach(cleanup);

describe('SettingsModal modals tab', () => {
	it('edits the global default and previews it live', async () => {
		await openModalsTab();

		await fireEvent.input(accentInput(), { target: { value: '#00ff00' } });

		const style = (
			document.querySelector('[data-modal="app-settings"] .modal-overlay') as HTMLElement
		).getAttribute('style');
		expect(style).toContain('--modal-accent: #00ff00');
		expect(settingsStore.settings.modal_appearance?.global).toBeUndefined();
	});

	it('stores the global default as a sparse layer on save', async () => {
		await openModalsTab();

		await fireEvent.input(accentInput(), { target: { value: '#00ff00' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		const settings = savedSettings();
		expect(settings.modal_appearance).toEqual({ global: { accentColor: '#00ff00' } });
		expect(settingsStore.settings.modal_appearance).toEqual({
			global: { accentColor: '#00ff00' }
		});
	});

	it('stores a per-modal override only for the fields that differ from the global layer', async () => {
		settingsStore.updateSettings({ modal_appearance: { global: { accentColor: '#00ff00' } } });
		await openModalsTab();

		await fireEvent.change(document.querySelector('#modal-target-select') as HTMLSelectElement, {
			target: { value: 'clock' }
		});
		await fireEvent.input(accentInput(), { target: { value: '#ff0000' } });
		await fireEvent.input(document.querySelector('#modal-radius') as HTMLInputElement, {
			target: { value: '4' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		const stored = savedSettings().modal_appearance as {
			global?: unknown;
			modals?: Record<string, unknown>;
		};
		expect(stored.global).toEqual({ accentColor: '#00ff00' });
		expect(stored.modals?.clock).toEqual({ accentColor: '#ff0000', radius: 4 });
	});

	it('discards modal drafts when the dialog is cancelled', async () => {
		await openModalsTab();

		await fireEvent.input(accentInput(), { target: { value: '#00ff00' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(settingsStore.settings.modal_appearance).toEqual({});
	});

	it('resets a modal target back to the global layer', async () => {
		settingsStore.updateSettings({
			modal_appearance: { global: { accentColor: '#00ff00' }, modals: { clock: { radius: 4 } } }
		});
		await openModalsTab();

		await fireEvent.change(document.querySelector('#modal-target-select') as HTMLSelectElement, {
			target: { value: 'clock' }
		});
		expect((document.querySelector('#modal-radius') as HTMLInputElement).value).toBe('4');

		await fireEvent.click(screen.getByRole('button', { name: 'Reset this modal' }));
		expect((document.querySelector('#modal-radius') as HTMLInputElement).value).toBe('16');
	});
});
