// ASCII Field
// Drifting noise drawn with ASCII characters; they densify and flicker
// around the hovered icon, the pointer and icon clicks.
const vec3 COLOR = vec3(0.47, 0.86, 1.0);
const float CELL = 9.0;

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

// 5x5 bitmap glyphs, bit (row * 5 + col) with row 0 on top.
float glyphBit(int bits, vec2 cellUv) {
	vec2 sub = floor(cellUv * vec2(6.0, 7.0));
	if (sub.x > 4.0 || sub.y < 1.0 || sub.y > 5.0) return 0.0;
	int index = (5 - int(sub.y)) * 5 + int(sub.x);
	return float((bits >> index) & 1);
}

// " .:-=+*#%@" from sparse to dense.
int asciiRamp(float v) {
	int ramp[10] = int[10](0, 4194304, 131200, 14336, 459200, 145536, 703136, 11512810, 27070835, 31520430);
	return ramp[int(clamp(v, 0.0, 0.999) * 10.0)];
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	float cell = CELL * odPixelRatio;
	vec2 id = floor(fragCoord / cell);
	vec2 uv = fract(fragCoord / cell);
	vec2 center = (id + 0.5) * cell;
	vec2 q = id / (iResolution.y / cell) * 3.0;
	float field = fbm(q + vec2(iTime * 0.08, -iTime * 0.05) + fbm(q * 1.7 - iTime * 0.04));
	float lift = odHoverGlow(center, 40.0) * 0.6 + odPointerGlow(center, 90.0) * 0.45
		+ odPulseRing(center, 520.0, 22.0, 1.6);
	float v = smoothstep(0.18, 0.75, field) + lift;
	float flicker = step(0.6, hash21(id + floor(iTime * 12.0))) * lift * 0.4;
	float ink = glyphBit(asciiRamp(v + flicker), uv);
	vec3 col = mix(COLOR * (0.35 + 0.65 * v), vec3(1.0), clamp(lift * 0.6, 0.0, 0.8));
	fragColor = vec4(vec3(0.015) + col * ink, 1.0);
}
