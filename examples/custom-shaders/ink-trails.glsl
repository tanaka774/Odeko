// Ink Trails
// The pointer paints glowing ink that drifts along a slow current and
// fades; clicks splash a burst of ink. The feedback buffer keeps the ink
// between frames.
const float FADE = 0.985;

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

vec3 hue(float h) {
	return 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67)));
}

float segment(vec2 p, vec2 a, vec2 b) {
	vec2 ab = b - a;
	float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
	return length(p - a - ab * t);
}

void bufferImage(out vec4 fragColor, in vec2 fragCoord) {
	float angle = vnoise(fragCoord / (220.0 * odPixelRatio) + iTime * 0.05) * 12.566;
	vec2 current = vec2(cos(angle), sin(angle)) * 0.8 * odPixelRatio;
	vec3 ink = odBufferAt(fragCoord - current).rgb * FADE;

	vec2 previous = odPointer.xy - odPointerVelocity * iTimeDelta * odPixelRatio;
	float strength = odPointer.z * min(length(odPointerVelocity) / 300.0, 1.0);
	float d = segment(fragCoord, previous, odPointer.xy) / odPixelRatio;
	ink += hue(iTime * 0.1) * strength * smoothstep(10.0, 0.0, d) * 0.6;
	for (int i = 0; i < 8; i++) {
		vec3 click = odClicks[i];
		if (click.z < iTimeDelta * 1.5) {
			ink += hue(hash21(click.xy)) * smoothstep(40.0, 0.0, length(fragCoord - click.xy) / odPixelRatio) * 1.5;
		}
	}
	fragColor = vec4(min(ink, vec3(4.0)), 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec3 ink = odBufferAt(fragCoord).rgb;
	vec3 bg = iChannelResolution[0].x > 0.0 ? texture(iChannel0, odCoverUv(fragCoord)).rgb * 0.35 : vec3(0.03, 0.03, 0.05);
	fragColor = vec4(bg + 1.0 - exp(-ink * 1.5), 1.0);
}
