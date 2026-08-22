import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';

afterEach(cleanup);

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
