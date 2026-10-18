// Starter
// Shows every Odeko input: a glow around the hovered icon, a soft light
// under the pointer and a ring when an icon is clicked.
const vec3 COLOR = vec3(1.0, 0.47, 0.78);

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 uv = fragCoord / iResolution.xy;
	vec3 col = COLOR * (0.25 + 0.25 * sin(iTime + uv.xyx * 4.0));
	col += COLOR * odHoverGlow(fragCoord, 40.0);
	col += COLOR * odPointerGlow(fragCoord, 120.0) * 0.5;
	col += vec3(1.0) * odPulseRing(fragCoord, 500.0, 20.0, 1.5);
	fragColor = vec4(col, 1.0);
}
