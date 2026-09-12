import { $, browser } from '@wdio/globals';

/**
 * Enter edit mode by dispatching the F2 keydown directly on `window`.
 * App.svelte listens via `<svelte:window on:keydown>` and toggles edit mode
 * when the key matches the toggle_edit keybind. This is more reliable than
 * WebDriver's key synthesis on WebKitGTK.
 */
export async function enterEditMode() {
	// Close dialogs left open by a previous (possibly failed) spec first.
	// Clicking Cancel goes through the app's own state, so a later open still
	// works; force-removing the node instead would leave the parent's
	// `isOpen` flag stuck at true and the dialog would never come back.
	await browser.execute(() => {
		document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach((el) => {
			const cancel = Array.from(el.querySelectorAll('button')).find(
				(button) => button.textContent?.trim() === 'Cancel'
			);
			cancel?.click();
		});
	});
	await browser.pause(200);

	// Remove any leftover overlays (Svelte's fade-out outro can hang when the
	// WebKitGTK window throttles rAF: the e2e window is unfocused). The app
	// ignores the F2 toggle while any `[role="dialog"][aria-modal="true"]`
	// exists, so clean them up.
	await browser.execute(() => {
		document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach((el) => el.remove());
	});

	// Ensure edit mode is ON. F2 *toggles* it, and a previous spec may have
	// left edit mode active (the app survives across specs in one run) — so
	// only dispatch F2 when the toolbar is not already present.
	const alreadyInEdit = await browser.execute(
		() => document.querySelector('.floating-toolbar') !== null
	);
	if (!alreadyInEdit) {
		await browser.execute(() => {
			window.dispatchEvent(
				new KeyboardEvent('keydown', {
					code: 'F2',
					key: 'F2',
					bubbles: true,
					cancelable: true
				})
			);
		});
	}
	// The toolbar only exists in edit mode.
	await (await $('.floating-toolbar')).waitForExist({ timeout: 10000 });
}

/**
 * Open the global settings modal: enter edit mode, then click the toolbar
 * Settings button.
 */
export async function openSettingsModal() {
	await enterEditMode();
	const settingsButton = await $('button=Settings');
	await settingsButton.waitForExist({ timeout: 10000 });
	await settingsButton.click();
	await (await $('.color-picker')).waitForExist({ timeout: 10000 });
}

/**
 * Drag the first icon by an (x, y) offset using synthetic PointerEvents.
 * WebKitGTK's WebDriver actions do not produce pointer events that the app's
 * onpointer* handlers respond to, so we dispatch them directly — same events
 * the app listens for, just without the OS input layer.
 */
export async function dragIconBy(dx: number, dy: number) {
	await browser.execute(
		(x: number, y: number) => {
			const el = document.querySelector('.icon-wrapper .app-icon') as HTMLElement;
			if (!el) throw new Error('icon not found');
			const rect = el.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			const opts = (clientX: number, clientY: number) => ({
				clientX,
				clientY,
				button: 0,
				pointerId: 1,
				bubbles: true,
				cancelable: true
			});
			el.dispatchEvent(new PointerEvent('pointerdown', opts(cx, cy)));
			el.dispatchEvent(new PointerEvent('pointermove', opts(cx + x, cy + y)));
			el.dispatchEvent(new PointerEvent('pointerup', opts(cx + x, cy + y)));
		},
		dx,
		dy
	);
}

/**
 * Set an input[type=color] value and fire the input event, because WebDriver's
 * typing does not work for color inputs.
 */
export async function setColorInput(value: string) {
	await browser.execute((v) => {
		const input = document.querySelector<HTMLInputElement>('.color-picker');
		if (!input) throw new Error('color input not found');
		const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
		setter?.call(input, v);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
}
