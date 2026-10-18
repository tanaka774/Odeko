import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import {
	activeShaderSource,
	hasBufferPass,
	DEFAULT_BACKGROUND_SHADER,
	MAX_ICONS,
	PRELUDE,
	SHADER_EXAMPLES,
	sanitizeBackgroundShader,
	shaderSource
} from './background-shaders';

describe('sanitizeBackgroundShader', () => {
	it('falls back to the default for malformed values', () => {
		expect(sanitizeBackgroundShader(null)).toEqual(DEFAULT_BACKGROUND_SHADER);
		expect(sanitizeBackgroundShader('x')).toEqual(DEFAULT_BACKGROUND_SHADER);
		expect(sanitizeBackgroundShader([])).toEqual(DEFAULT_BACKGROUND_SHADER);
	});

	it('keeps valid fields and clamps quality', () => {
		expect(sanitizeBackgroundShader({ enabled: true, source: 'abc', quality: 9 })).toEqual({
			enabled: true,
			source: 'abc',
			quality: 1
		});
		expect(sanitizeBackgroundShader({ quality: 0 }).quality).toBe(0.25);
	});
});

describe('activeShaderSource', () => {
	it('is null when disabled or empty', () => {
		expect(activeShaderSource({ ...DEFAULT_BACKGROUND_SHADER, source: 'x' })).toBeNull();
		expect(
			activeShaderSource({ ...DEFAULT_BACKGROUND_SHADER, enabled: true, source: ' ' })
		).toBeNull();
		expect(activeShaderSource({ ...DEFAULT_BACKGROUND_SHADER, enabled: true, source: 'x' })).toBe(
			'x'
		);
	});
});

describe('shaderSource', () => {
	it('wraps the source with the prelude and entry point', () => {
		const source = shaderSource('// mine');
		expect(source.startsWith(PRELUDE + '// mine')).toBe(true);
		expect(source).toContain('mainImage(color, gl_FragCoord.xy)');
		expect(source).toContain(`uniform vec4 odIcons[${MAX_ICONS}];`);
	});
});

describe('hasBufferPass', () => {
	it('detects a bufferImage definition', () => {
		expect(hasBufferPass('void bufferImage(out vec4 c, in vec2 p) {}')).toBe(true);
		expect(hasBufferPass('void mainImage(out vec4 c, in vec2 p) {}')).toBe(false);
		expect(hasBufferPass('// bufferImageless')).toBe(false);
	});

	it('wraps the buffer entry point', () => {
		expect(shaderSource('', 'bufferImage')).toContain('bufferImage(color, gl_FragCoord.xy)');
	});
});

describe('SHADER_EXAMPLES', () => {
	it('bundles every example file with its first-line name', () => {
		const files = readdirSync(path.join(process.cwd(), 'examples', 'custom-shaders')).filter((f) =>
			f.endsWith('.glsl')
		);
		expect(SHADER_EXAMPLES).toHaveLength(files.length);
		for (const example of SHADER_EXAMPLES) {
			expect(example.name).not.toMatch(/\.glsl$/);
			expect(example.source).toContain('void mainImage(');
		}
	});
});
