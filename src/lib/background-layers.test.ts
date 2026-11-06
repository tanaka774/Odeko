import { describe, it, expect } from 'vitest';
import {
	contentKey,
	createLayer,
	defaultLayers,
	isInteractive,
	layerContent,
	layersAt,
	sanitizeLayer,
	sanitizeLayers
} from './background-layers';

describe('sanitizeLayers', () => {
	it('gives the default stack for anything that is not a list', () => {
		expect(sanitizeLayers(undefined)).toHaveLength(1);
		expect(sanitizeLayers(null)[0]).toMatchObject({ type: 'color', name: 'Tint', opacity: 0.75 });
	});

	it('keeps an empty stack empty', () => {
		expect(sanitizeLayers([])).toEqual([]);
	});

	it('drops unknown entries and re-ids duplicates', () => {
		const layers = sanitizeLayers([
			{ id: 'a', type: 'color' },
			{ id: 'a', type: 'shader', source: 'x' },
			{ type: 'video' },
			'nope'
		]);
		expect(layers.map((layer) => layer.type)).toEqual(['color', 'shader']);
		expect(layers[0].id).toBe('a');
		expect(layers[1].id).not.toBe('a');
	});
});

describe('sanitizeLayer', () => {
	it('clamps numbers and rejects unknown enum values', () => {
		const layer = sanitizeLayer({
			type: 'shader',
			opacity: 3,
			blend: 'evil',
			placement: 'sideways',
			quality: 9,
			fps: 144
		});
		expect(layer).toMatchObject({
			opacity: 1,
			blend: 'normal',
			placement: 'below',
			quality: 1,
			fps: 60,
			source: '',
			file: null,
			watch: false,
			texture: null
		});
	});

	it('fills media defaults', () => {
		expect(sanitizeLayer({ type: 'media', src: '/a.png', position: 'top left' })).toMatchObject({
			src: '/a.png',
			fit: 'cover',
			position: 'top left',
			repeat: false
		});
	});
});

describe('layersAt', () => {
	it('keeps enabled layers of one placement in order', () => {
		const a = createLayer('color', { id: 'a' });
		const b = createLayer('html', { id: 'b', placement: 'above' });
		const c = createLayer('media', { id: 'c', enabled: false });
		const d = createLayer('shader', { id: 'd' });
		expect(layersAt([a, b, c, d], 'below').map((l) => l.id)).toEqual(['a', 'd']);
		expect(layersAt([a, b, c, d], 'above').map((l) => l.id)).toEqual(['b']);
	});
});

describe('isInteractive', () => {
	it('only applies to HTML layers behind the icons', () => {
		expect(isInteractive(createLayer('html'))).toBe(true);
		expect(isInteractive(createLayer('html', { interactive: false }))).toBe(false);
		expect(isInteractive(createLayer('html', { placement: 'above' }))).toBe(false);
		expect(sanitizeLayer({ type: 'html', interactive: 'yes' })).toMatchObject({
			interactive: true
		});
	});
});

describe('contentKey', () => {
	it('changes with content but not with live settings', () => {
		const layer = createLayer('shader', { source: 'a' });
		const key = contentKey(layer, layerContent(layer, 'a'));
		const faded = { ...layer, opacity: 0.2 };
		expect(contentKey(faded, layerContent(faded, 'a'))).toBe(key);
		expect(contentKey(layer, layerContent(layer, 'b'))).not.toBe(key);
		const textured = { ...layer, texture: '/x.png' };
		expect(contentKey(textured, layerContent(textured, 'a'))).not.toBe(key);
	});

	it('never remounts a color layer', () => {
		const layer = defaultLayers()[0];
		expect(contentKey(layer, layerContent(layer, ''))).toBe('color');
	});
});
