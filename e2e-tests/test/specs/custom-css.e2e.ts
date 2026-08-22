import { $, browser, expect } from '@wdio/globals';
import { enterEditMode } from '../helpers';

const USER_CSS = '.system-widget { background: rgb(10, 20, 30); }';

/** Right-click the system widget and choose "Open Settings..." from the menu. */
async function openSystemWidgetSettings() {
	await browser.execute(() => {
		const widget = document
			.querySelector<HTMLElement>('.system-widget')
			?.closest('.draggable-widget') as HTMLElement | undefined;
		if (!widget) throw new Error('system widget not found');
		widget.dispatchEvent(
			new MouseEvent('contextmenu', {
				bubbles: true,
				cancelable: true,
				clientX: 200,
				clientY: 200
			})
		);
	});

	const openSettings = await $('button=Open Settings...');
	await openSettings.waitForExist({ timeout: 10000 });
	await openSettings.click();
	await (await $('[role="dialog"]')).waitForExist({ timeout: 10000 });
}

describe('Widget custom CSS', () => {
	it('enables custom CSS, injects it scoped to the widget, and overrides the built-in styles', async () => {
		await browser.waitUntil(async () => (await browser.getTitle()) === 'Odeko', {
			timeout: 15000
		});
		await (await $('.system-widget')).waitForExist({ timeout: 15000 });

		await enterEditMode();
		await openSystemWidgetSettings();

		// Switch to the Appearance tab.
		await (await $('button=Appearance')).click();

		// Enable custom CSS. The checkbox may already be checked (the layout is
		// persisted on disk between runs) — click only when unchecked, otherwise
		// this would toggle it OFF and hide the editor.
		await browser.execute(() => {
			const checkbox = document.querySelector<HTMLInputElement>('#widget-custom-css-enabled');
			if (!checkbox) throw new Error('custom css checkbox not found');
			if (!checkbox.checked) checkbox.click();
		});
		// Type CSS into the editor (WebDriver typing is unreliable on WebKitGTK,
		// so use the native value setter + input event like the other helpers).
		await browser.execute((css) => {
			const textarea = document.querySelector<HTMLTextAreaElement>('#widget-custom-css');
			if (!textarea) throw new Error('custom css textarea not found');
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLTextAreaElement.prototype,
				'value'
			)?.set;
			setter?.call(textarea, css);
			textarea.dispatchEvent(new Event('input', { bubbles: true }));
		}, USER_CSS);

		// The reference helper is shown and the built-in fields are dimmed.
		await (await $('summary=What can I style?')).waitForExist({ timeout: 10000 });
		expect(await (await $('.appearance-fields')).getAttribute('class')).toContain('disabled');

		// Save the modal.
		await (await $('button=Save Changes')).click();

		// A scoped <style> element must exist with the user CSS prefixed by the
		// widget id. Other widgets in the layout may also have custom CSS, so
		// target this widget's own style element.
		const widgetId = await browser.execute(() => {
			const container = document.querySelector('.system-widget')?.closest('.widget-container');
			return container?.getAttribute('data-widget-id') ?? '';
		});
		expect(widgetId).not.toBe('');
		const styleEl = await $(`style[data-widget-css="${widgetId}"]`);
		await styleEl.waitForExist({ timeout: 10000 });
		const injectedCss = await browser.execute((id) => {
			return (
				document.querySelector<HTMLStyleElement>(`style[data-widget-css="${id}"]`)?.textContent ??
				''
			);
		}, widgetId);
		expect(injectedCss).toContain('[data-widget-id="');
		expect(injectedCss).toContain(USER_CSS);

		// The user rule must win over the widget's own scoped rule (cascade check).
		const backgroundColor = await browser.execute(() => {
			const el = document.querySelector<HTMLElement>('.system-widget');
			return el ? getComputedStyle(el).backgroundColor : '';
		});
		expect(backgroundColor).toBe('rgb(10, 20, 30)');
	});
});
