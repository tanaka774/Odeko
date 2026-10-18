// Fireworks
// Every click launches a firework where you clicked, up to 8 at once, and a
// couple launch on their own so the sky is never empty. Shows odClicks
// without a feedback buffer.
const int SPARKS = 48;
const float LIFE = 2.2;

float hash11(float n) { return fract(sin(n) * 43758.5453123); }

vec3 burst(vec2 fragCoord, vec2 origin, float t, float seed) {
	if (t > LIFE) return vec3(0.0);
	vec3 tint = 0.6 + 0.4 * cos(6.2832 * (hash11(seed) + vec3(0.0, 0.33, 0.67)));
	float fade = 1.0 - t / LIFE;
	vec3 col = vec3(0.0);
	for (int j = 0; j < SPARKS; j++) {
		float fj = float(j);
		float angle = fj / float(SPARKS) * 6.2832 + hash11(seed + fj) * 0.3;
		float speed = 140.0 + 90.0 * hash11(seed * 1.7 + fj);
		vec2 travel = vec2(cos(angle), sin(angle)) * speed * (1.0 - exp(-2.5 * t)) / 2.5 - vec2(0.0, 40.0 * t * t);
		float d = length(fragCoord - origin - travel * odPixelRatio) / odPixelRatio;
		float twinkle = 0.7 + 0.3 * sin(t * 40.0 + fj);
		col += tint * fade * twinkle * 3.0 / (1.0 + d * d * 0.6);
	}
	col += tint * exp(-t * 8.0) * exp(-length(fragCoord - origin) / (60.0 * odPixelRatio));
	return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 uv = fragCoord / iResolution.xy;
	vec3 col = mix(vec3(0.02, 0.02, 0.06), vec3(0.0, 0.0, 0.015), uv.y);
	for (int i = 0; i < 8; i++) {
		vec3 click = odClicks[i];
		col += burst(fragCoord, click.xy, click.z, click.x * 0.13 + click.y * 0.71);
	}
	for (int k = 0; k < 2; k++) {
		float clock = iTime + float(k) * 1.7;
		float wave = floor(clock / 3.4);
		vec2 origin = iResolution.xy * vec2(0.15 + 0.7 * hash11(wave + float(k) * 9.1), 0.5 + 0.35 * hash11(wave * 1.3 + 2.0));
		col += burst(fragCoord, origin, mod(clock, 3.4), wave + float(k) * 5.0) * 0.6;
	}
	fragColor = vec4(col, 1.0);
}
