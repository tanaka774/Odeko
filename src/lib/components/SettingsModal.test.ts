import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';

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

		fireEvent.click(screen.getByRole('button', { name: 'Presets' }));
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

		fireEvent.click(screen.getByRole('button', { name: 'Presets' }));
		await screen.findByText('Active Preset');
		fireEvent.click(screen.getByRole('button', { name: 'Import Preset...' }));

		expect(
			await screen.findByText(
				/Imported "shared". For safety: cleared 2 network grant\(s\), disabled local network access, disabled 1 global shortcut\(s\), re-enabled confirmation on 1 power widget\(s\)/
			)
		).toBeTruthy();
	});

	it('reviews ambient capabilities before applying a preset', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') return Promise.resolve(['Shared']);
			if (cmd === 'inspect_preset') {
				return Promise.resolve({
					icon_count: 5,
					app_icons: 4,
					link_icons: 0,
					custom_html_widgets: 1,
					power_widgets: 1,
					global_shortcuts: ['Weird (Ctrl+Alt+X)'],
					network_grants: [],
					allow_local_network: false
				});
			}
			return Promise.resolve('Default');
		});
		await openModal();

		fireEvent.click(screen.getByRole('button', { name: 'Presets' }));
		await screen.findByText('Active Preset');
		fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Shared' } });
		clickSave();

		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain('Apply preset "Shared"?');
		expect(dialog.textContent).toContain('1 custom HTML widget(s)');
		expect(dialog.textContent).toContain('Weird (Ctrl+Alt+X)');
		expect(dialog.textContent).toContain('1 power widget(s)');
		expect(invokeMock).not.toHaveBeenCalledWith('set_active_preset', expect.anything());

		fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		expect(invokeMock).not.toHaveBeenCalledWith('set_active_preset', expect.anything());

		// Applying proceeds with the switch. The second Save click's state
		// update flushes asynchronously, so tick() before querying the dialog.
		clickSave();
		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('inspect_preset', { name: 'Shared' })
		);
		await tick();
		const dialog2 = screen.getByRole('alertdialog');
		fireEvent.click(within(dialog2).getByRole('button', { name: 'Apply Preset' }));
		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('set_active_preset', { name: 'Shared' })
		);
	});

	it('applies presets without ambient capabilities without a review step', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') return Promise.resolve(['Plain']);
			if (cmd === 'inspect_preset') {
				return Promise.resolve({
					icon_count: 2,
					app_icons: 2,
					link_icons: 0,
					custom_html_widgets: 0,
					power_widgets: 0,
					global_shortcuts: [],
					network_grants: [],
					allow_local_network: false
				});
			}
			return Promise.resolve('Default');
		});
		await openModal();

		fireEvent.click(screen.getByRole('button', { name: 'Presets' }));
		await screen.findByText('Active Preset');
		fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Plain' } });
		clickSave();

		expect(screen.queryByRole('alertdialog')).toBeNull();
		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('set_active_preset', { name: 'Plain' })
		);
	});
});
