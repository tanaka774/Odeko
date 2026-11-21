// ASCII: Alpine Dawn
// Snowy peaks catching a low sun, mirrored in a lake, drawn as coloured
// ASCII dots. The pointer is a lantern; click the lake to ripple the
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

const float HORIZON = 0.33;

vec3 landscape(vec2 uv, vec2 f) {
	float ar = iResolution.x / iResolution.y;
	vec2 p = vec2(uv.x * ar, uv.y);
	float t = clamp((uv.y - HORIZON) / (1.0 - HORIZON), 0.0, 1.0);
	vec3 col = mix(vec3(1.0, 0.62, 0.32), vec3(0.62, 0.42, 0.62), smoothstep(0.0, 0.35, t));
	col = mix(col, vec3(0.08, 0.1, 0.3), smoothstep(0.3, 0.95, t));
	vec2 sun = vec2(0.66 * ar, HORIZON + 0.2);
	float sd = length(p - sun);
	col += vec3(1.0, 0.85, 0.55) * smoothstep(0.07, 0.06, sd);
	col += vec3(1.0, 0.55, 0.25) * 0.6 * exp(-sd * 5.0);
	vec2 cell = cellOf(f);
	float star = step(0.982, hash21(cell * 1.31)) * smoothstep(0.55, 0.9, t);
	col += vec3(0.85, 0.9, 1.0) * star * (0.45 + 0.35 * sin(iTime * 1.5 + hash21(cell) * 40.0));
	float cloud = fbm(vec2(p.x * 2.5 + iTime * 0.015, p.y * 9.0));
	col = mix(col, vec3(1.0, 0.72, 0.62), smoothstep(0.55, 0.78, cloud) * exp(-abs(uv.y - 0.62) * 9.0) * 0.6);

	for (int i = 0; i < 3; i++) {
		float fi = float(i);
		float freq = 0.8 + 0.55 * fi;
		float x = p.x * freq + fi * 9.7;
		float top = HORIZON + (0.05 + 0.48 * ridge(x, fi * 4.3)) * (1.0 - fi * 0.3);
		if (uv.y > top) continue;
		float slope = ridge(x + 0.01, fi * 4.3) - ridge(x - 0.01, fi * 4.3);
		float lit = clamp(0.5 + slope * 25.0 * sign(sun.x - p.x), 0.0, 1.0);
		vec3 rock = mix(vec3(0.62, 0.46, 0.62), vec3(0.26, 0.2, 0.4), fi / 2.0);
		rock = mix(rock, col, 0.3 - fi * 0.12);
		rock *= 0.5 + 0.8 * lit;
		float snowLine = top - (0.025 + 0.05 * vnoise(vec2(p.x * 22.0, fi)));
		if (uv.y > snowLine && top > HORIZON + 0.16 - fi * 0.05) {
			rock = mix(vec3(0.55, 0.58, 0.85), vec3(1.0, 0.86, 0.78), lit);
		}
		col = rock;
	}

	float tree = floor(p.x * 34.0);
	float cx = (tree + 0.5) / 34.0;
	float th = 0.03 + 0.05 * hash11(tree * 3.3);
	if (uv.y < HORIZON + th && abs(p.x - cx) < (HORIZON + th - uv.y) * 0.3) {
		col = vec3(0.05, 0.14, 0.12);
	}
	return col;
}

vec3 scene(vec2 f) {
	vec2 uv = f / iResolution.xy;
	if (uv.y >= HORIZON) return landscape(uv, f);
	float depth = (HORIZON - uv.y) / HORIZON;
	float wave = (vnoise(vec2(uv.x * 40.0, uv.y * 120.0 + iTime * 0.8)) - 0.5) * 0.012 * (0.4 + depth)
		+ ripples(f) * 0.02;
	vec2 m = vec2(uv.x + wave, 2.0 * HORIZON - uv.y + 0.004);
	vec3 refl = landscape(m, m * iResolution.xy);
	vec3 water = mix(vec3(0.1, 0.12, 0.25), vec3(0.03, 0.04, 0.1), depth);
	return mix(refl * 0.75, water, 0.25 + depth * 0.35);
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
