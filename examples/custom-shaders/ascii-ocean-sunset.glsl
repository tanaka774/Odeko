// ASCII: Ocean Sunset
// The sun setting into a glittering sea under lit clouds, drawn as coloured
// ASCII dots. Click the water to send out ripples.
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

const float HORIZON = 0.42;

vec3 sky(vec2 uv, vec2 p, vec2 sun) {
	float t = clamp((uv.y - HORIZON) / (1.0 - HORIZON), 0.0, 1.0);
	vec3 c = mix(vec3(1.0, 0.75, 0.35), vec3(1.0, 0.38, 0.35), smoothstep(0.0, 0.25, t));
	c = mix(c, vec3(0.55, 0.2, 0.5), smoothstep(0.2, 0.55, t));
	c = mix(c, vec3(0.1, 0.06, 0.25), smoothstep(0.5, 1.0, t));
	float sd = length(p - sun);
	c += vec3(1.0, 0.9, 0.6) * smoothstep(0.13, 0.12, sd);
	c += vec3(1.0, 0.5, 0.2) * 0.5 * exp(-sd * 4.0);
	float cloud = fbm(vec2(p.x * 1.8 - iTime * 0.01, p.y * 14.0));
	float band = smoothstep(0.5, 0.72, cloud) * smoothstep(0.85, 0.55, uv.y) * smoothstep(HORIZON + 0.05, HORIZON + 0.15, uv.y);
	vec3 lit = mix(vec3(0.35, 0.12, 0.3), vec3(1.0, 0.55, 0.45), smoothstep(0.62, 0.5, uv.y));
	return mix(c, lit, band * 0.85);
}

vec3 scene(vec2 f) {
	vec2 uv = f / iResolution.xy;
	float ar = iResolution.x / iResolution.y;
	vec2 p = vec2(uv.x * ar, uv.y);
	vec2 sun = vec2(0.5 * ar, HORIZON + 0.06);
	if (uv.y >= HORIZON) return sky(uv, p, sun);
	float depth = (HORIZON - uv.y) / HORIZON;
	vec3 water = mix(vec3(0.45, 0.18, 0.35), vec3(0.06, 0.05, 0.18), pow(depth, 0.6));
	float w = vnoise(vec2(p.x * (6.0 + 30.0 * (1.0 - depth)), uv.y * 90.0 / (0.2 + depth) + iTime * 0.6));
	float glitter = exp(-abs(p.x - sun.x) * (3.0 + 6.0 * (1.0 - depth)));
	float rip = ripples(f);
	water += vec3(1.0, 0.65, 0.3) * glitter * smoothstep(0.45, 0.8, w + rip * 0.4) * 1.2;
	water += vec3(0.6, 0.3, 0.6) * smoothstep(0.7, 0.95, w) * 0.25;
	water += vec3(0.5, 0.6, 0.8) * max(rip, 0.0) * 0.35;
	return water;
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
