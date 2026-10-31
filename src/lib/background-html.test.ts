import { describe, it, expect } from 'vitest';
import { buildSrcdoc, rewriteLibraryUrls } from './background-html';

const BASE = 'http://127.0.0.1:1234/lib/tok/';

describe('rewriteLibraryUrls', () => {
	it('routes script src, imports and import maps through the cache', () => {
		const source = `<script src="https://cdn.example.com/p5.js"></script>
<script type="importmap">{ "imports": { "three": "https://cdn.example.com/three.js" } }</script>
<script type="module">
import x from 'https://esm.sh/x';
import 'https://esm.sh/side';
const y = await import("https://esm.sh/y");
</script>`;
		const out = rewriteLibraryUrls(source, BASE);
		expect(out).toContain(`src="${BASE}cdn.example.com/p5.js"`);
		expect(out).toContain(`"three": "${BASE}cdn.example.com/three.js"`);
		expect(out).toContain(`from '${BASE}esm.sh/x'`);
		expect(out).toContain(`import '${BASE}esm.sh/side'`);
		expect(out).toContain(`import("${BASE}esm.sh/y")`);
	});

	it('leaves other https URLs alone', () => {
		const source = `<img src="https://example.com/a.png"><a href="https://example.com">x</a>`;
		expect(rewriteLibraryUrls(source, BASE)).toBe(source);
	});
});

describe('buildSrcdoc', () => {
	it('puts the helper before the page and routes libraries when scripts are on', () => {
		const out = buildSrcdoc('<script src="https://cdn.example.com/a.js"></script>', true, BASE);
		expect(out.startsWith('<!doctype html><script nonce=')).toBe(true);
		expect(out).toContain('window.odeko');
		expect(out).toContain(`src="${BASE}cdn.example.com/a.js"`);
		expect(out).not.toContain('Content-Security-Policy');
	});

	it('lets only the helper run when scripts are off', () => {
		const source = '<script src="https://cdn.example.com/a.js"></script>';
		const out = buildSrcdoc(source, false, BASE);
		const nonce = out.match(/'nonce-([^']+)'/)?.[1];
		expect(nonce).toBeTruthy();
		expect(out).toContain(`<script nonce="${nonce}">`);
		expect(out.endsWith(source)).toBe(true);
	});
});
