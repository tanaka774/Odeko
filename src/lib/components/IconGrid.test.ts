import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args)
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

import IconGrid from './IconGrid.svelte';

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
	]
};

beforeEach(() => {
	invokeMock.mockReset();
	invokeMock.mockImplementation((cmd: string) => {
		if (cmd === 'load_active_layout') return Promise.resolve(layout);
		if (cmd === 'update_icon_shortcuts') return Promise.resolve();
		return Promise.resolve();
	});
});

afterEach(cleanup);

function iconWrappers(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>('.icon-wrapper'));
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

describe('IconGrid', () => {
	it('renders icons at the positions from the loaded layout', async () => {
		const { container } = render(IconGrid, {
			isEditMode: false,
			onEnterEditMode: () => {},
			onExitEditMode: () => {}
		});

		await waitFor(() => expect(iconWrappers(container).length).toBe(2));

		const [first] = iconWrappers(container);
		expect(first.style.left).toBe('100px');
		expect(first.style.top).toBe('100px');
	});

	it('cancel restores an icon position changed during the edit session', async () => {
		const { container, component } = render(IconGrid, {
			isEditMode: true,
			onEnterEditMode: () => {},
			onExitEditMode: () => {}
		});
		await waitFor(() => expect(iconWrappers(container).length).toBe(2));

		component.enterEditMode();

		// Drag the first icon from inside it (110,110) to (170,150); the
		// pointer offset makes it land at (160,140).
		const appIcon = container.querySelector<HTMLElement>('.icon-wrapper .app-icon')!;
		dragIcon(appIcon, { x: 110, y: 110 }, { x: 170, y: 150 });

		const [first] = iconWrappers(container);
		await waitFor(() => expect(first.style.left).toBe('160px'));
		expect(first.style.top).toBe('140px');

		// Cancel must restore the original position.
		await component.cancelEditMode();
		await waitFor(() => expect(first.style.left).toBe('100px'));
		expect(first.style.top).toBe('100px');
	});

	it('does not persist when cancel is used', async () => {
		const { container, component } = render(IconGrid, {
			isEditMode: true,
			onEnterEditMode: () => {},
			onExitEditMode: () => {}
		});
		await waitFor(() => expect(iconWrappers(container).length).toBe(2));

		component.enterEditMode();
		const appIcon = container.querySelector<HTMLElement>('.icon-wrapper .app-icon')!;
		dragIcon(appIcon, { x: 110, y: 110 }, { x: 170, y: 150 });
		await waitFor(() => expect(iconWrappers(container)[0].style.left).toBe('160px'));

		await component.cancelEditMode();

		expect(invokeMock).not.toHaveBeenCalledWith('save_active_layout', expect.anything());
	});

	it('persists the new position when save and exit is used', async () => {
		const { container, component } = render(IconGrid, {
			isEditMode: true,
			onEnterEditMode: () => {},
			onExitEditMode: () => {}
		});
		await waitFor(() => expect(iconWrappers(container).length).toBe(2));

		component.enterEditMode();
		const appIcon = container.querySelector<HTMLElement>('.icon-wrapper .app-icon')!;
		dragIcon(appIcon, { x: 110, y: 110 }, { x: 170, y: 150 });
		await waitFor(() => expect(iconWrappers(container)[0].style.left).toBe('160px'));

		await component.saveAndExit();

		expect(invokeMock).toHaveBeenCalledWith(
			'save_active_layout',
			expect.objectContaining({
				icons: expect.arrayContaining([expect.objectContaining({ id: 'terminal', x: 160, y: 140 })])
			})
		);
	});

	it('right-click menu renders portaled into document.body and closes via overlay/Escape', async () => {
		const { container, component } = render(IconGrid, {
			isEditMode: true,
			onEnterEditMode: () => {},
			onExitEditMode: () => {}
		});
		await waitFor(() => expect(iconWrappers(container).length).toBe(2));
		component.enterEditMode();

		const appIcon = container.querySelector<HTMLElement>('.icon-wrapper .app-icon')!;
		fireEvent.contextMenu(appIcon, { clientX: 115, clientY: 118, button: 2 });
		await waitFor(() => expect(document.body.querySelector('.context-menu')).toBeTruthy());

		// Portaled into <body> with viewport coordinates, so it escapes the
		// icon's stacking context (the original z-index bug).
		const menu = document.body.querySelector<HTMLElement>('.context-menu')!;
		expect(document.body.contains(menu)).toBe(true);
		expect(menu.parentElement).not.toBe(container);
		expect(menu.closest('.icon-wrapper')).toBeNull();
		expect(menu.style.left).toBe('115px');
		expect(menu.style.top).toBe('118px');

		// The full-screen overlay closes it on an outside click.
		const overlay = document.body.querySelector<HTMLElement>('.context-menu-overlay')!;
		fireEvent.click(overlay);
		await waitFor(() => expect(document.body.querySelector('.context-menu')).toBeNull());

		// Escape closes it too.
		fireEvent.contextMenu(appIcon, { clientX: 115, clientY: 118, button: 2 });
		await waitFor(() => expect(document.body.querySelector('.context-menu')).toBeTruthy());
		fireEvent.keyDown(window, { key: 'Escape' });
		await waitFor(() => expect(document.body.querySelector('.context-menu')).toBeNull());
	});
});
