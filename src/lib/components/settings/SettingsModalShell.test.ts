import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args),
	convertFileSrc: (path: string) => `asset://localhost${path}`
}));

import SettingsModalShell from './SettingsModalShell.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

function openShell(props: Record<string, unknown> = {}) {
	return render(SettingsModalShell, {
		isOpen: true,
		title: 'Clock Settings',
		onClose: vi.fn(),
		onSave: vi.fn(),
		modalKey: 'clock',
		...props
	});
}

function overlayStyle(): string {
	const overlay = document.querySelector('[data-modal="clock"] .modal-overlay') as HTMLElement;
	return (overlay.getAttribute('style') ?? '').replace(/\s+/g, '');
}

async function openAppearancePanel() {
	await fireEvent.click(screen.getByRole('button', { name: 'Modal appearance' }));
}

beforeEach(() => {
	invokeMock.mockReset();
	invokeMock.mockResolvedValue('Default');
	settingsStore.resetToDefaults();
});

afterEach(cleanup);

describe('SettingsModalShell appearance', () => {
	it('publishes the resolved custom properties on the overlay', () => {
		openShell();

		expect(overlayStyle()).toContain('--modal-overlay-bg:rgba(0,0,0,0.7)');
		expect(overlayStyle()).toContain('--modal-accent:rgba(120,160,200,0.85)');
	});

	it('puts the custom CSS scope on a parent of the overlay', () => {
		openShell();
		const scope = document.querySelector('[data-modal="clock"]') as HTMLElement;
		expect(scope.classList.contains('modal-scope')).toBe(true);
		expect(scope.querySelector('.modal-overlay')).not.toBeNull();
	});

	it('does not render the gear without a modal key', () => {
		openShell({ modalKey: undefined });
		expect(screen.queryByRole('button', { name: 'Modal appearance' })).toBeNull();
	});

	it('previews a change live before saving', async () => {
		openShell();
		await openAppearancePanel();

		const accentInput = document.querySelector('#modal-accentColor') as HTMLInputElement;
		await fireEvent.input(accentInput, { target: { value: '#ff0000' } });

		expect(overlayStyle()).toContain('--modal-accent:#ff0000');
		expect(settingsStore.settings.modal_appearance?.modals?.clock).toBeUndefined();
	});

	it('stores a sparse per-modal override and persists it on save', async () => {
		const onSave = vi.fn();
		openShell({ onSave });
		await openAppearancePanel();

		await fireEvent.input(document.querySelector('#modal-accentColor') as HTMLInputElement, {
			target: { value: '#ff0000' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		expect(settingsStore.settings.modal_appearance?.modals?.clock).toEqual({
			accentColor: '#ff0000'
		});
		expect(invokeMock).toHaveBeenCalledWith('save_active_settings', expect.anything());
		expect(onSave).toHaveBeenCalled();
	});

	it('discards the draft when the modal is closed without saving', async () => {
		openShell();
		await openAppearancePanel();

		await fireEvent.input(document.querySelector('#modal-accentColor') as HTMLInputElement, {
			target: { value: '#ff0000' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(settingsStore.settings.modal_appearance?.modals?.clock).toBeUndefined();
	});

	it('falls back to the global default and resets back to it', async () => {
		settingsStore.updateSettings({
			modal_appearance: { global: { accentColor: '#00ff00' } }
		});
		openShell();

		expect(overlayStyle()).toContain('--modal-accent:#00ff00');

		await openAppearancePanel();
		await fireEvent.input(document.querySelector('#modal-accentColor') as HTMLInputElement, {
			target: { value: '#ff0000' }
		});
		expect(overlayStyle()).toContain('--modal-accent:#ff0000');

		await fireEvent.click(screen.getByRole('button', { name: 'Reset this modal' }));
		expect(overlayStyle()).toContain('--modal-accent:#00ff00');
	});

	it('scales the dialog from the Text Size knob', async () => {
		openShell();
		await openAppearancePanel();

		await fireEvent.input(document.querySelector('#modal-fontSize') as HTMLInputElement, {
			target: { value: '20' }
		});

		expect(overlayStyle()).toContain('--modal-font-size:20px');
	});

	it('injects per-modal custom CSS scoped to the modal key', async () => {
		openShell();
		await openAppearancePanel();

		await fireEvent.click(document.querySelector('#modal-custom-css-enabled') as HTMLInputElement);
		await fireEvent.input(document.querySelector('#modal-custom-css') as HTMLTextAreaElement, {
			target: { value: '.modal-content { background: #123456; }' }
		});

		const styleEl = document.querySelector(
			'style[data-modal-css="clock"]'
		) as HTMLStyleElement | null;
		expect(styleEl?.textContent).toContain('[data-modal="clock"] .modal-content');
		expect(styleEl?.textContent).toContain('#123456');
	});

	it('applies custom CSS set on the global default, scoped to this modal', async () => {
		settingsStore.updateSettings({
			modal_appearance: {
				global: { customCssEnabled: true, customCss: '.save-btn { text-transform: uppercase; }' }
			}
		});
		openShell();

		const styleEl = document.querySelector(
			'style[data-modal-css="clock"]'
		) as HTMLStyleElement | null;
		expect(styleEl?.textContent).toContain('[data-modal="clock"] .save-btn');
	});
});
