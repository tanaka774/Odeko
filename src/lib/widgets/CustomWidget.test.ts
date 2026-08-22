import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import CustomWidget from './CustomWidget.svelte';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args)
}));

afterEach(() => {
	cleanup();
	invokeMock.mockClear();
});

describe('CustomWidget', () => {
	it('renders the sanitized structure', () => {
		const { container } = render(CustomWidget, {
			config: { content: '<h1>Hello</h1><p>World</p>' }
		});

		const heading = container.querySelector('.custom-widget h1');
		expect(heading?.textContent).toBe('Hello');
		expect(container.querySelector('.custom-widget p')?.textContent).toBe('World');
	});

	it('strips script tags from the rendered DOM', () => {
		const { container } = render(CustomWidget, {
			config: { content: '<p>safe</p><script>window.hacked = true</script>' }
		});

		expect(container.querySelector('.custom-widget p')?.textContent).toBe('safe');
		expect(container.querySelector('.custom-widget script')).toBeNull();
	});

	it('shows a placeholder when the content is empty', () => {
		const { container } = render(CustomWidget, { config: { content: '' } });

		expect(container.querySelector('.placeholder-text')).not.toBeNull();
		expect(container.querySelector('.html-content')).toBeNull();
	});

	it('applies the appearance variables on the root', () => {
		const { container } = render(CustomWidget, {
			config: {
				content: '<p>x</p>',
				appearance: {
					backgroundColor: 'rgba(10, 20, 30, 0.5)',
					backgroundOpacity: 0.5,
					textColor: 'rgb(200, 210, 220)',
					borderRadius: 18,
					padding: 14,
					opacity: 0.8
				}
			}
		});

		const root = container.querySelector('.custom-widget') as HTMLElement;
		expect(root.style.getPropertyValue('--appearance-background')).toBe('rgba(10, 20, 30, 0.5)');
		expect(root.style.getPropertyValue('--appearance-text-color')).toBe('rgb(200, 210, 220)');
		expect(root.style.getPropertyValue('--appearance-border-radius')).toBe('18px');
		expect(root.style.getPropertyValue('--appearance-padding')).toBe('14px');
		expect(root.style.getPropertyValue('--appearance-opacity')).toBe('0.8');
	});

	it('opens absolute links through open_url instead of navigating', async () => {
		const { container } = render(CustomWidget, {
			config: { content: '<a href="https://example.com/page">go</a>' }
		});

		const anchor = container.querySelector('.custom-widget a') as HTMLAnchorElement;
		await fireEvent.click(anchor);

		expect(invokeMock).toHaveBeenCalledWith('open_url', { url: 'https://example.com/page' });
	});

	it('lets fragment links scroll instead of opening the browser', async () => {
		const { container } = render(CustomWidget, {
			config: { content: '<a href="#section">jump</a>' }
		});

		const anchor = container.querySelector('.custom-widget a') as HTMLAnchorElement;
		await fireEvent.click(anchor);

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it('renders sandboxed iframes with full documents, but not remote ones', () => {
		const srcdoc =
			"<style>body { color: #222; }</style><div id='t'>25:00</div><button onclick='go(25)'>Focus</button><script>function go(m) {}</script>";
		const { container } = render(CustomWidget, {
			config: {
				content: `<iframe srcdoc="${srcdoc}" sandbox="allow-scripts allow-same-origin"></iframe><iframe src="https://example.com" sandbox="allow-scripts"></iframe>`
			}
		});

		const iframes = container.querySelectorAll('.custom-widget iframe');
		expect(iframes).toHaveLength(1);
		expect(iframes[0].getAttribute('srcdoc')).toBe(srcdoc);
		expect(iframes[0].getAttribute('sandbox')).toBe('allow-scripts');
	});

	it('shows consent prompt and fetches when a sandboxed iframe requests a host', async () => {
		invokeMock.mockResolvedValue({ status: 200, body: '{"ok":true}' });
		const srcdoc =
			"<script>parent.postMessage({kind:'widget-fetch', id:1, url:'https://api.example.com/x'}, '*')</script>";
		const { container } = render(CustomWidget, {
			widgetId: 'w1',
			config: { content: `<iframe sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe>` }
		});

		const iframe = container.querySelector('.custom-widget iframe') as HTMLIFrameElement;
		expect(iframe).not.toBeNull();

		// Simulate the iframe's fetch request reaching the parent window.
		window.dispatchEvent(
			new MessageEvent('message', {
				source: iframe.contentWindow,
				origin: 'null',
				data: { kind: 'widget-fetch', id: 1, url: 'https://api.example.com/x' }
			})
		);

		await waitFor(() => {
			expect(container.querySelector('.net-prompt')).not.toBeNull();
		});

		await fireEvent.click(container.querySelector('.net-prompt-allow') as HTMLElement);

		await waitFor(() => {
			expect(invokeMock).toHaveBeenCalledWith(
				'widget_fetch',
				expect.objectContaining({ url: 'https://api.example.com/x' })
			);
		});
	});
});
