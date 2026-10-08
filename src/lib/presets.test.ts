import { describe, it, expect } from 'vitest';
import {
	formatRelativeTime,
	importNotes,
	presetMeta,
	uniquePresetName,
	type ImportResult,
	type PresetSummary
} from './presets';

const NOW = 1_700_000_000_000;

function summary(overrides: Partial<PresetSummary> = {}): PresetSummary {
	return {
		name: 'Work',
		icon_count: 3,
		updated_at: NOW / 1000,
		is_active: false,
		...overrides
	};
}

describe('formatRelativeTime', () => {
	it('scales from seconds to years', () => {
		const at = (secondsAgo: number) => formatRelativeTime(NOW / 1000 - secondsAgo, NOW);

		expect(at(5)).toBe('just now');
		expect(at(120)).toBe('2m ago');
		expect(at(3 * 3600)).toBe('3h ago');
		expect(at(2 * 86400)).toBe('2d ago');
		expect(at(90 * 86400)).toBe('3mo ago');
		expect(at(800 * 86400)).toBe('2y ago');
	});

	it('reports a missing timestamp instead of a negative age', () => {
		expect(formatRelativeTime(0, NOW)).toBe('unknown');
	});
});

describe('presetMeta', () => {
	it('pluralizes the item count and appends the age', () => {
		expect(presetMeta(summary({ icon_count: 1, updated_at: NOW / 1000 - 120 }), NOW)).toBe(
			'1 item · 2m ago'
		);
		expect(presetMeta(summary({ icon_count: 12, updated_at: NOW / 1000 - 120 }), NOW)).toBe(
			'12 items · 2m ago'
		);
	});

	it('flags a file that cannot be parsed', () => {
		expect(presetMeta(summary({ icon_count: null, updated_at: NOW / 1000 - 60 }), NOW)).toBe(
			'unreadable · 1m ago'
		);
	});
});

describe('uniquePresetName', () => {
	it('keeps the base name when it is free', () => {
		expect(uniquePresetName('Untitled', ['Work'])).toBe('Untitled');
	});

	it('counts up past every taken name', () => {
		expect(uniquePresetName('Work copy', ['Work copy', 'Work copy 2'])).toBe('Work copy 3');
	});
});

describe('importNotes', () => {
	it('lists only what was actually neutralized', () => {
		const result: ImportResult = {
			name: 'shared',
			cleared_network_grants: 0,
			cleared_local_network: false,
			cleared_global_shortcuts: 0,
			forced_power_confirmation: 0
		};
		expect(importNotes(result)).toEqual([]);

		expect(
			importNotes({
				...result,
				cleared_network_grants: 2,
				cleared_local_network: true,
				cleared_global_shortcuts: 1,
				forced_power_confirmation: 3
			})
		).toEqual([
			'cleared 2 network grant(s)',
			'disabled local network access',
			'disabled 1 global shortcut(s)',
			're-enabled confirmation on 3 power widget(s)'
		]);
	});
});
