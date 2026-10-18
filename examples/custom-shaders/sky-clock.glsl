// Sky Clock
// A sky that follows your real local time: the sun rises at 6:00 and sets at
// 18:00, sunsets glow, and the moon and stars come out at night.
const float PI = 3.14159265;

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

vec2 arc(float angle, float aspect) {
	return vec2(aspect * (0.5 - 0.42 * cos(angle)), 0.12 + 0.72 * sin(angle));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	float aspect = iResolution.x / iResolution.y;
	vec2 uv = fragCoord / iResolution.xy;
	vec2 p = vec2(uv.x * aspect, uv.y);
	float hours = iDate.w / 3600.0;
	float sunAngle = (hours - 6.0) / 12.0 * PI;
	float elevation = sin(sunAngle);
	float day = smoothstep(-0.1, 0.3, elevation);
	float sunset = exp(-pow(elevation * 4.0, 2.0));

	vec3 top = mix(vec3(0.01, 0.015, 0.05), vec3(0.22, 0.45, 0.9), day);
	vec3 horizon = mix(vec3(0.04, 0.05, 0.13), vec3(0.65, 0.8, 1.0), day);
	top = mix(top, vec3(0.3, 0.22, 0.45), sunset * 0.6);
	horizon = mix(horizon, vec3(1.0, 0.45, 0.2), sunset * 0.8);
	vec3 col = mix(horizon, top, pow(uv.y, 0.7));

	vec2 cell = floor(fragCoord / (3.0 * odPixelRatio));
	float star = step(0.997, hash21(cell)) * (0.6 + 0.4 * sin(iTime * 3.0 + hash21(cell + 1.0) * 30.0));
	col += star * (1.0 - day) * smoothstep(0.2, 0.6, uv.y);

	float sunDist = length(p - arc(sunAngle, aspect));
	col += vec3(1.0, 0.85, 0.6) * (smoothstep(0.035, 0.03, sunDist) + 0.3 * exp(-sunDist * 6.0)) * step(-0.2, elevation);
	float moonDist = length(p - arc(sunAngle + PI, aspect));
	col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.025, 0.02, moonDist) * 0.9 + 0.08 * exp(-moonDist * 10.0)) * (1.0 - day);

	float hills = 0.12 + 0.04 * sin(uv.x * 6.0 + 1.0) + 0.02 * sin(uv.x * 17.0);
	col = mix(col, horizon * 0.15, smoothstep(hills + 0.002, hills - 0.002, uv.y));
	col += vec3(1.0, 0.9, 0.7) * odHoverGlow(fragCoord, 40.0) * 0.25;
	fragColor = vec4(col, 1.0);
}
