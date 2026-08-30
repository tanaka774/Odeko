import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn(),
	convertFileSrc: (path: string) => `asset://localhost${path}`
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
	open: vi.fn()
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
	readFile: vi.fn()
}));

import IconSettingsModal from './IconSettingsModal.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

const icon = {
	id: 'icon-1',
	name: 'Test App',
	path: '/usr/bin/test',
	icon_type: 'app' as const,
	x: 0,
	y: 0,
	width: 80,
	height: 80
};

async function openModal(iconOverrides: Record<string, unknown> = {}) {
	const onUpdateAppearance = vi.fn();
	render(IconSettingsModal, {
		isOpen: true,
		icon: { ...icon, ...iconOverrides },
		onUpdateAppearance
	});
	await screen.findByRole('dialog');
	return onUpdateAppearance;
}

async function openAppearanceTab() {
	await fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }));
}

async function clickSave() {
	await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

beforeEach(() => {
	settingsStore.resetToDefaults();
});

afterEach(cleanup);

describe('IconSettingsModal appearance', () => {
	it('saves no appearance config when nothing was customized', async () => {
		const onUpdateAppearance = await openModal();

		await clickSave();

		expect(onUpdateAppearance).toHaveBeenCalledWith('icon-1', undefined);
	});

	it('persists appearance changes made in the appearance tab', async () => {
		const onUpdateAppearance = await openModal();
		await openAppearanceTab();

		const color = screen.getByLabelText('Background Color') as HTMLInputElement;
		await fireEvent.input(color, { target: { value: '#ff0000' } });

		await clickSave();

		expect(onUpdateAppearance).toHaveBeenCalledWith('icon-1', { backgroundColor: '#ff0000' });
	});

	it('prefills the existing appearance config', async () => {
		await openModal({ appearance: { backgroundOpacity: 0.5 } });
		await openAppearanceTab();

		const opacity = screen.getByLabelText('Background Opacity: 50%') as HTMLInputElement;
		expect(opacity.value).toBe('0.5');
	});

	it('shows a live preview tile in the appearance tab', async () => {
		await openModal();
		await openAppearanceTab();

		expect(document.querySelector('.tile-preview')).toBeTruthy();
	});

	it('hides Text Color for image icons (no name label)', async () => {
		await openModal({ icon_type: 'image' });
		await openAppearanceTab();

		expect(screen.queryByLabelText('Text Color')).toBeNull();
	});

	it('hides Text Color when the name label is turned off', async () => {
		await openModal({ show_name: false });
		await openAppearanceTab();

		expect(screen.queryByLabelText('Text Color')).toBeNull();
	});
});

describe('IconSettingsModal icon source', () => {
	it('offers a File/URL source toggle for app icons', async () => {
		await openModal();

		expect(screen.getByRole('button', { name: 'File' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'URL' })).toBeTruthy();
	});

	it('saves a remote image URL entered in the URL field', async () => {
		const onUpdateIcon = vi.fn();
		render(IconSettingsModal, {
			isOpen: true,
			icon,
			onUpdateIcon
		});
		await screen.findByRole('dialog');

		await fireEvent.click(screen.getByRole('button', { name: 'URL' }));
		const input = screen.getByPlaceholderText('https://example.com/icon.png') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'https://example.com/icon.png' } });
		await clickSave();

		expect(onUpdateIcon).toHaveBeenCalledWith('icon-1', 'https://example.com/icon.png');
	});

	it('opens the URL field for icons whose stored path is already a URL', async () => {
		await openModal({ icon_path: 'https://example.com/icon.png' });

		const input = screen.getByPlaceholderText('https://example.com/icon.png') as HTMLInputElement;
		expect(input.value).toBe('https://example.com/icon.png');
	});
});
