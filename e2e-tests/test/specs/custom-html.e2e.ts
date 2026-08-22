import { $, $$, browser, expect } from '@wdio/globals';
import { enterEditMode } from '../helpers';

const USER_HTML =
	'<h1>Hello E2E</h1><p>body text</p><script>window.__e2ePwned = true;</script><a href="https://example.com/page">external</a><iframe sandbox="allow-scripts" srcdoc="<style>body { color: #222; }</style><div id=\'t\'>25:00</div><button onclick=\'go(25)\'>Focus</button><script>function go(m) {}</script>"></iframe>';
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

describe('Custom HTML widget', () => {
	it('renders sanitized HTML and applies scoped custom CSS', async () => {
		await browser.waitUntil(async () => (await browser.getTitle()) === 'Odeko', {
			timeout: 15000
		});

		// Add a Custom HTML widget through the picker.
		await enterEditMode();
		await (await $('button=Add Widget')).click();
		const row = await $('button[title="Custom HTML"]');
		await row.waitForExist({ timeout: 10000 });
		await row.click();
		await (await $('.custom-widget')).waitForExist({ timeout: 15000 });

		// Edit its HTML + enable custom CSS.
		await openCustomWidgetSettings();
		await setTextareaValue('#widget-custom-html', USER_HTML);

		// The live preview in the settings modal renders the typed HTML
		// sanitized, before anything is saved.
		const previewState = await browser.execute(() => {
			const surface = document.querySelector<HTMLElement>('.preview-surface');
			if (!surface) throw new Error('preview surface not found');
			return {
				h1: surface.querySelector('h1')?.textContent ?? '',
				scripts: surface.querySelectorAll('script').length,
				pwned: (window as unknown as { __e2ePwned?: boolean }).__e2ePwned ?? false
			};
		});
		expect(previewState.h1).toBe('Hello E2E');
		expect(previewState.scripts).toBe(0);
		expect(previewState.pwned).toBe(false);

		await (await $('button=Appearance')).click();
		await (await $('#widget-custom-css-enabled')).click();
		await setTextareaValue('#widget-custom-css', USER_CSS);

		await (await $('button=Save Changes')).click();

		// The settings modal must close before we interact with the grid again.
		await browser.waitUntil(
			async () =>
				!(await browser.execute(
					() => document.querySelector('[role="dialog"][aria-modal="true"]') !== null
				)),
			{ timeout: 10000, timeoutMsg: 'settings modal did not close after save' }
		);

		// Wait for the saved HTML to render in the widget itself — the actual
		// outcome — rather than any intermediate DOM state.
		await browser.waitUntil(
			async () =>
				(await browser.execute(() => document.querySelector('.custom-widget h1')?.textContent)) ===
				'Hello E2E',
			{ timeout: 10000, timeoutMsg: 'saved HTML never rendered in the widget' }
		);
		// The live DOM must contain the safe structure and none of the script.
		const state = await browser.execute(() => {
			const widget = document.querySelector<HTMLElement>('.custom-widget');
			if (!widget) throw new Error('custom widget not found');
			const frame = widget.querySelector('iframe');
			// The sanitized-away script would set this flag if it ever ran.
			const e2eWindow = window as unknown as { __e2ePwned?: boolean };
			return {
				h1: widget.querySelector('h1')?.textContent ?? '',
				p: widget.querySelector('p')?.textContent ?? '',
				scripts: widget.querySelectorAll('script').length,
				pwned: e2eWindow.__e2ePwned ?? false,
				linkTarget: widget.querySelector('a')?.getAttribute('target') ?? '',
				linkRel: widget.querySelector('a')?.getAttribute('rel') ?? '',
				iframeSandbox: frame?.getAttribute('sandbox') ?? '',
				iframeSrcdoc: frame?.getAttribute('srcdoc') ?? ''
			};
		});
		expect(state.h1).toBe('Hello E2E');
		expect(state.p).toBe('body text');
		expect(state.scripts).toBe(0);
		expect(state.pwned).toBe(false);
		expect(state.linkTarget).toBe('_blank');
		expect(state.linkRel).toContain('noopener');
		expect(state.iframeSandbox).toBe('allow-scripts');
		expect(state.iframeSrcdoc).toContain('</style>');
		expect(state.iframeSrcdoc).toContain('</script>');

		// Cascade check: the user CSS must win over the built-in styles,
		// scoped to this widget only.
		const backgroundColor = await browser.execute(() => {
			const el = document.querySelector<HTMLElement>('.custom-widget');
			return el ? getComputedStyle(el).backgroundColor : '';
		});
		expect(backgroundColor).toBe('rgb(10, 20, 30)');

		// Clean up: remove the widget (and any leftovers from interrupted runs)
		// and persist the edit session so the test never leaves a Custom HTML
		// widget in the user's layout. Removal lives in the right-click menu,
		// so select each remaining widget via a synthetic right-click and
		// click the Remove item — retrying until none remain.
		for (let attempt = 0; attempt < 8; attempt++) {
			const remaining = await $$('.custom-widget').length;
			if (remaining === 0) break;
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
		await (await $('button=Save & Exit')).click();
		await browser.waitUntil(async () => (await $$('.custom-widget').length) === 0, {
			timeout: 10000
		});
	});
	it('runs scripts inside sandboxed iframes (addEventListener, not inline onclick)', async () => {
		await browser.waitUntil(async () => (await browser.getTitle()) === 'Odeko', {
			timeout: 15000
		});
		await enterEditMode();
		await (await $('button=Add Widget')).click();
		await (await $('button[title="Custom HTML"]')).click();
		await (await $('.custom-widget')).waitForExist({ timeout: 15000 });

		// Collect postMessages from the sandboxed frame.
		await browser.execute(() => {
			(window as unknown as { __sandboxMessages: string[] }).__sandboxMessages = [];
			window.addEventListener('message', (event) => {
				if (typeof event.data === 'string') {
					(window as unknown as { __sandboxMessages: string[] }).__sandboxMessages.push(event.data);
				}
			});
		});

		const frameHtml =
			"<iframe sandbox='allow-scripts' srcdoc=\"<button id='b' onclick='parent.postMessage(&#39;inline-click&#39;, &#39;*&#39;)'>GO</button><script>parent.postMessage('script-ran', '*');document.getElementById('b').addEventListener('click', function () { parent.postMessage('listener-click', '*'); });document.getElementById('b').click();</script>\"></iframe>";

		await openCustomWidgetSettings();
		await setTextareaValue('#widget-custom-html', frameHtml);
		await (await $('button=Save Changes')).click();
		await browser.waitUntil(
			async () =>
				(await browser.execute(() => document.querySelector('.custom-widget iframe') !== null)) ===
				true,
			{ timeout: 10000 }
		);
		await browser.waitUntil(
			async () =>
				(await browser.execute(() =>
					(window as unknown as { __sandboxMessages: string[] }).__sandboxMessages.includes(
						'script-ran'
					)
				)) === true,
			{ timeout: 10000, timeoutMsg: 'sandboxed iframe script never executed' }
		);

		const messages = await browser.execute(
			() => (window as unknown as { __sandboxMessages: string[] }).__sandboxMessages
		);
		expect(messages).toContain('listener-click');
		// WebKitGTK does not execute inline handlers in sandboxed frames — the
		// docs tell users to use addEventListener; guard that claim.
		expect(messages).not.toContain('inline-click');

		// Clean up.
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
		await (await $('button=Cancel')).click();
		await browser.waitUntil(async () => (await $$('.custom-widget').length) === 0, {
			timeout: 10000
		});
	});
});
