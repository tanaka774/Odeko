// ASCII: Aurora Fjord
// Northern lights over a fjord between dark cliffs, mirrored in still
// water, drawn as coloured ASCII dots. Click the water to ripple the
// reflection.
const vec2 CELL = vec2(9.0, 13.0);

float hash11(float n) {
	return fract(sin(n * 12.9898) * 43758.5453);
}

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
	for (int i = 0; i < 4; i++) {
		v += a * vnoise(p);
		p = p * 2.03 + 17.1;
		a *= 0.5;
	}
	return v;
}

vec2 cellOf(vec2 f) {
	return floor(f / (CELL * odPixelRatio));
}

// Rings spreading from the last clicks, -1..1.
float ripples(vec2 f) {
	float r = 0.0;
	for (int i = 0; i < 8; i++) {
		vec3 c = odClicks[i];
		if (c.z > 4.0) continue;
		float d = length(f - c.xy) / odPixelRatio - c.z * 220.0;
		r += sin(d * 0.12) * exp(-abs(d) / 40.0) * (1.0 - c.z / 4.0);
	}
	return r;
}

float ridge(float x, float seed) {
	float v = 0.0;
	float a = 0.55;
	for (int k = 0; k < 4; k++) {
		v += a * (1.0 - abs(vnoise(vec2(x, seed)) * 2.0 - 1.0));
		x *= 2.03;
		a *= 0.5;
	}
	return v;
}

const float HORIZON = 0.3;

vec3 above(vec2 uv, vec2 f) {
	float ar = iResolution.x / iResolution.y;
	vec2 p = vec2(uv.x * ar, uv.y);
	vec3 col = mix(vec3(0.04, 0.06, 0.16), vec3(0.01, 0.015, 0.05), uv.y);
	vec2 cell = cellOf(f);
	col += vec3(0.85, 0.9, 1.0) * step(0.975, hash21(cell * 1.7)) * (0.35 + 0.3 * sin(iTime * 1.3 + hash21(cell) * 50.0));
	for (int i = 0; i < 4; i++) {
		float fi = float(i);
		float x = p.x * (1.0 + fi * 0.3) + fi * 1.7;
		float band = 0.6 + 0.07 * fi + 0.08 * sin(x * 1.8 + iTime * (0.15 + fi * 0.04)) + 0.06 * fbm(vec2(x, iTime * 0.05 + fi));
		float d = uv.y - band;
		float curtain = exp(-abs(d) * (8.0 - fi)) * (0.5 + 0.5 * fbm(vec2(x * 5.0, uv.y * 2.0 - iTime * 0.25)));
		curtain *= smoothstep(-0.28, 0.02, d);
		col += mix(vec3(0.2, 1.0, 0.55), vec3(0.7, 0.35, 1.0), smoothstep(0.0, 0.18, d)) * curtain * 0.55;
	}
	float side = abs(uv.x - 0.5) * 2.0;
	float wall = HORIZON + 0.03 + 0.62 * pow(side, 1.7) + 0.08 * (ridge(p.x * 3.0, 5.0) - 0.5) * side;
	if (uv.y < wall) {
		float rim = exp(-(wall - uv.y) * 30.0);
		float snow = smoothstep(0.62, 0.72, vnoise(vec2(p.x * 9.0, uv.y * 30.0))) * smoothstep(HORIZON + 0.1, wall, uv.y);
		col = mix(vec3(0.1, 0.12, 0.24), vec3(0.04, 0.05, 0.1), smoothstep(wall, HORIZON, uv.y));
		col += vec3(0.25, 0.85, 0.55) * rim * 0.55;
		col = mix(col, vec3(0.55, 0.65, 0.8), snow * 0.6);
	}
	return col;
}

vec3 scene(vec2 f) {
	vec2 uv = f / iResolution.xy;
	if (uv.y >= HORIZON) return above(uv, f);
	float depth = (HORIZON - uv.y) / HORIZON;
	float wave = (vnoise(vec2(uv.x * 30.0, uv.y * 100.0 + iTime * 0.5)) - 0.5) * 0.008 * (0.3 + depth)
		+ ripples(f) * 0.02;
	vec2 m = vec2(uv.x + wave, 2.0 * HORIZON - uv.y + 0.003);
	vec3 refl = above(m, m * iResolution.xy);
	return mix(refl * 0.8, vec3(0.01, 0.02, 0.05), 0.2 + depth * 0.4);
}

// The scene is sampled once per character cell and drawn as a dot whose
// size follows its brightness: nothing, ·, •, ● (like a coloured ASCII
// render). Dark cells keep a faint dotted grain.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 cs = CELL * odPixelRatio;
	vec2 cell = floor(fragCoord / cs);
	vec2 center = (cell + 0.5) * cs;
	vec3 c = max(scene(center), 0.0);
	float lift = odPointerGlow(center, 150.0) * 0.3 + odPulseRing(center, 600.0, 30.0, 1.6) * 0.7
		+ odHoverGlow(center, 40.0) * 0.4;
	c += c * lift * 1.5 + vec3(lift) * 0.12;
	float peak = max(max(c.r, c.g), c.b);
	float level = peak + (hash21(cell) - 0.5) * 0.12;
	float radius = level < 0.07 ? 0.0 : level < 0.2 ? 0.8 : level < 0.42 ? 1.5 : level < 0.7 ? 2.2 : 3.0;
	float grain = 0.0;
	if (radius == 0.0 && mod(cell.x + cell.y, 2.0) == 0.0) {
		radius = 0.6;
		grain = 1.0;
	}
	float d = length(fragCoord - center);
	float dotMask = clamp((radius + 0.5) * odPixelRatio - d, 0.0, 1.0);
	vec3 ink = c / max(peak, 1e-3) * mix(0.55, 1.0, clamp(peak, 0.0, 1.0));
	if (grain > 0.0) ink = mix(vec3(0.5, 0.55, 0.7), ink, 0.5) * 0.22;
	vec3 bg = c * 0.05 + vec3(0.008, 0.01, 0.016);
	fragColor = vec4(mix(bg, ink, dotMask), 1.0);
}
