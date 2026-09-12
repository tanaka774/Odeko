import { $, browser, expect } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import { enterEditMode } from '../helpers';

const SHOT_DIR = 'screenshots';
mkdirSync(SHOT_DIR, { recursive: true });

// Chosen per run so the spec is idempotent: the app config persists between
// runs, so a fixed color could already be stored.
let systemAccent = '#ff0000';
let systemAccentRgb = 'rgb(255, 0, 0)';

interface StoredModalAppearance {
	global?: { accentColor?: string };
	modals?: Record<string, { accentColor?: string; radius?: number; surfaceColor?: string }>;
}

/** Right-click a widget and choose "Open Settings..." from the menu. */
async function openWidgetSettings(widgetSelector: string) {
	await browser.execute((selector) => {
		const widget = document.querySelector<HTMLElement>(selector)?.closest('.draggable-widget') as
			| HTMLElement
			| undefined;
		if (!widget) throw new Error(`widget not found: ${selector}`);
		widget.dispatchEvent(
			new MouseEvent('contextmenu', {
				bubbles: true,
				cancelable: true,
				clientX: 200,
				clientY: 200
			})
		);
	}, widgetSelector);

	const openSettings = await $('button=Open Settings...');
	await openSettings.waitForExist({ timeout: 10000 });
	await openSettings.click();
	await (await $('[role="dialog"]')).waitForExist({ timeout: 10000 });
}

/** WebDriver typing is unreliable on WebKitGTK; drive the native setter. */
async function setInput(selector: string, value: string) {
	await browser.execute(
		(sel, val) => {
			const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
			if (!el) throw new Error(`input not found: ${sel}`);
			const proto =
				el instanceof HTMLTextAreaElement
					? HTMLTextAreaElement.prototype
					: HTMLInputElement.prototype;
			Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, val);
			el.dispatchEvent(new Event('input', { bubbles: true }));
		},
		selector,
		value
	);
}

async function readModalChrome() {
	return browser.execute(() => {
		const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
		const content = dialog?.querySelector<HTMLElement>('.modal-content');
		const save = dialog?.querySelector<HTMLElement>('.save-btn');
		if (!content || !save) throw new Error('modal chrome not found');
		const contentStyle = getComputedStyle(content);
		return {
			accent: getComputedStyle(save).backgroundColor,
			radius: contentStyle.borderRadius,
			surface: contentStyle.backgroundColor
		};
	});
}

/** Close a dialog left open by a previous (possibly failed) test. */
/** Computed metrics of the open dialog, used to prove the scale knob works. */
async function readMetrics() {
	return browser.execute(() => {
		const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
		if (!dialog) throw new Error('no dialog open');
		const pick = (selector: string) => dialog.querySelector<HTMLElement>(selector);
		const header = pick('.modal-header');
		const label = pick('.modal-title');
		const tab = pick('.tab-btn');
		const body = pick('.modal-body');
		if (!header || !label || !tab || !body) throw new Error('chrome element missing');
		return {
			headerPadTop: parseFloat(getComputedStyle(header).paddingTop),
			bodyPadLeft: parseFloat(getComputedStyle(body).paddingLeft),
			titleFont: parseFloat(getComputedStyle(label).fontSize),
			tabFont: parseFloat(getComputedStyle(tab).fontSize),
			tabPadTop: parseFloat(getComputedStyle(tab).paddingTop),
			tabHeight: tab.getBoundingClientRect().height
		};
	});
}

async function closeAnyDialog() {
	const open = await browser.execute(
		() => document.querySelector('[role="dialog"][aria-modal="true"]') !== null
	);
	if (!open) return;
	await browser.execute(() => {
		const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
		const cancel = Array.from(dialog?.querySelectorAll('button') ?? []).find(
			(button) => button.textContent?.trim() === 'Cancel'
		);
		cancel?.click();
	});
	await browser.waitUntil(
		async () =>
			await browser.execute(
				() => document.querySelector('[role="dialog"][aria-modal="true"]') === null
			),
		{ timeout: 5000 }
	);
}

async function closeModal() {
	await (await $('button[aria-label="Close"]')).click();
	await browser.waitUntil(
		async () =>
			await browser.execute(
				() => document.querySelector('[role="dialog"][aria-modal="true"]') === null
			),
		{ timeout: 10000 }
	);
}

async function storedModalAppearance(): Promise<StoredModalAppearance | null> {
	return browser.execute(async () => {
		const tauri = (window as unknown as { __TAURI__?: { core: { invoke: Function } } }).__TAURI__;
		if (!tauri) throw new Error('global Tauri API unavailable');
		const layout = await tauri.core.invoke('load_active_layout');
		return layout.settings.modal_appearance ?? null;
	});
}

describe('Settings modal appearance', () => {
	it('styles one modal from its gear button and persists it to disk', async () => {
		await browser.waitUntil(async () => (await browser.getTitle()) === 'Odeko', {
			timeout: 15000
		});
		await (await $('.system-widget')).waitForExist({ timeout: 15000 });
		await closeAnyDialog();

		await enterEditMode();
		await openWidgetSettings('.system-widget');

		const before = await readModalChrome();
		// Flip between two colors so the assertions hold on a config that
		// already carries an override from a previous run.
		if (before.accent === 'rgb(255, 0, 0)') {
			systemAccent = '#0000ff';
			systemAccentRgb = 'rgb(0, 0, 255)';
		}
		await browser.saveScreenshot(`${SHOT_DIR}/modal-appearance-before.png`);

		// The gear opens the in-place appearance panel.
		await (await $('button[aria-label="Modal appearance"]')).click();
		await (await $('#modal-accentColor')).waitForExist({ timeout: 10000 });

		// A previous run may have stored custom CSS for this dialog; it wins
		// over the built-in knobs, so turn it off first.
		await browser.execute(() => {
			const checkbox = document.querySelector<HTMLInputElement>('#modal-custom-css-enabled');
			if (checkbox?.checked) checkbox.click();
		});

		await setInput('#modal-accentColor', systemAccent);
		await setInput('#modal-surfaceColor', '#102030');
		await setInput('#modal-radius', '4');

		// Live preview: the dialog restyles before anything is saved.
		await browser.waitUntil(async () => (await readModalChrome()).accent === systemAccentRgb, {
			timeout: 5000,
			timeoutMsg: 'accent change did not preview live'
		});
		const live = await readModalChrome();
		expect(live.radius).toBe('4px');
		expect(live.surface).toBe('rgba(16, 32, 48, 0.95)');
		await browser.saveScreenshot(`${SHOT_DIR}/modal-appearance-live-preview.png`);

		await (await $('button=Save Changes')).click();
		await browser.waitUntil(
			async () =>
				await browser.execute(
					() => document.querySelector('[role="dialog"][aria-modal="true"]') === null
				),
			{ timeout: 10000 }
		);

		// Persisted through the Rust round-trip, stored sparse.
		await browser.waitUntil(
			async () => (await storedModalAppearance())?.modals?.system?.accentColor === systemAccent,
			{ timeout: 10000, timeoutMsg: 'modal appearance was not persisted to disk' }
		);
		const stored = await storedModalAppearance();
		expect(stored?.modals?.system?.surfaceColor).toBe('#102030');
		expect(stored?.modals?.system?.radius).toBe(4);

		// Reopening shows the saved look.
		await openWidgetSettings('.system-widget');
		const reopened = await readModalChrome();
		expect(reopened.accent).toBe(systemAccentRgb);
		expect(reopened.radius).toBe('4px');
		await browser.saveScreenshot(`${SHOT_DIR}/modal-appearance-reopened.png`);
		await closeModal();

		// A different dialog is untouched by the per-modal override.
		await openWidgetSettings('.clock-widget');
		const other = await readModalChrome();
		expect(other.accent).not.toBe(systemAccentRgb);
		expect(other.radius).not.toBe('4px');
		await closeModal();
	});

	it('sets a global default from the Modals tab that other dialogs inherit', async () => {
		await closeAnyDialog();
		const settingsButton = await $('button=Settings');
		await settingsButton.waitForExist({ timeout: 10000 });
		await settingsButton.click();
		await (await $('[role="dialog"]')).waitForExist({ timeout: 10000 });

		await (await $('button=Modals')).click();
		await (await $('#modal-target-select')).waitForExist({ timeout: 10000 });
		await (await $('#modal-target-select')).selectByVisibleText('All modals (default)');
		await (await $('#modal-accentColor')).waitForExist({ timeout: 10000 });

		await setInput('#modal-accentColor', '#00ff00');
		await setInput('#modal-radius', '2');

		// The canvas settings dialog previews the global default live.
		await browser.waitUntil(async () => (await readModalChrome()).accent === 'rgb(0, 255, 0)', {
			timeout: 5000,
			timeoutMsg: 'global default did not preview live'
		});
		const live = await readModalChrome();
		expect(live.radius).toBe('2px');
		await browser.saveScreenshot(`${SHOT_DIR}/modal-appearance-global-default.png`);

		// Leave the dialog on its default tab for the specs that follow.
		await (await $('button=Appearance')).click();
		await (await $('button=Save Changes')).click();
		await browser.waitUntil(
			async () =>
				await browser.execute(
					() => document.querySelector('[role="dialog"][aria-modal="true"]') === null
				),
			{ timeout: 10000 }
		);

		await browser.waitUntil(
			async () => (await storedModalAppearance())?.global?.accentColor === '#00ff00',
			{ timeout: 10000, timeoutMsg: 'global modal default was not persisted' }
		);
		const stored = await storedModalAppearance();
		expect(stored?.global?.radius).toBe(2);

		// A modal without an override follows the global default.
		await openWidgetSettings('.clock-widget');
		const clock = await readModalChrome();
		expect(clock.accent).toBe('rgb(0, 255, 0)');
		expect(clock.radius).toBe('2px');
		await browser.saveScreenshot(`${SHOT_DIR}/modal-appearance-global-inherited.png`);
		await closeModal();

		// The system modal keeps its own override on top of the global default.
		await openWidgetSettings('.system-widget');
		const system = await readModalChrome();
		expect(system.accent).toBe(systemAccentRgb);
		expect(system.radius).toBe('4px');
		await closeModal();
	});

	it('injects per-modal custom CSS scoped to that dialog', async () => {
		await closeAnyDialog();
		await openWidgetSettings('.system-widget');
		await (await $('button[aria-label="Modal appearance"]')).click();
		await (await $('#modal-custom-css-enabled')).waitForExist({ timeout: 10000 });

		await browser.execute(() => {
			const checkbox = document.querySelector<HTMLInputElement>('#modal-custom-css-enabled');
			if (!checkbox) throw new Error('custom css checkbox not found');
			if (!checkbox.checked) checkbox.click();
		});
		await setInput(
			'#modal-custom-css',
			'.modal-content { border-radius: 40px; }\n.modal-overlay { backdrop-filter: none; }'
		);

		await browser.waitUntil(
			async () =>
				(await browser.execute(() => {
					const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
					const content = dialog?.querySelector<HTMLElement>('.modal-content');
					return content ? getComputedStyle(content).borderRadius : '';
				})) === '40px',
			{ timeout: 5000, timeoutMsg: 'custom CSS was not applied' }
		);

		// The scope wrapper makes the overlay itself targetable too.
		const overlayFilter = await browser.execute(() => {
			const overlay = document.querySelector<HTMLElement>('[data-modal="system"] .modal-overlay');
			return overlay ? getComputedStyle(overlay).backdropFilter : '';
		});
		expect(overlayFilter).toBe('none');

		const injected = await browser.execute(
			() =>
				document.querySelector<HTMLStyleElement>('style[data-modal-css="system"]')?.textContent ??
				''
		);
		expect(injected).toContain('[data-modal="system"] .modal-content');
		await browser.saveScreenshot(`${SHOT_DIR}/modal-appearance-custom-css.png`);

		await (await $('button=Save Changes')).click();
		await browser.waitUntil(
			async () =>
				await browser.execute(
					() => document.querySelector('[role="dialog"][aria-modal="true"]') === null
				),
			{ timeout: 10000 }
		);
	});

	it('keeps default metrics and scales text plus spacing from the Text Size knob', async () => {
		await closeAnyDialog();
		await openWidgetSettings('.system-widget');
		await (await $('button[aria-label="Modal appearance"]')).click();
		await (await $('#modal-fontSize')).waitForExist({ timeout: 10000 });

		// Force the default so the exact-value assertions below are meaningful.
		await setInput('#modal-fontSize', '14');
		await (await $('button[aria-label="Modal appearance"]')).click();

		const base = await readMetrics();
		expect(base.headerPadTop).toBeCloseTo(10, 1);
		expect(base.bodyPadLeft).toBeCloseTo(16, 1);
		expect(base.titleFont).toBeCloseTo(20, 1);
		expect(base.tabFont).toBeCloseTo(15, 1);
		expect(base.tabPadTop).toBeCloseTo(9, 1);

		await (await $('button[aria-label="Modal appearance"]')).click();
		await setInput('#modal-fontSize', '20');
		await (await $('button[aria-label="Modal appearance"]')).click();

		await browser.waitUntil(async () => (await readMetrics()).titleFont > base.titleFont + 1, {
			timeout: 5000,
			timeoutMsg: 'text size did not scale the dialog'
		});

		const scaled = await readMetrics();
		const factor = 20 / 14;
		expect(scaled.titleFont).toBeCloseTo(20 * factor, 1);
		expect(scaled.headerPadTop).toBeCloseTo(10 * factor, 1);
		expect(scaled.bodyPadLeft).toBeCloseTo(16 * factor, 1);
		expect(scaled.tabFont).toBeCloseTo(15 * factor, 1);
		expect(scaled.tabPadTop).toBeCloseTo(9 * factor, 1);
		expect(scaled.tabHeight).toBeGreaterThan(base.tabHeight);
		await browser.saveScreenshot(`${SHOT_DIR}/modal-appearance-text-size-20px.png`);

		// Leave the stored config untouched.
		await closeModal();
	});

	it('covers the picker dialogs and lets them follow the global default', async () => {
		await closeAnyDialog();

		// Widget picker: content-sized dialog with no footer.
		await (await $('button=Add Widget')).click();
		await (await $('[data-modal="widget-picker"] .modal-overlay')).waitForExist({ timeout: 10000 });
		expect(
			await browser.execute(
				() =>
					document.querySelector<HTMLElement>('[data-modal="widget-picker"] .modal-footer') === null
			)
		).toBe(true);
		await (await $('button[aria-label="Modal appearance"]')).click();
		await (await $('#modal-radius')).waitForExist({ timeout: 10000 });
		await setInput('#modal-radius', '3');
		await browser.waitUntil(
			async () =>
				(await browser.execute(() => {
					const content = document.querySelector<HTMLElement>(
						'[data-modal="widget-picker"] .modal-content'
					);
					return content ? getComputedStyle(content).borderRadius : '';
				})) === '3px',
			{ timeout: 5000, timeoutMsg: 'widget picker did not restyle' }
		);
		await browser.saveScreenshot(`${SHOT_DIR}/modal-appearance-widget-picker.png`);
		await closeModal();

		// App picker: full-size dialog with a custom footer.
		await (await $('button=Add App')).click();
		await (await $('[data-modal="app-picker"] .modal-overlay')).waitForExist({ timeout: 10000 });
		const appPicker = await browser.execute(() => ({
			headers: document.querySelectorAll('[data-modal="app-picker"] [role="dialog"] .modal-header')
				.length,
			search: document.querySelector('[data-modal="app-picker"] .search-box input') !== null,
			rows: document.querySelectorAll('[data-modal="app-picker"] .app-item').length
		}));
		expect(appPicker.headers).toBe(1);
		expect(appPicker.search).toBe(true);
		await browser.saveScreenshot(`${SHOT_DIR}/modal-appearance-app-picker.png`);
		await closeModal();
	});

	it('covers the terminal dialog (shell-based modals all get the gear)', async () => {
		await closeAnyDialog();
		await openWidgetSettings('.terminal-widget');

		const key = await browser.execute(
			() => document.querySelector('[data-modal]')?.getAttribute('data-modal') ?? ''
		);
		expect(key).toBe('terminal');
		await (await $('button[aria-label="Modal appearance"]')).click();
		await (await $('#modal-accentColor')).waitForExist({ timeout: 10000 });
		await setInput('#modal-accentColor', '#7c3aed');

		await browser.waitUntil(
			async () =>
				(await browser.execute(() => {
					const save = document.querySelector<HTMLElement>(
						'[role="dialog"][aria-modal="true"] .save-btn'
					);
					return save ? getComputedStyle(save).backgroundColor : '';
				})) === 'rgb(124, 58, 237)',
			{ timeout: 5000, timeoutMsg: 'terminal dialog did not restyle' }
		);
		await browser.saveScreenshot(`${SHOT_DIR}/modal-appearance-terminal.png`);
		await closeModal();
	});
});
