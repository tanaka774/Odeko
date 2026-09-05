import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/svelte';

const invokeMock = vi.fn();
const openMock = vi.fn();
const saveMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args),
	convertFileSrc: (path: string) => `asset://localhost${path}`
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
	open: (...args: unknown[]) => openMock(...args),
	save: (...args: unknown[]) => saveMock(...args)
}));

import SettingsModal from './SettingsModal.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

async function openModal() {
	const utils = render(SettingsModal, { isOpen: true });
	await screen.findByRole('dialog');
	return utils;
}

function colorInput(): HTMLInputElement {
	return document.querySelector('input[type="color"]') as HTMLInputElement;
}

function clickSave() {
	fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

function clickCancel() {
	fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
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

describe('SettingsModal', () => {
	it('opens and shows the current background color', async () => {
		await openModal();
		expect(colorInput().value).toBe('#14141e');
	});

	it('persists a changed setting when Save is clicked', async () => {
		await openModal();

		fireEvent.input(colorInput(), { target: { value: '#ff0000' } });
		clickSave();

		expect(invokeMock).toHaveBeenCalledWith('save_active_settings', {
			settings: expect.objectContaining({ background_color: '255, 0, 0' })
		});
		expect(settingsStore.settings.background_color).toBe('255, 0, 0');
	});

	it('accepts a hex code typed into the color text field', async () => {
		await openModal();

		fireEvent.input(screen.getAllByPlaceholderText('#ff8800')[0], {
			target: { value: '#00ccff' }
		});
		clickSave();

		expect(invokeMock).toHaveBeenCalledWith('save_active_settings', {
			settings: expect.objectContaining({ background_color: '0, 204, 255' })
		});
		expect(settingsStore.settings.background_color).toBe('0, 204, 255');
	});

	it('keeps the stored color while an invalid code is being typed', async () => {
		await openModal();

		fireEvent.input(screen.getAllByPlaceholderText('#ff8800')[0], {
			target: { value: 'not a color' }
		});
		clickSave();

		expect(invokeMock).toHaveBeenCalledWith('save_active_settings', {
			settings: expect.objectContaining({ background_color: '20, 20, 30' })
		});
		expect(settingsStore.settings.background_color).toBe('20, 20, 30');
	});

	it('persists an icon position change when Save is clicked', async () => {
		await openModal();

		fireEvent.click(screen.getByRole('button', { name: '↘' }));
		clickSave();

		expect(invokeMock).toHaveBeenCalledWith(
			'save_active_settings',
			expect.objectContaining({
				settings: expect.objectContaining({ position_x: 100, position_y: 100 })
			})
		);
	});

	it('discards changes and does not persist when Cancel is clicked', async () => {
		await openModal();

		fireEvent.input(colorInput(), { target: { value: '#ff0000' } });
		clickCancel();

		expect(invokeMock).not.toHaveBeenCalledWith('save_active_settings', expect.anything());
		expect(settingsStore.settings.background_color).toBe('20, 20, 30');
	});

	it('discards changes when the modal is closed via the close button', async () => {
		await openModal();

		fireEvent.input(colorInput(), { target: { value: '#ff0000' } });
		fireEvent.click(screen.getByRole('button', { name: '✕' }));

		expect(invokeMock).not.toHaveBeenCalledWith('save_active_settings', expect.anything());
		expect(settingsStore.settings.background_color).toBe('20, 20, 30');
	});

	it('does not show a stale preset success message after reopening', async () => {
		const utils = await openModal();

		fireEvent.click(screen.getByRole('tab', { name: 'Presets' }));
		await screen.findByText('Active Preset');
		fireEvent.input(screen.getByPlaceholderText('Preset name...'), {
			target: { value: 'new' }
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create Blank' }));

		expect(await screen.findByText('Created default preset "new"')).toBeTruthy();
		expect(invokeMock).toHaveBeenCalledWith('save_default_preset', { name: 'new' });

		utils.rerender({ isOpen: false });
		utils.rerender({ isOpen: true });
		await screen.findByRole('dialog');

		expect(screen.queryByText('Created default preset "new"')).toBeNull();
	});

	it('reports what an import neutralized for safety', async () => {
		openMock.mockResolvedValueOnce('/tmp/shared.json');
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') return Promise.resolve([]);
			if (cmd === 'import_preset') {
				return Promise.resolve({
					name: 'shared',
					cleared_network_grants: 2,
					cleared_local_network: true,
					cleared_global_shortcuts: 1,
					forced_power_confirmation: 1
				});
			}
			return Promise.resolve('Default');
		});
		await openModal();

		fireEvent.click(screen.getByRole('tab', { name: 'Presets' }));
		await screen.findByText('Active Preset');
		fireEvent.click(screen.getByRole('button', { name: 'Import Preset...' }));

		expect(
			await screen.findByText(
				/Imported "shared". For safety: cleared 2 network grant\(s\), disabled local network access, disabled 1 global shortcut\(s\), re-enabled confirmation on 1 power widget\(s\)/
			)
		).toBeTruthy();
	});

	it('applies a selected preset instantly without a review step', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') return Promise.resolve(['Shared']);
			return Promise.resolve('Default');
		});
		await openModal();

		fireEvent.click(screen.getByRole('tab', { name: 'Presets' }));
		await screen.findByText('Active Preset');
		fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Shared' } });
		clickSave();

		// No review overlay blocks the switch, whatever the preset contains.
		expect(screen.queryByRole('alertdialog')).toBeNull();
		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('set_active_preset', { name: 'Shared' })
		);
		expect(invokeMock).not.toHaveBeenCalledWith('inspect_preset', expect.anything());
	});

	it('reflects an enabled autostart when the modal opens', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') return Promise.resolve([]);
			if (cmd === 'get_autostart') return Promise.resolve(true);
			return Promise.resolve('Default');
		});
		await openModal();

		const checkbox = screen.getByLabelText('Launch Odeko at login') as HTMLInputElement;
		await waitFor(() => expect(checkbox.checked).toBe(true));
	});

	it('registers autostart when the checkbox is ticked', async () => {
		await openModal();

		const checkbox = screen.getByLabelText('Launch Odeko at login') as HTMLInputElement;
		fireEvent.click(checkbox);

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('set_autostart', { enabled: true })
		);
		await waitFor(() => expect(checkbox.checked).toBe(true));
	});


	it('reverts the checkbox when the backend rejects autostart', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') return Promise.resolve([]);
			if (cmd === 'get_autostart') return Promise.resolve(false);
			if (cmd === 'set_autostart') return Promise.reject(new Error('denied'));
			return Promise.resolve('Default');
		});
		await openModal();

		const checkbox = screen.getByLabelText('Launch Odeko at login') as HTMLInputElement;
		fireEvent.click(checkbox);

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('set_autostart', { enabled: true })
		);
		await waitFor(() => expect(checkbox.checked).toBe(false));
	});
});
