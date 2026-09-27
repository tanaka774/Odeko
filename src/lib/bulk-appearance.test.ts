import { describe, it, expect } from 'vitest';
import { mergeIconAppearance } from './bulk-appearance';
import type { CanvasIcon } from './icons';

function icon(overrides: Partial<CanvasIcon> = {}): CanvasIcon {
	return {
		id: 'item-1',
		name: 'Item',
		path: '',
		icon_type: 'image',
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		...overrides
	};
}

describe('mergeIconAppearance', () => {
	it('patches only the given properties on a canvas icon', () => {
		const merged = mergeIconAppearance(
			icon({ appearance: { backgroundColor: '#111111', padding: 0 } }),
			{ padding: 8 }
		);

		expect(merged.appearance).toEqual({ backgroundColor: '#111111', padding: 8 });
	});

	it('creates the appearance object when the icon has none', () => {
		expect(mergeIconAppearance(icon(), { opacity: 0.5 }).appearance).toEqual({ opacity: 0.5 });
	});

	it('merges into widget_config without dropping the other widget settings', () => {
		const merged = mergeIconAppearance(
			icon({
				icon_type: 'widget',
				widget_type: 'clock',
				widget_config: { format: '24h', appearance: { fontSize: 14, padding: 0 } }
			}),
			{ padding: 16 }
		);

		expect(merged.widget_config).toEqual({
			format: '24h',
			appearance: { fontSize: 14, padding: 16 }
		});
	});

	it('gives a widget an appearance object when its config has none', () => {
		const merged = mergeIconAppearance(
			icon({ icon_type: 'widget', widget_type: 'memo', widget_config: { content: 'note' } }),
			{ borderRadius: 4 }
		);

		expect(merged.widget_config).toEqual({
			content: 'note',
			appearance: { borderRadius: 4 }
		});
	});
});
