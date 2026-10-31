import { describe, it, expect } from 'vitest';
import { hasBufferPass, MAX_ICONS, PRELUDE, shaderSource } from './background-shaders';

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
