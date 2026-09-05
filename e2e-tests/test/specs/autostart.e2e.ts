import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { $, browser, expect } from '@wdio/globals';
import { openSettingsModal } from '../helpers';

const AUTOSTART_DIR = path.join(os.homedir(), '.config', 'autostart');

/**
 * The XDG autostart entry that points at Odeko, if one exists — the
 * tauri-plugin-autostart `.desktop` file under ~/.config/autostart.
 */
function findOdekoAutostartEntry(): string | null {
	if (!fs.existsSync(AUTOSTART_DIR)) return null;
	for (const file of fs.readdirSync(AUTOSTART_DIR)) {
		if (!file.endsWith('.desktop')) continue;
		const entry = path.join(AUTOSTART_DIR, file);
		if (/odeko/i.test(fs.readFileSync(entry, 'utf8'))) return entry;
	}
	return null;
}

function waitForOdekoAutostartEntry(expected: boolean) {
	return browser.waitUntil(() => (findOdekoAutostartEntry() !== null) === expected, {
		timeout: 10000,
		timeoutMsg: expected
			? 'expected an Odeko autostart entry on disk'
			: 'expected the Odeko autostart entry to be gone'
	});
}

/**
 * The "Launch Odeko at login" checkbox lives in the Startup section of the
 * settings modal's Appearance tab.
 */
async function launchAtLoginCheckbox() {
	const section = await (await $('h3=Startup')).parentElement();
	return section.$('input[type="checkbox"]');
}

/** Click the checkbox through the page (real clicks on checkboxes are
 * unreliable under WebKitGTK's WebDriver synthesis, same as icon dragging). */
async function clickLaunchAtLoginCheckbox() {
	await browser.execute(() => {
		const heading = [...document.querySelectorAll('h3')].find(
			(h) => h.textContent?.trim() === 'Startup'
		);
		const input = heading?.parentElement?.querySelector<HTMLInputElement>('input[type="checkbox"]');
		if (!input) throw new Error('Launch at login checkbox not found');
		input.click();
	});
}

describe('autostart', () => {
	it('registers and removes the login-launch entry through the settings toggle', async function () {
		if (process.platform !== 'linux') {
			// The plugin stores the entry per OS (registry / LaunchAgent /
			// XDG autostart); this spec asserts the XDG file.
			this.skip();
		}

		await (await $('.icon-grid')).waitForExist({ timeout: 15000 });

		// Start from a known-off state (the suite may run on a machine that
		// had autostart enabled before this spec ran).
		await openSettingsModal();
		const checkbox = await launchAtLoginCheckbox();
		if (await checkbox.isSelected()) {
			await clickLaunchAtLoginCheckbox();
			await browser.waitUntil(async () => !(await checkbox.isSelected()), {
				timeout: 10000,
				timeoutMsg: 'checkbox did not turn off'
			});
			await waitForOdekoAutostartEntry(false);
		}

		// Enable: the checkbox ticks and an autostart .desktop entry appears.
		await clickLaunchAtLoginCheckbox();
		await browser.waitUntil(async () => (await launchAtLoginCheckbox()).isSelected(), {
			timeout: 10000,
			timeoutMsg: 'checkbox did not stay ticked after enabling'
		});
		await waitForOdekoAutostartEntry(true);
		const entry = findOdekoAutostartEntry()!;
		expect(fs.readFileSync(entry, 'utf8')).toMatch(/Exec=.*odeko/i);

		// The OS registration is the source of truth: reopening the modal
		// reads it back, so the checkbox must still be ticked.
		await (await $('button=Cancel')).click();
		await openSettingsModal();
		await browser.waitUntil(async () => (await launchAtLoginCheckbox()).isSelected(), {
			timeout: 10000,
			timeoutMsg: 'checkbox was not ticked after reopening the modal'
		});

		// Disable again and leave the machine clean for other specs.
		await clickLaunchAtLoginCheckbox();
		await waitForOdekoAutostartEntry(false);
		await (await $('button=Cancel')).click();
	});
});
