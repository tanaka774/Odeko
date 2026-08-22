import { $, $$, browser, expect } from '@wdio/globals';
import { enterEditMode } from '../helpers';

/**
 * A minimal network widget: fetches a stable host through the launcher's fetch
 * proxy and posts the result back to the parent. The parent cannot read the
 * opaque-origin iframe's DOM, so the iframe reports its own outcome.
 */
const NET_HTML = `<iframe sandbox="allow-scripts" srcdoc="<script>
  var pending = {}; var nextId = 1;
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.kind !== 'widget-fetch-result') return;
    var entry = pending[msg.id]; if (!entry) return; delete pending[msg.id];
    if (msg.ok) { entry.resolve(msg.body); } else { entry.reject(new Error(msg.error || 'failed')); }
  });
  function widgetFetch(url) {
    return new Promise(function (resolve, reject) {
      var id = nextId++; pending[id] = { resolve: resolve, reject: reject };
      parent.postMessage({ kind: 'widget-fetch', id: id, url: url }, '*');
    });
  }
  widgetFetch('https://example.com/').then(function (body) {
    parent.postMessage({ kind: 'e2e-fetch-done', body: body }, '*');
  }).catch(function (e) {
    parent.postMessage({ kind: 'e2e-fetch-error', error: String(e) }, '*');
  });
</script>"></iframe>`;

async function openCustomWidgetSettings() {
	await browser.execute(() => {
		const widget = document
			.querySelector<HTMLElement>('.custom-widget')
			?.closest('.draggable-widget') as HTMLElement | undefined;
		if (!widget) throw new Error('custom widget not found');
		widget.dispatchEvent(
			new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window })
		);
	});
	const openSettings = await $('button=Open Settings...');
	await openSettings.waitForExist({ timeout: 10000 });
	await openSettings.click();
	await (await $('[role="dialog"]')).waitForExist({ timeout: 10000 });
}

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

describe('Custom HTML network fetch', () => {
	it('fetches through the proxy and returns the response to the iframe', async () => {
		await browser.waitUntil(async () => (await browser.getTitle()) === 'Odeko', {
			timeout: 15000
		});
		await enterEditMode();

		await browser.execute(() => {
			(window as unknown as { __e2eNetMessages: unknown[] }).__e2eNetMessages = [];
			window.addEventListener('message', (event) => {
				const data = event.data as { kind?: string };
				if (data && typeof data.kind === 'string') {
					(window as unknown as { __e2eNetMessages: unknown[] }).__e2eNetMessages.push(data);
				}
			});
		});

		await (await $('button=Add Widget')).click();
		await (await $('button[title="Custom HTML"]')).click();
		await (await $('.custom-widget')).waitForExist({ timeout: 15000 });

		await openCustomWidgetSettings();
		await setTextareaValue('#widget-custom-html', NET_HTML);
		await (await $('button=Save Changes')).click();

		const prompt = await $('.net-prompt');
		try {
			await prompt.waitForExist({ timeout: 5000 });
			await (await $('.net-prompt-allow')).click();
		} catch {
			// Already granted from a prior run.
		}

		let messages: { kind: string; error?: string; body?: string }[] = [];
		try {
			await browser.waitUntil(
				async () => {
					messages = (await browser.execute(
						() => (window as unknown as { __e2eNetMessages: { kind: string }[] }).__e2eNetMessages
					)) as { kind: string; error?: string; body?: string }[];
					return messages.some((m) => m.kind === 'e2e-fetch-done' || m.kind === 'e2e-fetch-error');
				},
				{ timeout: 20000, timeoutMsg: 'network fetch never completed' }
			);
		} catch {
			const kinds = messages.map((m) => m.kind).join(', ');
			throw new Error(`network fetch never completed. captured messages: [${kinds}]`);
		}

		const done = messages.find((m) => m.kind === 'e2e-fetch-done');
		expect(done?.body).toContain('Example Domain');

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
});
