// ASCII: Tokyo Rain
// A rainy skyline of lit windows and neon signs over a wet street, drawn as
// coloured ASCII dots. The pointer is an umbrella; click the street to
// splash the puddles.
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

const float GROUND = 0.16;

vec3 skyColor(vec2 uv) {
	vec3 c = mix(vec3(0.75, 0.28, 0.6), vec3(0.12, 0.08, 0.3), smoothstep(GROUND, 0.85, uv.y));
	return c + vec3(0.35, 0.15, 0.4) * (fbm(vec2(uv.x * 3.0 + iTime * 0.01, uv.y * 6.0)) - 0.4) * 0.5;
}

vec3 city(vec2 f, out float solid) {
	vec2 cs = CELL * odPixelRatio;
	vec2 cell = floor(f / cs);
	float rows = iResolution.y / cs.y;
	float ground = floor(rows * GROUND);
	vec3 col = vec3(0.0);
	solid = 0.0;
	for (int layer = 0; layer < 2; layer++) {
		float fl = float(layer);
		float width = fl == 0.0 ? 9.0 : 15.0;
		float x = cell.x + fl * 3.0;
		float b = floor(x / width);
		float inB = mod(x, width);
		float h = ground + rows * (fl == 0.0 ? 0.25 + 0.35 * hash11(b * 3.7 + 1.0) : 0.12 + 0.38 * hash11(b * 1.9 + 5.0));
		if (cell.y >= h || inB < 1.0) continue;
		solid = 1.0;
		col = fl == 0.0 ? vec3(0.07, 0.05, 0.13) : vec3(0.02, 0.015, 0.04);
		bool window = mod(inB, 2.0) == 0.0 && mod(cell.y, 2.0) == 0.0 && cell.y < h - 1.0;
		float on = step(0.6, hash21(cell * vec2(1.3, 0.7) + b + fl * 31.0 + floor(iTime * 0.02 + hash21(cell) * 5.0)));
		if (window && on > 0.0) {
			float k = hash21(cell + 9.0);
			col = k < 0.6 ? vec3(1.0, 0.78, 0.45) : k < 0.85 ? vec3(0.75, 0.9, 1.0) : vec3(1.0, 0.45, 0.8);
			col *= fl == 0.0 ? 0.5 : 0.9;
		}
		if (fl == 1.0 && hash11(b * 4.1) > 0.55 && inB >= width - 2.0 && cell.y > h - 10.0 && cell.y < h - 2.0) {
			vec3 neon = hash11(b) > 0.5 ? vec3(1.0, 0.2, 0.7) : vec3(0.2, 0.95, 1.0);
			col = neon * (0.75 + 0.25 * step(0.1, hash11(floor(iTime * 8.0) + b)));
		}
	}
	return col;
}

vec3 scene(vec2 f) {
	vec2 uv = f / iResolution.xy;
	float solid;
	vec3 col;
	if (uv.y > GROUND) {
		vec3 b = city(f, solid);
		col = mix(skyColor(uv), b, solid);
	} else {
		float sway = (vnoise(vec2(f.y * 0.08 / odPixelRatio, iTime * 2.0)) - 0.5) * 18.0 * odPixelRatio;
		vec2 m = vec2(f.x + sway, 2.0 * GROUND * iResolution.y - f.y);
		vec3 refl = mix(skyColor(m / iResolution.xy), city(m, solid), solid);
		float depth = (GROUND - uv.y) / GROUND;
		col = refl * (0.55 - depth * 0.25) + vec3(0.02, 0.02, 0.05);
		col += vec3(0.4, 0.6, 0.9) * max(ripples(f), 0.0) * 0.35;
	}
	vec2 cell = cellOf(f);
	float speed = 14.0 + 8.0 * hash11(cell.x * 1.7);
	float y = cell.y + iTime * speed + hash11(cell.x) * 200.0;
	float drop = step(fract(y / (18.0 + hash11(cell.x * 3.1) * 14.0)), 0.12);
	float dry = odPointer.z * (1.0 - smoothstep(90.0, 120.0, length(f - odPointer.xy) / odPixelRatio));
	col += vec3(0.45, 0.55, 0.75) * drop * 0.22 * (1.0 - dry);
	return col;
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
