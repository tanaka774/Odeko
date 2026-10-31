// Shader background layers: user-written GLSL fragment shaders in
// Shadertoy style (`mainImage(out vec4, in vec2)`), rendered by
// ShaderBackground.svelte. The Shadertoy inputs keep their names and types;
// Odeko's pointer and icon inputs are prefixed with `od`. The layer's
// texture image/video is bound as iChannel0. A shader that also defines
// `bufferImage` gets a feedback pass: it renders into odBuffer every frame
// while reading its own previous frame from it.

import { MAX_CLICKS, MAX_ICONS } from './background-input';

export { MAX_CLICKS, MAX_ICONS };

export const PRELUDE = `#version 300 es
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform sampler2D iChannel0;
uniform vec3 iChannelResolution[4];
uniform float odPixelRatio;
uniform vec3 odPointer;
uniform vec2 odPointerVelocity;
uniform vec4 odHover;
uniform float odHoverAmount;
uniform vec3 odPulse;
uniform vec3 odClicks[${MAX_CLICKS}];
uniform sampler2D odBuffer;
uniform vec4 odIcons[${MAX_ICONS}];
uniform int odIconCount;
out vec4 odFragColor;

float odSdRoundRect(vec2 p, vec2 center, vec2 halfSize, float radius) {
	vec2 q = abs(p - center) - halfSize + radius;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float odHoverDistance(vec2 p) {
	if (odHover.z <= 0.0) return 1e6;
	return odSdRoundRect(p, odHover.xy + odHover.zw * 0.5, odHover.zw * 0.5, 12.0 * odPixelRatio) / odPixelRatio;
}

float odIconDistance(vec2 p) {
	float d = 1e6;
	for (int i = 0; i < ${MAX_ICONS}; i++) {
		if (i >= odIconCount) break;
		vec4 icon = odIcons[i];
		d = min(d, odSdRoundRect(p, icon.xy + icon.zw * 0.5, icon.zw * 0.5, 12.0 * odPixelRatio));
	}
	return d / odPixelRatio;
}

vec4 odBufferAt(vec2 fragCoord) {
	return texture(odBuffer, fragCoord / iResolution.xy);
}

vec2 odCoverUv(vec2 fragCoord) {
	vec2 size = iChannelResolution[0].xy;
	if (size.x <= 0.0) return fragCoord / iResolution.xy;
	float scale = max(iResolution.x / size.x, iResolution.y / size.y);
	return (fragCoord - 0.5 * iResolution.xy) / (size * scale) + 0.5;
}

float odHoverGlow(vec2 p, float reach) {
	return odHoverAmount * exp(-max(odHoverDistance(p), 0.0) / reach);
}

float odPointerGlow(vec2 p, float reach) {
	return odPointer.z * exp(-length(p - odPointer.xy) / (reach * odPixelRatio));
}

float odPulseRing(vec2 p, float speed, float width, float life) {
	float t = odPulse.z;
	if (t > life) return 0.0;
	float d = abs(length(p - odPulse.xy) / odPixelRatio - t * speed);
	return exp(-d / width) * (1.0 - t / life);
}
`;

export type ShaderEntry = 'mainImage' | 'bufferImage';

const MAIN: Record<ShaderEntry, string> = {
	mainImage: `
void main() {
	vec4 color = vec4(0.0);
	mainImage(color, gl_FragCoord.xy);
	odFragColor = vec4(color.rgb, 1.0);
}
`,
	bufferImage: `
void main() {
	vec4 color = vec4(0.0);
	bufferImage(color, gl_FragCoord.xy);
	odFragColor = color;
}
`
};

export function shaderSource(source: string, entry: ShaderEntry = 'mainImage'): string {
	return PRELUDE + source + MAIN[entry];
}

export function hasBufferPass(source: string): boolean {
	return /\bvoid\s+bufferImage\s*\(/.test(source);
}

export interface CompiledShader {
	program: WebGLProgram;
	uniforms: Record<string, WebGLUniformLocation | null>;
}

const VERTEX = `#version 300 es
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const UNIFORMS = [
	'iResolution',
	'iTime',
	'iTimeDelta',
	'iFrame',
	'iMouse',
	'iDate',
	'iChannel0',
	'iChannelResolution',
	'odPixelRatio',
	'odPointer',
	'odPointerVelocity',
	'odHover',
	'odHoverAmount',
	'odPulse',
	'odClicks',
	'odBuffer',
	'odIcons',
	'odIconCount'
];

function compileStage(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type)!;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader) ?? 'unknown compile error';
		gl.deleteShader(shader);
		throw new Error(log);
	}
	return shader;
}

/** Throws with the driver's info log when the shader does not compile or link. */
export function compileShader(
	gl: WebGL2RenderingContext,
	source: string,
	entry: ShaderEntry = 'mainImage'
): CompiledShader {
	const vs = compileStage(gl, gl.VERTEX_SHADER, VERTEX);
	let fs: WebGLShader;
	try {
		fs = compileStage(gl, gl.FRAGMENT_SHADER, shaderSource(source, entry));
	} catch (error) {
		gl.deleteShader(vs);
		throw error;
	}
	const program = gl.createProgram()!;
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program) ?? 'unknown link error';
		gl.deleteProgram(program);
		throw new Error(log);
	}
	const uniforms: CompiledShader['uniforms'] = {};
	for (const name of UNIFORMS) uniforms[name] = gl.getUniformLocation(program, name);
	return { program, uniforms };
}

const PRELUDE_LINES = PRELUDE.split('\n').length - 1;

/** Compiles in a throwaway context; returns the error log with line numbers of the user's source. */
export function checkShader(source: string): string | null {
	const gl = document.createElement('canvas').getContext('webgl2');
	if (!gl) return 'WebGL 2 is not available';
	try {
		gl.deleteProgram(compileShader(gl, source).program);
		if (hasBufferPass(source)) gl.deleteProgram(compileShader(gl, source, 'bufferImage').program);
		return null;
	} catch (error) {
		return String((error as Error).message).replace(
			/(ERROR: \d+:)(\d+)/g,
			(_, prefix: string, line: string) => `${prefix}${Number(line) - PRELUDE_LINES}`
		);
	} finally {
		gl.getExtension('WEBGL_lose_context')?.loseContext();
	}
}
