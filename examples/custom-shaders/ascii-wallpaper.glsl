// ASCII Wallpaper
// Redraws the wallpaper (image or video) as colored ASCII characters; a lens
// under the pointer reveals the original. Set a wallpaper in the Background
// tab; without one it shows a color gradient.
const float CELL = 8.0;

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

vec3 wallpaper(vec2 fragCoord) {
	if (iChannelResolution[0].x <= 0.0) {
		vec2 uv = fragCoord / iResolution.xy;
		return 0.5 + 0.5 * cos(iTime * 0.3 + uv.xyx * 3.0 + vec3(0.0, 2.0, 4.0));
	}
	return texture(iChannel0, odCoverUv(fragCoord)).rgb;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	float cell = CELL * odPixelRatio;
	vec2 id = floor(fragCoord / cell);
	vec2 center = (id + 0.5) * cell;
	vec3 source = wallpaper(center);
	float luma = dot(source, vec3(0.299, 0.587, 0.114));
	float lift = odHoverGlow(center, 40.0) * 0.5 + odPulseRing(center, 520.0, 22.0, 1.6);
	float ink = glyphBit(asciiRamp(luma * 1.1 + lift), fract(fragCoord / cell));
	vec3 col = (source * 1.3 + lift * 0.5) * ink;
	float reveal = smoothstep(0.35, 0.65, odPointerGlow(fragCoord, 80.0));
	fragColor = vec4(mix(col, wallpaper(fragCoord), reveal), 1.0);
}
