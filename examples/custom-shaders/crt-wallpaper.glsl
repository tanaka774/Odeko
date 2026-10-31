// CRT Wallpaper
// Shows the layer's iChannel0 image or video on a curved CRT screen with
// scanlines, color fringing and a rolling bar; icon clicks glitch it. Without
// one it shows color bars.
vec3 colorBars(vec2 uv) {
	float i = floor(uv.x * 7.0);
	float r = step(i, 1.5) + step(3.5, i) * step(i, 5.5);
	float g = step(i, 3.5);
	float b = 1.0 - mod(i, 2.0);
	return vec3(r, g, b) * 0.75;
}

vec3 screen(vec2 fragCoord) {
	if (iChannelResolution[0].x <= 0.0) return colorBars(fragCoord / iResolution.xy);
	return texture(iChannel0, odCoverUv(fragCoord)).rgb;
}

vec2 curve(vec2 uv) {
	uv = uv * 2.0 - 1.0;
	vec2 offset = abs(uv.yx) / vec2(6.0, 5.0);
	uv += uv * offset * offset;
	return uv * 0.5 + 0.5;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 uv = curve(fragCoord / iResolution.xy);
	if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
		fragColor = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	}
	vec2 p = uv * iResolution.xy;
	float glitch = odPulseRing(p, 900.0, 80.0, 0.8);
	p.x += sin(p.y * 0.05 + iTime * 40.0) * glitch * 12.0 * odPixelRatio;
	float fringe = (1.5 + glitch * 8.0) * odPixelRatio;
	vec3 col = vec3(
		screen(p + vec2(fringe, 0.0)).r,
		screen(p).g,
		screen(p - vec2(fringe, 0.0)).b
	);
	col *= 0.78 + 0.22 * sin(p.y / odPixelRatio * 2.094);
	col *= 1.0 + 0.12 * exp(-pow((fract(uv.y - iTime * 0.12) - 0.5) * 18.0, 2.0));
	col *= pow(16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y), 0.25);
	col *= 0.97 + 0.03 * sin(iTime * 110.0);
	col += vec3(0.05, 0.12, 0.08) * odHoverGlow(p, 30.0);
	fragColor = vec4(col * 1.15, 1.0);
}
