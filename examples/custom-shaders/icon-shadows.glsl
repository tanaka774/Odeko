// Icon Shadows
// The pointer is a lamp and every icon casts a soft shadow; without the
// pointer the light circles slowly. Heavy: set the layer's Resolution to 50% if
// it stutters.
float softShadow(vec2 p, vec2 light) {
	vec2 dir = light - p;
	float total = length(dir) / odPixelRatio;
	dir = normalize(dir);
	float result = 1.0;
	float t = 2.0;
	for (int i = 0; i < 32; i++) {
		if (t >= total) break;
		float d = odIconDistance(p + dir * t * odPixelRatio);
		if (d < 0.5) return 0.0;
		result = min(result, 10.0 * d / t);
		t += max(d, 3.0);
	}
	return clamp(result, 0.0, 1.0);
}

vec3 floorColor(vec2 fragCoord) {
	if (iChannelResolution[0].x > 0.0) return texture(iChannel0, odCoverUv(fragCoord)).rgb;
	vec2 grid = abs(fract(fragCoord / (40.0 * odPixelRatio)) - 0.5);
	float line = smoothstep(0.48, 0.5, max(grid.x, grid.y));
	return vec3(0.16, 0.17, 0.2) + line * 0.05;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 orbit = iResolution.xy * 0.5 + vec2(cos(iTime * 0.4), sin(iTime * 0.4)) * iResolution.y * 0.35;
	vec2 light = mix(orbit, odPointer.xy, odPointer.z);
	float dist = length(fragCoord - light) / odPixelRatio;
	float falloff = 1.0 / (1.0 + pow(dist / 450.0, 2.0));
	float lit = softShadow(fragCoord, light) * falloff;
	vec3 lamp = vec3(1.0, 0.85, 0.65);
	vec3 col = floorColor(fragCoord) * (0.18 + 1.1 * lit * lamp);
	col += lamp * exp(-dist / 60.0) * 0.4;
	col += lamp * odPulseRing(fragCoord, 700.0, 30.0, 1.2) * 0.3;
	fragColor = vec4(col, 1.0);
}
