// Liquid
// Domain-warped noise that the pointer stirs like paint.
const vec3 COLOR = vec3(0.67, 0.35, 1.0);

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
	vec2 uv = fragCoord / iResolution.y * 2.2;
	vec2 toPointer = fragCoord - odPointer.xy;
	float stir = odPointerGlow(fragCoord, 200.0) * 1.6 + odPulseRing(fragCoord, 500.0, 60.0, 2.0) * 0.8;
	float s = sin(stir);
	float c = cos(stir);
	uv += (mat2(c, -s, s, c) * toPointer - toPointer) / iResolution.y * 2.2;
	float t = iTime * 0.15;
	vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3) - t));
	vec2 r = vec2(fbm(uv + 3.5 * q + vec2(1.7, 9.2) + t * 1.3), fbm(uv + 3.5 * q + vec2(8.3, 2.8) - t));
	float f = fbm(uv + 3.0 * r);
	vec3 col = mix(vec3(0.02, 0.02, 0.05), COLOR * 0.7, smoothstep(0.2, 0.9, f));
	col = mix(col, COLOR.brg * 0.9, smoothstep(0.4, 1.1, length(q)) * 0.6);
	col = mix(col, vec3(1.0), smoothstep(0.65, 1.0, r.x) * 0.25);
	col += COLOR * odHoverGlow(fragCoord, 50.0) * 0.35;
	fragColor = vec4(col, 1.0);
}
