// Dot Lens
// A breathing dot grid that magnifies under the pointer; dots swell around
// the hovered icon and ripple out from icon clicks.
const vec3 COLOR = vec3(1.0, 0.67, 0.35);
const float SPACING = 22.0;

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

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	float spacing = SPACING * odPixelRatio;
	float lens = odPointerGlow(fragCoord, 140.0) * 0.35;
	vec2 p = fragCoord - (fragCoord - odPointer.xy) * lens;
	vec2 id = floor(p / spacing);
	vec2 center = (id + 0.5) * spacing;
	float wave = 0.5 + 0.5 * sin(dot(id, vec2(0.35, 0.22)) - iTime * 1.6);
	float hover = odHoverGlow(center, 36.0);
	float pulse = odPulseRing(center, 420.0, 30.0, 1.5);
	float radius = spacing * (0.08 + 0.06 * wave + 0.22 * hover + 0.2 * pulse + lens * 0.4);
	float d = length(p - center);
	float dotMask = 1.0 - smoothstep(radius - 1.0, radius + 1.0, d);
	float halo = exp(-max(d - radius, 0.0) / (spacing * 0.25)) * (hover + pulse) * 0.5;
	vec3 col = COLOR * (0.35 + 0.4 * wave) + vec3(1.0) * (hover * 0.4 + pulse * 0.6);
	vec3 bg = vec3(0.02) + COLOR * 0.04 * vnoise(fragCoord / iResolution.y * 4.0 + iTime * 0.1);
	fragColor = vec4(bg + col * dotMask + COLOR * halo, 1.0);
}
