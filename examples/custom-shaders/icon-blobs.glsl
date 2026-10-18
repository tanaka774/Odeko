// Icon Blobs
// A gooey blob sits under every icon and melts into its neighbors; the
// pointer drags a blob of its own and icon clicks send a ripple.
const vec3 INSIDE = vec3(0.35, 0.2, 0.9);
const vec3 EDGE = vec3(0.3, 0.95, 1.0);

float smin(float a, float b, float k) {
	float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
	return mix(b, a, h) - k * h * (1.0 - h);
}

float field(vec2 p) {
	float d = 1e5;
	for (int i = 0; i < 64; i++) {
		if (i >= odIconCount) break;
		vec4 icon = odIcons[i];
		float radius = min(icon.z, icon.w) * 0.55 / odPixelRatio;
		radius *= 1.0 + 0.1 * sin(iTime * 1.5 + float(i) * 1.7);
		d = smin(d, length(p - icon.xy - icon.zw * 0.5) / odPixelRatio - radius, 40.0);
	}
	for (int i = 0; i < 3; i++) {
		float fi = float(i);
		vec2 drift = iResolution.xy * (0.5 + 0.35 * vec2(sin(iTime * 0.21 + fi * 2.1), cos(iTime * 0.17 + fi * 1.3)));
		d = smin(d, length(p - drift) / odPixelRatio - 40.0, 40.0);
	}
	if (odPointer.z > 0.01) d = smin(d, length(p - odPointer.xy) / odPixelRatio - 35.0 * odPointer.z, 40.0);
	return d;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	float d = field(fragCoord);
	d += 6.0 * odPulseRing(fragCoord, 500.0, 30.0, 1.5);
	vec2 uv = fragCoord / iResolution.xy;
	vec3 bg = mix(vec3(0.02, 0.02, 0.05), vec3(0.06, 0.03, 0.1), uv.y);
	vec3 inside = INSIDE * (0.45 + 0.3 * sin(d * 0.08 + iTime));
	vec3 col = mix(inside, bg, smoothstep(-1.0, 1.0, d));
	col += EDGE * exp(-abs(d) / 3.0) * 0.9;
	col += EDGE * exp(-max(d, 0.0) / 40.0) * 0.12;
	fragColor = vec4(col, 1.0);
}
