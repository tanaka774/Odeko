import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const appBinary =
	process.env.APP_BINARY || path.join(__dirname, '..', 'src-tauri', 'target', 'debug', 'odeko');

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
	logLevel: 'info'
};
