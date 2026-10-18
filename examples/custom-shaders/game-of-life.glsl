// Game of Life
// Conway's Game of Life. The pointer draws live cells, cells sprout around
// the hovered icon, and clicks drop gliders. Dead cells leave a fading
// trail. The feedback buffer stores the board.
const float CELL = 6.0;
const int STEP_FRAMES = 5;
const vec3 ALIVE = vec3(0.55, 1.0, 0.75);
const vec3 TRAIL = vec3(0.1, 0.35, 0.6);

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

bool isGlider(vec2 rel) {
	return rel == vec2(0.0, 1.0) || rel == vec2(1.0, 0.0) || rel == vec2(-1.0, -1.0)
		|| rel == vec2(0.0, -1.0) || rel == vec2(1.0, -1.0);
}

void bufferImage(out vec4 fragColor, in vec2 fragCoord) {
	float cell = CELL * odPixelRatio;
	vec2 id = floor(fragCoord / cell);
	vec2 center = (id + 0.5) * cell;
	vec4 self = odBufferAt(center);
	// The buffer starts zeroed (also after a resize): a = 0 means "not seeded yet".
	if (self.a < 0.5) {
		float seeded = step(0.8, hash21(id + fract(iTime)));
		fragColor = vec4(seeded, seeded, 0.0, 1.0);
		return;
	}
	float alive = self.r;
	if (iFrame % STEP_FRAMES == 0) {
		int n = 0;
		for (int y = -1; y <= 1; y++) {
			for (int x = -1; x <= 1; x++) {
				if (x == 0 && y == 0) continue;
				n += int(odBufferAt(center + vec2(x, y) * cell).r > 0.5);
			}
		}
		alive = (n == 3 || (alive > 0.5 && n == 2)) ? 1.0 : 0.0;
		if (hash21(id + floor(iTime * 10.0)) > 0.9995) alive = 1.0;
	}
	float noise = hash21(id + floor(iTime * 20.0));
	if (odPointer.z > 0.5 && length(center - odPointer.xy) < 1.5 * cell && noise > 0.4) alive = 1.0;
	float edge = odHoverDistance(center);
	if (odHoverAmount > 0.5 && edge > 0.0 && edge < CELL * 2.0 && noise > 0.97) alive = 1.0;
	for (int i = 0; i < 8; i++) {
		vec3 click = odClicks[i];
		if (click.z < iTimeDelta * 1.5 && isGlider(id - floor(click.xy / cell))) alive = 1.0;
	}
	float trail = alive > 0.5 ? 1.0 : self.g * 0.94;
	fragColor = vec4(alive, trail, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	float cell = CELL * odPixelRatio;
	vec2 center = (floor(fragCoord / cell) + 0.5) * cell;
	vec4 state = odBufferAt(center);
	vec2 local = abs(fract(fragCoord / cell) - 0.5);
	float square = step(max(local.x, local.y), 0.38);
	vec3 col = mix(TRAIL * state.g * 0.6, ALIVE, state.r) * square;
	fragColor = vec4(vec3(0.015, 0.02, 0.03) + col, 1.0);
}
