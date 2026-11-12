import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// The AI chat reads examples/ as text. A `.css?raw` import breaks in the dev
// server (Vite serves real CSS when the request accepts text/css), so the
// files are bundled into one JS module instead.
function examplesModule(): Plugin {
	const id = 'virtual:odeko-examples';
	const resolved = `\0${id}`;
	const root = path.resolve('./examples');
	const files = (): string[] =>
		fs
			.readdirSync(root, { recursive: true, encoding: 'utf8' })
			.filter((file) => /\.(css|glsl|html|md)$/.test(file))
			.map((file) => file.split(path.sep).join('/'))
			.sort();
	return {
		name: 'odeko-examples',
		resolveId: (source) => (source === id ? resolved : undefined),
		load(loadId) {
			if (loadId !== resolved) return;
			const contents: Record<string, string> = {};
			for (const file of files()) {
				const full = path.join(root, file);
				this.addWatchFile(full);
				contents[file] = fs.readFileSync(full, 'utf8');
			}
			return `export default ${JSON.stringify(contents)};`;
		},
		handleHotUpdate({ file, server }) {
			if (!file.startsWith(root)) return;
			const module = server.moduleGraph.getModuleById(resolved);
			if (module) server.moduleGraph.invalidateModule(module);
		}
	};
}

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
	plugins: [svelte({ compilerOptions: { runes: true } }), tailwindcss(), examplesModule()],
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib')
		},
		conditions: process.env.VITEST ? ['browser'] : undefined
	},
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
		watch: {
			ignored: ['**/src-tauri/**']
		}
	},
	envPrefix: ['VITE_', 'TAURI_ENV_*'],
	build: {
		target: process.env.TAURI_ENV_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
		minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
		sourcemap: !!process.env.TAURI_ENV_DEBUG
	},
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
		setupFiles: ['./src/test-setup.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/**/*.d.ts']
		}
	}
});
