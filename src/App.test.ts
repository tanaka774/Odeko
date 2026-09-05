import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

const invokeMock = vi.fn();
const getCurrentWindowMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args)
}));
vi.mock('@tauri-apps/api/window', () => ({
	getCurrentWindow: () => getCurrentWindowMock()
}));
vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn().mockResolvedValue(() => {})
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
	confirm: vi.fn(),
	open: vi.fn(),
	save: vi.fn()
}));
vi.mock('fabric', () => ({
	Canvas: class {},
	PencilBrush: class {}
}));

import App from './App.svelte';

const layout = {
	icons: [
		{
			id: 'terminal',
			name: 'Terminal',
			path: 'alacritty',
			icon_type: 'app',
			x: 100,
			y: 100,
			width: 80,
			height: 80
		},
		{
			id: 'browser',
			name: 'Firefox',
			path: 'firefox',
			icon_type: 'app',
			x: 200,
			y: 100,
			width: 80,
			height: 80
		}
	],
	settings: null,
	active_preset: null
};

beforeEach(() => {
	invokeMock.mockReset();
	invokeMock.mockImplementation((cmd: string) => {
		if (cmd === 'load_active_layout') return Promise.resolve(layout);
		if (cmd === 'get_platform') return Promise.resolve('linux');
		return Promise.resolve();
	});
	getCurrentWindowMock.mockReset();
	getCurrentWindowMock.mockReturnValue({
		hide: vi.fn(),
		show: vi.fn(),
		setFocus: vi.fn()
	});
});

afterEach(cleanup);

function iconWrappers(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>('.icon-wrapper'));
}

function pressEditModeKeybind() {
	window.dispatchEvent(
		new KeyboardEvent('keydown', {
			code: 'F2',
			key: 'F2',
			bubbles: true,
			cancelable: true
		})
	);
}

function dragIcon(
	appIcon: HTMLElement,
	from: { x: number; y: number },
	to: { x: number; y: number }
) {
	fireEvent.pointerDown(appIcon, { clientX: from.x, clientY: from.y, button: 0, pointerId: 1 });
	fireEvent.pointerMove(appIcon, { clientX: to.x, clientY: to.y, pointerId: 1 });
	fireEvent.pointerUp(appIcon, { pointerId: 1 });
}

describe('App edit-mode keybind', () => {
	it('enters edit mode when the keybind is pressed', async () => {
		const { container } = render(App);

		await waitFor(() => expect(iconWrappers(container).length).toBe(2));
		expect(container.querySelector('.floating-toolbar')).toBeNull();

		pressEditModeKeybind();

		await waitFor(() => expect(container.querySelector('.floating-toolbar')).toBeTruthy());
	});

	it('saves the session when leaving edit mode with the keybind', async () => {
		const { container } = render(App);

		await waitFor(() => expect(iconWrappers(container).length).toBe(2));

		pressEditModeKeybind();
		await waitFor(() => expect(container.querySelector('.floating-toolbar')).toBeTruthy());

		// Drag the first icon from inside it (110,110) to (170,150); the
		// pointer offset makes it land at (160,140).
		const appIcon = container.querySelector<HTMLElement>('.icon-wrapper .app-icon')!;
		dragIcon(appIcon, { x: 110, y: 110 }, { x: 170, y: 150 });

		const [first] = iconWrappers(container);
		await waitFor(() => expect(first.style.left).toBe('160px'));

		pressEditModeKeybind();

		await waitFor(() => expect(container.querySelector('.floating-toolbar')).toBeNull());

		expect(invokeMock).toHaveBeenCalledWith(
			'save_active_layout',
			expect.objectContaining({
				icons: expect.arrayContaining([expect.objectContaining({ id: 'terminal', x: 160, y: 140 })])
			})
		);
	});

	it('does not persist when leaving edit mode with the keybind and nothing changed', async () => {
		const { container } = render(App);

		await waitFor(() => expect(iconWrappers(container).length).toBe(2));

		pressEditModeKeybind();
		await waitFor(() => expect(container.querySelector('.floating-toolbar')).toBeTruthy());

		pressEditModeKeybind();
		await waitFor(() => expect(container.querySelector('.floating-toolbar')).toBeNull());

		expect(invokeMock).not.toHaveBeenCalledWith('save_active_layout', expect.anything());
	});
});
