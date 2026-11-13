import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser } from '@wdio/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const appBinary =
	process.env.APP_BINARY || path.join(__dirname, '..', 'src-tauri', 'target', 'debug', 'odeko');

// The suite expects a canvas with the widgets it exercises. Seed it into a
// throwaway config home (XDG_CONFIG_HOME) before the app starts; without one
// the developer's real presets would be overwritten.
const configHome = process.env.XDG_CONFIG_HOME;
if (configHome) {
	const appConfigDir = path.join(configHome, 'odeko');
	fs.mkdirSync(path.join(appConfigDir, 'presets'), { recursive: true });
	fs.copyFileSync(
		path.join(__dirname, 'test', 'fixtures', 'default-preset.json'),
		path.join(appConfigDir, 'presets', 'Default.json')
	);
	fs.writeFileSync(
		path.join(appConfigDir, 'config.json'),
		JSON.stringify({ active_preset: 'Default' })
	);
}

export const config: WebdriverIO.Config = {
	runner: 'local',

	specs: ['./test/specs/**/*.e2e.ts'],
	maxInstances: 1,

	capabilities: [
		{
			browserName: 'tauri',
			'tauri:options': {
				application: appBinary
			}
		} as unknown as WebdriverIO.Capabilities
	],

	services: [
		[
			'@wdio/tauri-service',
			{
				appBinaryPath: appBinary,
				driverProvider: 'embedded',
				embeddedPort: 4445,
				captureFrontendLogs: true,
				commandTimeout: 60000,
				startTimeout: 60000
			}
		]
	],

	framework: 'mocha',
	mochaOpts: {
		ui: 'bdd',
		timeout: 120000
	},

	reporters: ['spec'],

	waitforTimeout: 20000,
	connectionRetryTimeout: 120000,
	connectionRetryCount: 3,
	logLevel: 'info',

	/** WebKitGTK throttles transitions and rAF in the unfocused E2E window, so
	 * style assertions would read the animation's start value forever. */
	async before() {
		await browser.execute(() => {
			const style = document.createElement('style');
			style.id = 'e2e-no-motion';
			style.textContent =
				'*, *::before, *::after { transition: none !important; animation: none !important; }';
			document.head.appendChild(style);
		});
	}
};
