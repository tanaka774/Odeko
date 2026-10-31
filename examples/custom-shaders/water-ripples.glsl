// Water Ripples
// The canvas is a pool: moving the pointer stirs it, clicks drop stones,
// icons are walls the waves bounce off, and the iChannel0 image refracts
// through the water. The feedback buffer holds the simulated water surface.
const float DAMPING = 0.985;

void bufferImage(out vec4 fragColor, in vec2 fragCoord) {
	vec4 self = odBufferAt(fragCoord);
	float neighbors = odBufferAt(fragCoord + vec2(1.0, 0.0)).r + odBufferAt(fragCoord - vec2(1.0, 0.0)).r
		+ odBufferAt(fragCoord + vec2(0.0, 1.0)).r + odBufferAt(fragCoord - vec2(0.0, 1.0)).r;
	float next = (neighbors * 0.5 - self.g) * DAMPING;

	float speed = min(length(odPointerVelocity) / 400.0, 1.0);
	next += odPointer.z * speed * smoothstep(12.0, 0.0, length(fragCoord - odPointer.xy) / odPixelRatio) * 0.2;
	for (int i = 0; i < 8; i++) {
		vec3 click = odClicks[i];
		if (click.z < iTimeDelta * 1.5) next += smoothstep(14.0, 0.0, length(fragCoord - click.xy) / odPixelRatio) * 3.0;
	}
	if (odIconDistance(fragCoord) < 0.0) next = 0.0;
	// r = height now, g = height one frame ago.
	fragColor = vec4(next, self.r, 0.0, 1.0);
}

vec3 pool(vec2 fragCoord) {
	if (iChannelResolution[0].x > 0.0) return texture(iChannel0, odCoverUv(fragCoord)).rgb;
	vec2 tile = abs(fract(fragCoord / (48.0 * odPixelRatio)) - 0.5);
	float grout = smoothstep(0.46, 0.5, max(tile.x, tile.y));
	return mix(vec3(0.05, 0.35, 0.5), vec3(0.75, 0.9, 0.95), grout * 0.6);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 slope = vec2(
		odBufferAt(fragCoord + vec2(1.0, 0.0)).r - odBufferAt(fragCoord - vec2(1.0, 0.0)).r,
		odBufferAt(fragCoord + vec2(0.0, 1.0)).r - odBufferAt(fragCoord - vec2(0.0, 1.0)).r
	);
	vec3 col = pool(fragCoord + slope * 40.0 * odPixelRatio);
	vec3 normal = normalize(vec3(-slope * 6.0, 1.0));
	col += pow(max(dot(normal, normalize(vec3(-0.4, 0.6, 1.0))), 0.0), 80.0) * 0.6;
	fragColor = vec4(col, 1.0);
}
