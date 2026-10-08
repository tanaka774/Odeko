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

import PresetPanel from './PresetPanel.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

const NOW = Math.floor(Date.now() / 1000);

function preset(
	name: string,
	overrides: { icon_count?: number | null; updated_at?: number; is_active?: boolean } = {}
) {
	return {
		name,
		icon_count: 3,
		updated_at: NOW - 120,
		is_active: false,
		...overrides
	};
}

function renderPanel(props: Record<string, unknown> = {}) {
	return render(PresetPanel, {
		settings: { ...settingsStore.settings },
		onSwitched: vi.fn(),
		...props
	});
}

async function openRowMenu(name: string) {
	fireEvent.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
}

beforeEach(() => {
	invokeMock.mockReset();
	openMock.mockReset();
	saveMock.mockReset();
	invokeMock.mockImplementation((cmd: string) => {
		if (cmd === 'list_presets') return Promise.resolve([]);
		return Promise.resolve('Work');
	});
	settingsStore.resetToDefaults();
});

afterEach(cleanup);

describe('PresetPanel', () => {
	it('lists presets with their item count, age and active marker', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') {
				return Promise.resolve([
					preset('Work', { icon_count: 1, is_active: true }),
					preset('Broken', { icon_count: null })
				]);
			}
			return Promise.resolve('Work');
		});
		renderPanel();

		expect(await screen.findByText('1 item · 2m ago')).toBeTruthy();
		expect(screen.getByText('unreadable · 2m ago')).toBeTruthy();

		const work = screen.getByRole('button', { name: /^Work\b/ });
		expect(work.closest('.preset-row')?.classList.contains('active')).toBe(true);
		const broken = screen.getByRole('button', { name: /^Broken\b/ });
		expect(broken.closest('.preset-row')?.classList.contains('active')).toBe(false);
	});

	it('switches preset as soon as a row is clicked', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets')
				return Promise.resolve([preset('Work', { is_active: true }), preset('Gaming')]);
			return Promise.resolve('Work');
		});
		renderPanel();

		fireEvent.click(await screen.findByRole('button', { name: /^Gaming\b/ }));

		await waitFor(() => expect(settingsStore.activePreset).toBe('Gaming'));
		expect(invokeMock).toHaveBeenCalledWith('set_active_preset', { name: 'Gaming' });
	});

	it('asks before switching with unsaved changes', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') return Promise.resolve([preset('Gaming')]);
			return Promise.resolve('Work');
		});
		renderPanel({ dirty: true });

		fireEvent.click(await screen.findByRole('button', { name: /^Gaming\b/ }));

		expect(await screen.findByText('Switch to "Gaming" with unsaved changes?')).toBeTruthy();
		expect(invokeMock).not.toHaveBeenCalledWith('set_active_preset', { name: 'Gaming' });

		fireEvent.click(screen.getByRole('button', { name: 'Save & switch' }));

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('save_active_layout', expect.anything())
		);
		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('set_active_preset', { name: 'Gaming' })
		);
	});

	it('switches without saving when the user discards', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') return Promise.resolve([preset('Gaming')]);
			return Promise.resolve('Work');
		});
		renderPanel({ iconsDirty: true });

		fireEvent.click(await screen.findByRole('button', { name: /^Gaming\b/ }));
		fireEvent.click(await screen.findByRole('button', { name: 'Discard & switch' }));

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('set_active_preset', { name: 'Gaming' })
		);
		expect(invokeMock).not.toHaveBeenCalledWith('save_active_layout', expect.anything());
	});

	it('renames a preset inline', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') return Promise.resolve([preset('Work')]);
			return Promise.resolve('Work');
		});
		renderPanel();

		await openRowMenu('Work');
		fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

		const input = (await screen.findByLabelText('Preset name')) as HTMLInputElement;
		expect(input.value).toBe('Work');
		fireEvent.input(input, { target: { value: 'Work 2' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('rename_preset', {
				oldName: 'Work',
				newName: 'Work 2'
			})
		);
	});

	it('warns that a deleted preset is the active one and clears it', async () => {
		settingsStore.setActivePreset('Work');
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') return Promise.resolve([preset('Work', { is_active: true })]);
			return Promise.resolve('Work');
		});
		renderPanel();

		await openRowMenu('Work');
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		expect(await screen.findByText(/It is the active preset/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('delete_preset', { name: 'Work' }));
		await waitFor(() => expect(settingsStore.activePreset).toBeNull());
	});

	it('duplicates under the first free name', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') {
				return Promise.resolve([preset('Work'), preset('Work copy')]);
			}
			return Promise.resolve('Work');
		});
		renderPanel();

		await openRowMenu('Work');
		fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('duplicate_preset', {
				name: 'Work',
				newName: 'Work copy 2'
			})
		);
	});

	it('creates a blank preset from the draft row and switches to it', async () => {
		renderPanel();

		fireEvent.click(await screen.findByRole('button', { name: 'New blank' }));
		const input = (await screen.findByLabelText('New preset name')) as HTMLInputElement;
		expect(input.value).toBe('Untitled');

		fireEvent.input(input, { target: { value: 'Fresh' } });
		fireEvent.click(screen.getByRole('button', { name: 'Create' }));

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('save_default_preset', { name: 'Fresh' })
		);
		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('set_active_preset', { name: 'Fresh' })
		);
		expect(await screen.findByText('Created blank preset "Fresh".')).toBeTruthy();
	});

	it('stores the current layout when saving as a new preset', async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === 'list_presets') return Promise.resolve([preset('Work', { is_active: true })]);
			return Promise.resolve('Work');
		});
		settingsStore.setActivePreset('Work');
		renderPanel();

		fireEvent.click(await screen.findByRole('button', { name: 'Save as new' }));
		const input = (await screen.findByLabelText('New preset name')) as HTMLInputElement;
		expect(input.value).toBe('Copy of Work');

		fireEvent.click(screen.getByRole('button', { name: 'Create' }));

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith(
				'save_preset_as',
				expect.objectContaining({ name: 'Copy of Work' })
			)
		);
		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith('set_active_preset', { name: 'Copy of Work' })
		);
	});

	it('says so when there is nothing to list', async () => {
		renderPanel();
		expect(
			await screen.findByText(
				'No presets yet. "Save as new" stores the current layout under a name.'
			)
		).toBeTruthy();
	});
});
