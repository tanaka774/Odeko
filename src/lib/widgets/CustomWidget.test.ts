import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/svelte';

const invokeMock = vi.fn(
	async (command: string): Promise<unknown> =>
		command === 'library_base_url' ? 'http://127.0.0.1:1/lib/t/' : null
);
vi.mock('@tauri-apps/api/core', () => ({
	invoke: (command: string) => invokeMock(command),
	convertFileSrc: (path: string) => path
}));

import CustomWidget from './CustomWidget.svelte';

afterEach(() => {
	cleanup();
	invokeMock.mockClear();
});

function frameOf(container: HTMLElement) {
	return container.querySelector('.custom-widget iframe') as HTMLIFrameElement;
}

describe('CustomWidget', () => {
	it('renders the page in a scripts-only sandbox', async () => {
		const { container } = render(CustomWidget, {
			widgetId: 'w1',
			config: { content: '<h1>Hello</h1><script>1</script>' }
		});
		const frame = frameOf(container);
		expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
		await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('<h1>Hello</h1>'));
		expect(frame.getAttribute('srcdoc')).toContain('window.odeko');
		expect(frame.getAttribute('srcdoc')).not.toContain('Content-Security-Policy');
	});

	it('blocks page scripts when scripts are off', async () => {
		const { container } = render(CustomWidget, {
			config: { content: '<p>x</p>', scripts: false }
		});
		await waitFor(() =>
			expect(frameOf(container).getAttribute('srcdoc')).toContain('Content-Security-Policy')
		);
		expect(container.querySelector('.custom-widget')?.hasAttribute('data-scripts')).toBe(false);
	});

	it('covers the page in edit mode so it can be dragged', () => {
		const { container } = render(CustomWidget, { config: { content: '' }, isEditMode: true });
		expect(container.querySelector('.edit-cover')).not.toBeNull();
	});

	it('applies the appearance variables on the root', () => {
		const { container } = render(CustomWidget, {
			config: {
				content: '<p>x</p>',
				appearance: {
					backgroundColor: 'rgba(10, 20, 30, 0.5)',
					backgroundOpacity: 0.5,
					padding: 14
				}
			}
		});
		const root = container.querySelector('.custom-widget') as HTMLElement;
		expect(root.style.getPropertyValue('--appearance-background')).toBe('rgba(10, 20, 30, 0.5)');
		expect(root.style.getPropertyValue('--appearance-padding')).toBe('14px');
	});

	it('loads a linked file instead of the stored content', async () => {
		invokeMock.mockImplementation(async (command: string) => {
			if (command === 'text_file_modified') return 1;
			if (command === 'read_text_file') return { content: '<p>from file</p>', modified: 1 };
			return null;
		});
		const { container } = render(CustomWidget, {
			config: { content: '<p>stored</p>', file: '/x/w.html', watch: true, scripts: false }
		});
		await waitFor(() =>
			expect(frameOf(container).getAttribute('srcdoc')).toContain('<p>from file</p>')
		);
		expect(container.querySelector('.custom-widget')?.hasAttribute('data-linked')).toBe(true);
	});
});
