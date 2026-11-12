import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/svelte';

const invokeMock = vi.fn(async (command: string) => {
	if (command === 'list_system_fonts') return ['Noto Sans', 'Fira Code', 'DejaVu Serif'];
	if (command === 'list_user_fonts') return [];
	return null;
});

vi.mock('@tauri-apps/api/core', () => ({
	invoke: (command: string) => invokeMock(command),
	convertFileSrc: (path: string) => `asset://localhost${path}`
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

import FontPicker from './FontPicker.svelte';
import { fontFamilyValue, primaryFamily } from '$lib/stores/fonts.svelte';

afterEach(() => {
	cleanup();
	invokeMock.mockClear();
});

describe('font family helpers', () => {
	it('quotes names with spaces and adds a fallback', () => {
		expect(fontFamilyValue('Noto Sans')).toBe("'Noto Sans', system-ui");
		expect(fontFamilyValue('Inter')).toBe('Inter, system-ui');
		expect(fontFamilyValue('serif')).toBe('serif');
	});

	it('reads the first family back', () => {
		expect(primaryFamily("'Noto Sans', system-ui")).toBe('Noto Sans');
		expect(primaryFamily('Georgia, serif')).toBe('Georgia');
	});
});

describe('FontPicker', () => {
	it('lists installed fonts and filters them by the typed text', async () => {
		const onchange = vi.fn();
		render(FontPicker, { id: 'fp', value: 'system-ui', onchange });

		await fireEvent.focus(screen.getByRole('combobox'));
		await waitFor(() => expect(screen.getByText('Fira Code')).toBeTruthy());
		expect(screen.getByText('Noto Sans')).toBeTruthy();

		await fireEvent.input(screen.getByRole('combobox'), { target: { value: 'fira' } });
		expect(screen.queryByText('Noto Sans')).toBeNull();
		expect(onchange).toHaveBeenLastCalledWith('fira');

		await fireEvent.click(screen.getByText('Fira Code'));
		expect(onchange).toHaveBeenLastCalledWith("'Fira Code', system-ui");
		expect(screen.queryByRole('listbox')).toBeNull();
	});
});
