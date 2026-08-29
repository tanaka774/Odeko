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

function clickSave() {
	fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

beforeEach(() => {
	settingsStore.resetToDefaults();
});

afterEach(cleanup);

describe('IconSettingsModal appearance', () => {
	it('saves no appearance config when nothing was customized', async () => {
		const onUpdateAppearance = await openModal();

		clickSave();

		expect(onUpdateAppearance).toHaveBeenCalledWith('icon-1', undefined);
	});

	it('persists appearance changes made in the appearance settings', async () => {
		const onUpdateAppearance = await openModal();

		const color = screen.getByLabelText('Background Color') as HTMLInputElement;
		fireEvent.input(color, { target: { value: '#ff0000' } });

		clickSave();

		expect(onUpdateAppearance).toHaveBeenCalledWith('icon-1', { backgroundColor: '#ff0000' });
	});

	it('prefills the existing appearance config', async () => {
		await openModal({ appearance: { backgroundOpacity: 0.5 } });

		const opacity = screen.getByLabelText('Background Opacity: 50%') as HTMLInputElement;
		expect(opacity.value).toBe('0.5');
	});
});

describe('IconSettingsModal app icon URL thumbnail', () => {
	it('offers the Enter URL button for app icons', async () => {
		await openModal();

		expect(screen.getByRole('button', { name: 'Enter URL' })).toBeTruthy();
	});

	it('saves a remote image URL as the app icon thumbnail', async () => {
		const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('https://example.com/icon.png');
		const onUpdateIcon = vi.fn();
		render(IconSettingsModal, {
			isOpen: true,
			icon,
			onUpdateIcon
		});
		await screen.findByRole('dialog');

		fireEvent.click(screen.getByRole('button', { name: 'Enter URL' }));
		clickSave();

		expect(promptSpy).toHaveBeenCalledWith('Enter image URL:', 'https://');
		expect(onUpdateIcon).toHaveBeenCalledWith('icon-1', 'https://example.com/icon.png');
		promptSpy.mockRestore();
	});
});
