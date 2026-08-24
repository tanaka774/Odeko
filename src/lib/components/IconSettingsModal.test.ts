import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/svelte';

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
	const onUpdateBackground = vi.fn();
	render(IconSettingsModal, {
		isOpen: true,
		icon: { ...icon, ...iconOverrides },
		onUpdateBackground
	});
	await screen.findByRole('dialog');
	return onUpdateBackground;
}

function clickSave() {
	fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

beforeEach(() => {
	settingsStore.resetToDefaults();
});

afterEach(cleanup);

describe('IconSettingsModal background', () => {
	it('keeps following the global background when custom is unchecked', async () => {
		const onUpdateBackground = await openModal();

		clickSave();

		expect(onUpdateBackground).toHaveBeenCalledWith('icon-1', null, null);
	});

	it('persists a custom background color and opacity when enabled', async () => {
		const onUpdateBackground = await openModal();

		fireEvent.click(screen.getByLabelText('Custom background color'));
		await waitFor(() => {
			expect(document.querySelector('input[type="color"]')).toBeTruthy();
		});
		const color = document.querySelector('input[type="color"]') as HTMLInputElement;
		fireEvent.input(color, { target: { value: '#ff0000' } });

		clickSave();

		expect(onUpdateBackground).toHaveBeenCalledWith('icon-1', '255, 0, 0', 0.2);
	});

	it('prefills an existing override and clears it when unchecked', async () => {
		const onUpdateBackground = await openModal({
			background_color: '10, 20, 30',
			background_opacity: 0.5
		});
		const checkbox = screen.getByLabelText('Custom background color') as HTMLInputElement;
		expect(checkbox.checked).toBe(true);

		fireEvent.click(checkbox);
		clickSave();

		expect(onUpdateBackground).toHaveBeenCalledWith('icon-1', null, null);
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
