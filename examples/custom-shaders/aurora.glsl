// Aurora
// Layered aurora curtains that bend toward the pointer.
const vec3 COLOR = vec3(0.24, 1.0, 0.67);

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
		mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 5; i++) {
		v += a * vnoise(p);
		p = p * 2.03 + 17.1;
		a *= 0.5;
	}
	return v;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 uv = fragCoord / iResolution.y;
	float pointerY = odPointer.y / iResolution.y;
	float bend = odPointerGlow(fragCoord, 260.0);
	vec3 col = vec3(0.0);
	for (int i = 0; i < 4; i++) {
		float fi = float(i);
		float x = uv.x * (1.2 + fi * 0.35) + fi * 1.7;
		float band = 0.35 + fi * 0.13 + 0.12 * sin(x * 2.2 + iTime * (0.35 + fi * 0.1))
			+ 0.1 * fbm(vec2(x * 1.4, iTime * 0.12 + fi));
		band += (pointerY - band) * bend * 0.5;
		float d = uv.y - band;
		float curtain = exp(-abs(d) * (9.0 - fi)) * (0.6 + 0.4 * fbm(vec2(x * 6.0, uv.y * 2.0 - iTime * 0.3)));
		curtain *= smoothstep(-0.25, 0.05, d) * 1.4;
		col += mix(COLOR, COLOR.gbr, fi / 3.0) * curtain * 0.32;
	}
	col += COLOR * odHoverGlow(fragCoord, 60.0) * 0.5;
	col += mix(COLOR, vec3(1.0), 0.5) * odPulseRing(fragCoord, 600.0, 40.0, 2.0) * 0.6;
	vec3 sky = mix(vec3(0.005, 0.01, 0.03), vec3(0.02, 0.03, 0.07), uv.y);
	fragColor = vec4(sky + col, 1.0);
}
