import { describe, it, expect } from 'vitest';
import { sanitizeCustomHtml } from './custom-html';

describe('sanitizeCustomHtml', () => {
	it('keeps the allowed content structure', () => {
		const html =
			'<h1>Title</h1><p>Hello <strong>world</strong></p><table><tr><th>A</th></tr><tr><td>1</td></tr></table><ul><li>one</li></ul><pre><code>const x = 1;</code></pre><blockquote>quote</blockquote>';
		const result = sanitizeCustomHtml(html);

		expect(result).toContain('<h1>Title</h1>');
		expect(result).toContain('<strong>world</strong>');
		expect(result).toContain('<table>');
		expect(result).toContain('<ul><li>one</li></ul>');
		expect(result).toContain('<pre><code>const x = 1;</code></pre>');
		expect(result).toContain('<blockquote>quote</blockquote>');
	});

	it('strips script elements and their content', () => {
		const result = sanitizeCustomHtml('<p>ok</p><script>alert("xss")</script><p>end</p>');

		expect(result).toContain('<p>ok</p>');
		expect(result).toContain('<p>end</p>');
		expect(result).not.toContain('script');
		expect(result).not.toContain('alert');
	});

	it('strips inline event handlers', () => {
		const result = sanitizeCustomHtml('<div onclick="alert(1)">click</div>');

		expect(result).toBe('<div>click</div>');
	});

	it('strips javascript: hrefs but keeps the link text', () => {
		const result = sanitizeCustomHtml('<a href="javascript:alert(1)">harmless text</a>');

		expect(result).toBe('<a>harmless text</a>');
	});

	it('keeps https and mailto links and hardens them', () => {
		const result = sanitizeCustomHtml(
			'<a href="https://example.com">web</a><a href="mailto:a@b.c">mail</a>'
		);

		expect(result).toContain('href="https://example.com"');
		expect(result).toContain('target="_blank"');
		expect(result).toContain('rel="noopener noreferrer"');
		expect(result).toContain('href="mailto:a@b.c"');
	});

	it('leaves fragment links alone so in-widget anchors still work', () => {
		const result = sanitizeCustomHtml('<a href="#section">jump</a>');

		expect(result).toBe('<a href="#section">jump</a>');
	});

	it('strips style and link elements', () => {
		const result = sanitizeCustomHtml(
			'<style>body { color: red; }</style><link rel="stylesheet" href="x.css"><p>ok</p>'
		);

		expect(result).toBe('<p>ok</p>');
	});

	it('strips forms and form controls', () => {
		const result = sanitizeCustomHtml(
			'<form><input type="text"><button>go</button></form><textarea>t</textarea><select><option>a</option></select>'
		);

		expect(result).not.toContain('<form');
		expect(result).not.toContain('<input');
		expect(result).not.toContain('<button');
		expect(result).not.toContain('<textarea');
		expect(result).not.toContain('<select');
		expect(result).not.toContain('<option');
	});
	it('strips media elements and other dangerous tags', () => {
		const result = sanitizeCustomHtml(
			'<video src="https://example.com/m.mp4"></video><object data="x"></object><embed src="y"><meta http-equiv="refresh" content="0"><base href="https://evil.com">'
		);

		expect(result.trim()).toBe('');
	});

	it('removes iframes without a sandbox', () => {
		const result = sanitizeCustomHtml('<iframe srcdoc="<p>hi</p>"></iframe>');

		expect(result.trim()).toBe('');
	});

	it('keeps sandboxed srcdoc iframes but strips dangerous sandbox tokens', () => {
		const result = sanitizeCustomHtml(
			'<iframe srcdoc="<p>timer</p>" sandbox="allow-scripts allow-same-origin allow-top-navigation"></iframe>'
		);

		expect(result).toContain('srcdoc="<p>timer</p>"');
		expect(result).toContain('sandbox="allow-scripts"');
		expect(result).not.toContain('allow-same-origin');
		expect(result).not.toContain('allow-top-navigation');
	});

	it('removes sandboxed iframes that point at a remote src', () => {
		const result = sanitizeCustomHtml(
			'<iframe src="https://example.com" sandbox="allow-scripts"></iframe>'
		);

		expect(result.trim()).toBe('');
	});

	it('removes iframes whose sandbox only had unsafe tokens', () => {
		const result = sanitizeCustomHtml(
			'<iframe srcdoc="<p>x</p>" sandbox="allow-same-origin"></iframe>'
		);

		expect(result.trim()).toBe('');
	});

	it('keeps srcdoc documents containing style and script markup', () => {
		// DOMPurify's attribute-breakout guard strips attribute values that
		// contain </style>/</script> — a false positive for sandboxed srcdoc,
		// which is meant to hold a whole HTML document (e.g. a Pomodoro timer).
		// (Single quotes inside: the srcdoc value itself is double-quoted.)
		const srcdoc =
			"<style>body { color: #222; }</style><div id='t'>25:00</div><button onclick='go(25)'>Focus</button><script>function go(m) {}</script>";
		const result = sanitizeCustomHtml(
			`<iframe sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe>`
		);

		expect(result).toContain('srcdoc="');
		expect(result).toContain('</style>');
		expect(result).toContain('</script>');
		expect(result).toContain('sandbox="allow-scripts"');
	});

	it('still removes unsafe iframes whose srcdoc contains markup', () => {
		// The srcdoc restore must only apply to iframes that survive the
		// sandbox policy — a remote src or missing sandbox still drops them.
		const srcdoc = '<style>body {}</style><script>x()</script>';

		expect(sanitizeCustomHtml(`<iframe srcdoc="${srcdoc}"></iframe>`).trim()).toBe('');
		expect(
			sanitizeCustomHtml(
				`<iframe src="https://example.com" sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe>`
			).trim()
		).toBe('');
	});

	it('allows http(s), asset and data:image sources on images', () => {
		const result = sanitizeCustomHtml(
			'<img src="https://example.com/a.png"><img src="asset://localhost/icons/x.png"><img src="data:image/png;base64,AAAA">'
		);

		expect(result).toContain('src="https://example.com/a.png"');
		expect(result).toContain('src="asset://localhost/icons/x.png"');
		expect(result).toContain('src="data:image/png;base64,AAAA"');
	});

	it('strips javascript: and data:text/html sources on images', () => {
		const result = sanitizeCustomHtml(
			'<img src="javascript:alert(1)"><img src="data:text/html,<script>x</script>">'
		);

		expect(result).not.toContain('src=');
	});

	it('keeps the text content of unknown tags', () => {
		const result = sanitizeCustomHtml('<center>old school</center>');

		expect(result).toBe('old school');
	});

	it('returns an empty string for empty input', () => {
		expect(sanitizeCustomHtml('')).toBe('');
	});
});
