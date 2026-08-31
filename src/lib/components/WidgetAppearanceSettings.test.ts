import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
import { setBulkAppearanceHandler } from '$lib/bulk-appearance';
import { TEXT_APPEARANCE_FIELDS } from '$lib/widgets/types';

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn(),
	convertFileSrc: (path: string) => path
}));

afterEach(() => {
	cleanup();
	setBulkAppearanceHandler(null);
});

function appearanceFields(): HTMLElement {
	return document.querySelector('.appearance-fields') as HTMLElement;
}

function customCssCheckbox(): HTMLInputElement {
	return screen.getByRole('checkbox', { name: /override the look/i }) as HTMLInputElement;
}

describe('WidgetAppearanceSettings', () => {
	it('hides the custom CSS editor until the checkbox is enabled', () => {
		render(WidgetAppearanceSettings, { appearance: {}, widgetType: 'clock' });

		expect(screen.queryByRole('textbox', { name: 'Custom CSS' })).toBeNull();
		expect(screen.queryByText('What can I style?')).toBeNull();
	});

	it('reveals the editor and reference when enabled, and dims the built-in fields', async () => {
		render(WidgetAppearanceSettings, { appearance: {}, widgetType: 'clock' });

		await fireEvent.click(customCssCheckbox());

		const textarea = screen.getByRole('textbox', { name: 'Custom CSS' });
		expect(textarea).toBeTruthy();
		expect(screen.getByText('What can I style?')).toBeTruthy();
		expect(screen.getByText('.clock-widget')).toBeTruthy();
		expect(appearanceFields().classList.contains('disabled')).toBe(true);
	});

	it('round-trips typed CSS through the appearance config', async () => {
		render(WidgetAppearanceSettings, { appearance: {}, widgetType: 'clock' });
		await fireEvent.click(customCssCheckbox());

		const textarea = screen.getByRole('textbox', { name: 'Custom CSS' }) as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: '.clock-widget { color: pink; }' } });

		expect(textarea.value).toBe('.clock-widget { color: pink; }');
	});

	it('restores the built-in fields when custom CSS is turned off', async () => {
		render(WidgetAppearanceSettings, { appearance: {}, widgetType: 'clock' });

		await fireEvent.click(customCssCheckbox());
		expect(appearanceFields().classList.contains('disabled')).toBe(true);

		await fireEvent.click(customCssCheckbox());
		expect(appearanceFields().classList.contains('disabled')).toBe(false);
		expect(screen.queryByText('What can I style?')).toBeNull();
	});

	it('shows no per-widget reference when the widget type is unknown', async () => {
		render(WidgetAppearanceSettings, { appearance: {} });
		await fireEvent.click(customCssCheckbox());

		expect(screen.queryByText('What can I style?')).toBeNull();
	});
});

describe('WidgetAppearanceSettings grouping', () => {
	it('groups the fields under Fill / Text / Border / Shape & Spacing / Overall labels', () => {
		render(WidgetAppearanceSettings, { appearance: {} });

		expect(screen.getByText('Fill')).toBeTruthy();
		expect(screen.getByText('Text')).toBeTruthy();
		expect(screen.getByText('Border')).toBeTruthy();
		expect(screen.getByText('Shape & Spacing')).toBeTruthy();
		expect(screen.getByText('Overall')).toBeTruthy();
	});

	it('hides border width and color when the border style is None', async () => {
		render(WidgetAppearanceSettings, { appearance: { borderStyle: 'none' } });

		expect(screen.queryByLabelText(/Border Width/)).toBeNull();
		expect(screen.queryByLabelText('Border Color')).toBeNull();

		const style = screen.getByLabelText('Border Style') as HTMLSelectElement;
		await fireEvent.change(style, { target: { value: 'solid' } });

		expect(screen.getByLabelText(/Border Width/)).toBeTruthy();
		expect(screen.getByLabelText('Border Color')).toBeTruthy();
	});

	it('hides individual text fields when requested', () => {
		render(WidgetAppearanceSettings, { appearance: {}, hideFields: ['textColor'] });

		expect(screen.queryByLabelText('Text Color')).toBeNull();
		expect(screen.getByText('Text')).toBeTruthy();
		expect(screen.getByLabelText(/Font Size/)).toBeTruthy();
		expect(screen.getByLabelText('Font Family')).toBeTruthy();
	});

	it('skips the Text group when every text field is hidden', () => {
		render(WidgetAppearanceSettings, { appearance: {}, hideFields: TEXT_APPEARANCE_FIELDS });

		expect(screen.queryByText('Text')).toBeNull();
		expect(screen.queryByLabelText(/Font Size/)).toBeNull();
		expect(screen.queryByLabelText('Font Family')).toBeNull();
	});
});

describe('WidgetAppearanceSettings apply to all', () => {
	it('dispatches the effective look to the bulk handler, minus custom CSS', async () => {
		const handler = vi.fn();
		setBulkAppearanceHandler(handler);

		render(WidgetAppearanceSettings, {
			appearance: { backgroundColor: '#112233', customCssEnabled: true, customCss: 'x{}' },
			defaults: { padding: 4 },
			applyToAll: true
		});

		await fireEvent.click(screen.getByRole('button', { name: /apply to all/i }));

		expect(handler).toHaveBeenCalledTimes(1);
		const payload = handler.mock.calls[0][0];
		expect(payload.backgroundColor).toBe('#112233');
		expect(payload.padding).toBe(4);
		expect(payload.customCss).toBeUndefined();
		expect(payload.customCssEnabled).toBeUndefined();
	});

	it('hides the apply-to-all button by default (bulk apply is opt-in)', () => {
		render(WidgetAppearanceSettings, { appearance: {} });

		expect(screen.queryByRole('button', { name: /apply to all/i })).toBeNull();
	});

	it('hides the custom CSS controls when hideCustomCss is set', () => {
		render(WidgetAppearanceSettings, { appearance: {}, hideCustomCss: true });

		expect(screen.queryByRole('checkbox', { name: /override the look/i })).toBeNull();
	});
});
