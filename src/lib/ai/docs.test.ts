import { describe, it, expect } from 'vitest';
import { DOC_TOPICS, exampleNames, getDocs } from './docs';

describe('AI docs', () => {
	it('serves every topic', () => {
		for (const topic of DOC_TOPICS) expect(getDocs(topic).length).toBeGreaterThan(200);
	});

	it('bundles the example files', () => {
		expect(exampleNames()).toContain('custom-css/aichat.css');
		expect(exampleNames()).toContain('custom-shaders/aurora.glsl');
		expect(getDocs('custom-shaders/aurora.glsl')).toContain('mainImage');
	});

	it('lists the stable classes for custom CSS', () => {
		expect(getDocs('css')).toContain('.time-display');
	});

	it('names valid topics on a miss', () => {
		expect(() => getDocs('nope')).toThrow(/Topics: css/);
	});
});
