import { $, $$, browser, expect } from '@wdio/globals';
import { enterEditMode } from '../helpers';

// Reports to the test through the parent; the page's own messages carry a
// token, so these plain strings never reach the app's bridge.
const PAGE_HTML = `<h1 id="h">Hello E2E</h1>
<script>
	parent.postMessage('script-ran', '*');
	try { parent.document.title; parent.postMessage('escaped', '*'); } catch (e) {}
	odeko.storage.get('runs').then(function (runs) {
		var next = (runs || 0) + 1;
		odeko.storage.set('runs', next).then(function () {
			parent.postMessage('runs:' + next, '*');
		});
	});
</script>`;
const USER_CSS = '.custom-widget { background: rgb(10, 20, 30); }';
/** Open the settings modal of the (first) custom widget via a synthetic right-click. */
async function openCustomWidgetSettings() {
	await browser.execute(() => {
		const widget = document
			.querySelector<HTMLElement>('.custom-widget')
			?.closest('.draggable-widget') as HTMLElement | undefined;
		if (!widget) throw new Error('custom widget not found');
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

/** Set a textarea value via the native setter (WebDriver typing is unreliable on WebKitGTK). */
async function setTextareaValue(selector: string, value: string) {
	await browser.execute(
		(sel, text) => {
			const textarea = document.querySelector<HTMLTextAreaElement>(sel);
			if (!textarea) throw new Error(`textarea not found: ${sel}`);
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLTextAreaElement.prototype,
				'value'
			)?.set;
			setter?.call(textarea, text);
			textarea.dispatchEvent(new Event('input', { bubbles: true }));
		},
		selector,
		value
	);
}

async function collectMessages() {
	await browser.execute(() => {
		const w = window as unknown as { __pageMessages: string[] };
		w.__pageMessages = [];
		window.addEventListener('message', (event) => {
			if (typeof event.data === 'string') w.__pageMessages.push(event.data);
		});
	});
}

async function messages(): Promise<string[]> {
	return browser.execute(() => (window as unknown as { __pageMessages: string[] }).__pageMessages);
}

async function waitForMessage(text: string, timeoutMsg: string) {
	await browser.waitUntil(async () => (await messages()).includes(text), {
		timeout: 15000,
		timeoutMsg
	});
}

async function saveSettings() {
	await (await $('button=Save Changes')).click();
	await browser.waitUntil(
		async () =>
			!(await browser.execute(
				() => document.querySelector('[role="dialog"][aria-modal="true"]') !== null
			)),
		{ timeout: 10000, timeoutMsg: 'settings modal did not close after save' }
	);
}

async function removeAllCustomWidgets() {
	for (let attempt = 0; attempt < 8; attempt++) {
		if ((await $$('.custom-widget').length) === 0) break;
		await browser.execute(() => {
			const widget = document.querySelector('.custom-widget')?.closest('.draggable-widget') as
				| HTMLElement
				| undefined;
			widget?.dispatchEvent(
				new MouseEvent('contextmenu', {
					bubbles: true,
					cancelable: true,
					clientX: 200,
					clientY: 200
				})
			);
		});
		await browser.execute(() => {
			(
				[...document.querySelectorAll<HTMLElement>('.context-menu-item')].find(
					(el) => el.textContent?.trim() === 'Remove'
				) as HTMLElement | undefined
			)?.click();
		});
		await browser.pause(150);
	}
}

describe('Custom HTML widget', () => {
	it('runs the page sandboxed, keeps its storage and applies scoped CSS', async () => {
		await browser.waitUntil(async () => (await browser.getTitle()) === 'Odeko', {
			timeout: 15000
		});
		await collectMessages();

		await enterEditMode();
		await (await $('button=Add Widget')).click();
		const row = await $('button[title="Custom HTML"]');
		await row.waitForExist({ timeout: 10000 });
		await row.click();
		await (await $('.custom-widget')).waitForExist({ timeout: 15000 });

		await openCustomWidgetSettings();
		await setTextareaValue('#widget-custom-html', PAGE_HTML);
		await (await $('button=Appearance')).click();
		await (await $('#widget-custom-css-enabled')).click();
		await setTextareaValue('#widget-custom-css', USER_CSS);
		await saveSettings();

		await waitForMessage('script-ran', 'page script never ran');
		await waitForMessage('runs:1', 'storage never saved the first run');
		expect(await messages()).not.toContain('escaped');

		const frame = await browser.execute(() => {
			const iframe = document.querySelector('.custom-widget iframe');
			return {
				sandbox: iframe?.getAttribute('sandbox') ?? '',
				hasPage: (iframe?.getAttribute('srcdoc') ?? '').includes('Hello E2E')
			};
		});
		expect(frame.sandbox).toBe('allow-scripts');
		expect(frame.hasPage).toBe(true);

		const backgroundColor = await browser.execute(() => {
			const el = document.querySelector<HTMLElement>('.custom-widget');
			return el ? getComputedStyle(el).backgroundColor : '';
		});
		expect(backgroundColor).toBe('rgb(10, 20, 30)');

		// The preview's Run reloads the page under the same widget id; the count carries over.
		await openCustomWidgetSettings();
		await (await $('button=Run')).click();
		await waitForMessage('runs:2', 'storage did not survive a reload');
		await (await $('button=Cancel')).click();

		await removeAllCustomWidgets();
		await (await $('button=Save & Exit')).click();
		await browser.waitUntil(async () => (await $$('.custom-widget').length) === 0, {
			timeout: 10000
		});
	});

	it('blocks page scripts when Run JavaScript is off', async () => {
		await collectMessages();
		await enterEditMode();
		await (await $('button=Add Widget')).click();
		await (await $('button[title="Custom HTML"]')).click();
		await (await $('.custom-widget')).waitForExist({ timeout: 15000 });

		await openCustomWidgetSettings();
		await setTextareaValue('#widget-custom-html', PAGE_HTML);
		await browser.execute(() => {
			(
				[...document.querySelectorAll<HTMLLabelElement>('label')]
					.find((el) => el.textContent?.includes('Run JavaScript'))
					?.querySelector('input') as HTMLInputElement | undefined
			)?.click();
		});
		await saveSettings();

		await browser.waitUntil(
			async () =>
				await browser.execute(() =>
					(document.querySelector('.custom-widget iframe')?.getAttribute('srcdoc') ?? '').includes(
						'Content-Security-Policy'
					)
				),
			{ timeout: 10000, timeoutMsg: 'scripts-off page never rendered' }
		);
		await browser.pause(1500);
		expect(await messages()).not.toContain('script-ran');

		await removeAllCustomWidgets();
		await (await $('button=Save & Exit')).click();
		await browser.waitUntil(async () => (await $$('.custom-widget').length) === 0, {
			timeout: 10000
		});
	});
});
