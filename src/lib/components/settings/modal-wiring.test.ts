import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { MODAL_KEYS } from './modal-appearance';

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn((command: string) =>
		Promise.resolve(command === 'scan_installed_apps' ? [] : null)
	),
	convertFileSrc: (path: string) => path
}));

afterEach(cleanup);

const componentsDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function settingsModalSources(): { name: string; source: string }[] {
	return readdirSync(componentsDir)
		.filter((file) => file.endsWith('SettingsModal.svelte'))
		.map((file) => ({ name: file, source: readFileSync(join(componentsDir, file), 'utf8') }));
}

describe('settings modal appearance wiring', () => {
	it('every shell-based settings modal passes a modalKey', () => {
		const missing = settingsModalSources()
			.filter(
				({ source }) => source.includes('<SettingsModalShell') && !source.includes('modalKey')
			)
			.map(({ name }) => name);

		expect(missing).toEqual([]);
	});

	it('literal modal keys exist in MODAL_KEYS', () => {
		const unknown: string[] = [];
		for (const { name, source } of settingsModalSources()) {
			for (const match of source.matchAll(/modalKey="([^"]+)"/g)) {
				if (!MODAL_KEYS.includes(match[1] as (typeof MODAL_KEYS)[number])) {
					unknown.push(`${name}: ${match[1]}`);
				}
			}
		}
		expect(unknown).toEqual([]);
	});

	it('renders the appearance gear in every shell-based modal', async () => {
		type AnyComponent = Component<Record<string, unknown>>;
		const modules: Record<string, AnyComponent> = {
			terminal: (await import('../TerminalSettingsModal.svelte'))
				.default as unknown as AnyComponent,
			drawing: (await import('../DrawingSettingsModal.svelte')).default as unknown as AnyComponent,
			clock: (await import('../ClockSettingsModal.svelte')).default as unknown as AnyComponent,
			weather: (await import('../WeatherSettingsModal.svelte')).default as unknown as AnyComponent
		};

		for (const [key, ModalComponent] of Object.entries(modules)) {
			render(ModalComponent, { isOpen: true, config: {}, onSave: vi.fn() });

			expect(document.querySelector(`[data-modal="${key}"]`)).not.toBeNull();
			expect(screen.getByRole('button', { name: 'Modal appearance' })).toBeTruthy();
			cleanup();
		}
	});

	it('renders the appearance gear in the picker dialogs', async () => {
		type AnyComponent = Component<Record<string, unknown>>;
		const AppPicker = (await import('../AppPickerModal.svelte')).default as unknown as AnyComponent;
		const WidgetPicker = (await import('../WidgetPickerModal.svelte'))
			.default as unknown as AnyComponent;

		render(AppPicker, { isOpen: true, onSelect: vi.fn() });
		expect(document.querySelector('[data-modal="app-picker"]')).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Modal appearance' })).toBeTruthy();
		cleanup();

		render(WidgetPicker, { isOpen: true, onSelect: vi.fn(), hasTerminal: false });
		expect(document.querySelector('[data-modal="widget-picker"]')).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Modal appearance' })).toBeTruthy();
	});
});
