import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn(),
	convertFileSrc: (path: string) => `asset://localhost${path}`
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
	readFile: vi.fn()
}));

import AppIcon from './AppIcon.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

const icon = {
	id: 'icon-1',
	name: 'Test App',
	path: '/usr/bin/test',
	icon_type: 'app' as const,
	x: 0,
	y: 0,
	width: 80,
	height: 80
};

beforeEach(() => {
	settingsStore.resetToDefaults();
});

afterEach(cleanup);

describe('AppIcon appearance', () => {
	function root(): HTMLElement {
		return document.querySelector('.app-icon') as HTMLElement;
	}

	function renderIcon(iconOverrides: Record<string, unknown> = {}) {
		return render(AppIcon, {
			icon: { ...icon, ...iconOverrides },
			isEditMode: false,
			onDragStart: vi.fn(),
			onPositionChange: vi.fn(),
			onSizeChange: vi.fn(),
			onIconChange: vi.fn(),
			onOpenSettings: vi.fn(),
			onOpenSettingsFromViewMode: vi.fn(),
			onEnterEditMode: vi.fn(),
			onSelect: vi.fn(),
			onStartGroupDrag: vi.fn(),
			onBringToFront: vi.fn(),
			onSendToBack: vi.fn(),
			onRemove: vi.fn(),
			onDraggingChange: vi.fn()
		});
	}

	it('sets the default icon appearance variables', () => {
		renderIcon();

		const style = root().style;
		expect(style.getPropertyValue('--appearance-background')).toBe('rgba(255, 255, 255, 0.2)');
		expect(style.getPropertyValue('--appearance-border')).toBe('none');
		// Unstamped icons fall back to the base default; real icons get the
		// corner radius stamped onto them at creation (IconGrid).
		expect(style.getPropertyValue('--appearance-border-radius')).toBe('12px');
		expect(style.getPropertyValue('--appearance-text-color')).toBe('#ffffff');
		expect(style.getPropertyValue('--appearance-padding')).toBe('8px');
		expect(style.getPropertyValue('--appearance-opacity')).toBe('1');
	});

	it('applies an explicit icon appearance over the defaults', () => {
		renderIcon({
			appearance: {
				backgroundColor: 'rgba(10, 20, 30, 0.5)',
				backgroundOpacity: 0.5,
				borderRadius: 18,
				padding: 14,
				opacity: 0.8
			}
		});

		const style = root().style;
		expect(style.getPropertyValue('--appearance-background')).toBe('rgba(10, 20, 30, 0.5)');
		expect(style.getPropertyValue('--appearance-border-radius')).toBe('18px');
		expect(style.getPropertyValue('--appearance-padding')).toBe('14px');
		expect(style.getPropertyValue('--appearance-opacity')).toBe('0.8');
	});

	it('uses no padding for image icons by default', () => {
		renderIcon({ icon_type: 'image' });

		expect(root().style.getPropertyValue('--appearance-padding')).toBe('0px');
	});

	it('does not restyle an existing icon when the default appearance changes', () => {
		// The default appearance is a creation-time template, not a live
		// layer: changing it (or the legacy panel radius) leaves items that
		// already exist untouched.
		settingsStore.updateSettings({
			default_appearance: { borderRadius: 36 },
			border_radius: 8
		});

		renderIcon();

		expect(root().style.getPropertyValue('--appearance-border-radius')).toBe('12px');
	});
});
