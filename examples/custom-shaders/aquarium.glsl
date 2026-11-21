// ASCII Aquarium
// A text-mode fish tank drawn as 5x5 pixel glyphs on a character grid.
// Click the water to drop food: the nearest fish swims over and eats it.
// Fish shy away from the pointer, bubbles rise and the seaweed sways.
const vec2 CELL = vec2(18.0, 24.0);
const float DOT_SIZE = 3.0;
const int FISH = 14;
// Fish stay inside this horizontal span (0-1), e.g. clear of side panels.
const vec2 SWIM_X = vec2(0.03, 0.8);
const float EAT = 3.2;
const float SINK = 22.0;

const int SP = 0;
const int GT = 1;
const int LT = 2;
const int LP = 3;
const int RP = 4;
const int OS = 5;
const int DOT = 6;
const int OB = 7;
const int TIL = 8;
const int US = 9;
const int COM = 10;
const int STAR = 11;
const int CAR = 12;
const int EQ = 13;
const int HRT = 14;
const int COL = 15;
const int DSH = 16;
const int PIP = 17;
const int FOOD = 18;
// Row-major 5x5 bitmaps, top row in the high bits.
const int GLYPHS[19] = int[19](0, 8521864, 2236546, 4464900, 4261956, 469440, 4194304, 15255086, 87296, 32505856, 8519680, 22483413, 324, 1016800, 4685802, 131200, 14336, 4329604, 473536);

// ><>  ><(o>  ><(((o>  and their mirror images
const int SMALL_R[3] = int[3](GT, LT, GT);
const int SMALL_L[3] = int[3](LT, GT, LT);
const int MID_R[5] = int[5](GT, LT, LP, OS, GT);
const int MID_L[5] = int[5](LT, OS, RP, GT, LT);
const int BIG_R[7] = int[7](GT, LT, LP, LP, LP, OS, GT);
const int BIG_L[7] = int[7](LT, OS, RP, RP, RP, GT, LT);

float hash11(float n) {
	return fract(sin(n * 12.9898 + 4.1414) * 43758.5453);
}

vec2 cellSize() {
	return CELL * odPixelRatio;
}

float floorY() {
	return cellSize().y * 2.5;
}

int fishLength(int i) {
	int kind = i % 3;
	return kind == 0 ? 3 : kind == 1 ? 5 : 7;
}

int fishGlyph(int i, bool right, int index) {
	int kind = i % 3;
	if (kind == 0) return right ? SMALL_R[index] : SMALL_L[index];
	if (kind == 1) return right ? MID_R[index] : MID_L[index];
	return right ? BIG_R[index] : BIG_L[index];
}

vec3 fishColor(int i) {
	vec3 palette[6] = vec3[6](
		vec3(1.0, 0.55, 0.15),
		vec3(1.0, 0.86, 0.3),
		vec3(0.35, 0.95, 1.0),
		vec3(1.0, 0.45, 0.7),
		vec3(0.6, 1.0, 0.45),
		vec3(0.75, 0.7, 1.0)
	);
	return palette[i % 6];
}

vec2 swimPath(int i, float t) {
	float fi = float(i);
	float speed = 0.07 + 0.11 * hash11(fi + 1.0);
	float x = mix(SWIM_X.x, SWIM_X.y, 0.5 + 0.5 * sin(t * speed + hash11(fi + 7.0) * 6.2832));
	float lane = mix(0.2, 0.86, (fi + hash11(fi * 3.1 + 2.0)) / float(FISH));
	float y = lane + 0.025 * sin(t * 0.6 + fi * 1.7);
	return vec2(x, y) * iResolution.xy;
}

vec2 foodPos(vec3 click, float age) {
	float y = max(click.y - SINK * odPixelRatio * age, floorY());
	return vec2(click.x, y);
}

vec2 fishPos(int i, float back, int eater[8]) {
	vec2 p = swimPath(i, iTime - back);
	for (int k = 0; k < 8; k++) {
		if (eater[k] != i) continue;
		float age = odClicks[k].z - back;
		if (age < 0.0) continue;
		// Arrives just before EAT, nibbles, then drifts back to its lane.
		float pull = smoothstep(0.0, EAT * 0.8, age) * (1.0 - smoothstep(EAT + 0.3, EAT + 3.0, age));
		p = mix(p, foodPos(odClicks[k], min(age, EAT)), pull);
	}
	vec2 away = p - odPointer.xy;
	float dist = length(away) / odPixelRatio;
	p += normalize(away + 1e-4) * 70.0 * odPixelRatio * odPointer.z * exp(-dist / 110.0);
	return p;
}

float glyphPixel(int id, vec2 local) {
	if (id == SP) return 0.0;
	float g = DOT_SIZE * odPixelRatio;
	vec2 q = floor((local - (CELL - 5.0 * DOT_SIZE) * 0.5 * odPixelRatio) / g);
	if (q.x < 0.0 || q.y < 0.0 || q.x > 4.0 || q.y > 4.0) return 0.0;
	int bit = (4 - int(q.y)) * 5 + (4 - int(q.x));
	return float((GLYPHS[id] >> bit) & 1);
}

bool sameCell(vec2 cell, vec2 p) {
	return all(equal(cell, floor(p / cellSize())));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 cs = cellSize();
	vec2 cell = floor(fragCoord / cs);
	vec2 local = fragCoord - cell * cs;
	float rows = floor(iResolution.y / cs.y);
	vec2 uv = fragCoord / iResolution.xy;

	vec3 water = mix(vec3(0.005, 0.03, 0.07), vec3(0.02, 0.16, 0.27), uv.y);
	float ray = pow(max(0.0, sin(uv.x * 7.0 + uv.y * 2.5 + iTime * 0.2)), 10.0) * uv.y;
	water += vec3(0.04, 0.12, 0.14) * ray;
	water += vec3(0.05, 0.16, 0.2) * odPointerGlow(fragCoord, 160.0);

	int glyph = SP;
	vec3 ink = vec3(0.0);

	// Sand
	if (cell.y < 2.0) {
		float h = hash11(cell.x * 1.31 + cell.y * 57.0);
		if (cell.y == 0.0) glyph = h > 0.85 ? DOT : US;
		else glyph = h > 0.82 ? COM : h > 0.66 ? DOT : SP;
		ink = mix(vec3(0.55, 0.45, 0.28), vec3(0.8, 0.68, 0.45), h);
	}

	// Surface
	if (cell.y == rows - 1.0) {
		glyph = sin(cell.x * 0.45 + iTime * 1.8) > -0.3 ? TIL : DSH;
		ink = vec3(0.55, 0.85, 0.95);
	}

	// Seaweed
	float weed = hash11(cell.x * 1.37);
	if (weed > 0.8 && cell.y >= 2.0) {
		float height = 2.0 + floor(hash11(cell.x * 7.7) * 7.0);
		float row = cell.y - 2.0;
		if (row < height) {
			float sway = floor(iTime * 1.2 + cell.x + row * 0.35);
			glyph = mod(row + sway, 2.0) < 1.0 ? LP : RP;
			ink = mix(vec3(0.1, 0.55, 0.3), vec3(0.35, 0.85, 0.4), row / height);
		}
	}

	// Drifting specks
	if (glyph == SP && hash11(dot(cell, vec2(1.7, 9.3)) + floor(iTime * 0.4)) > 0.997) {
		glyph = DOT;
		ink = vec3(0.3, 0.45, 0.55);
	}

	// Bubbles
	float cols = floor(iResolution.x / cs.x);
	for (int s = 0; s < 8; s++) {
		float fs = float(s);
		float span = rows - 3.0;
		float travel = iTime * (1.5 + hash11(fs) * 1.5) + hash11(fs + 3.0) * span;
		float lap = floor(travel / span);
		float y = 2.0 + mod(travel, span);
		float x = floor(hash11(fs * 5.3 + lap * 1.9) * cols) + floor(sin(iTime * 2.0 + fs) * 0.6 + 0.5);
		for (int b = 0; b < 3; b++) {
			float by = floor(y - float(b) * 2.0);
			if (by < 2.0) continue;
			if (cell.x == x && cell.y == by) {
				float t = (by - 2.0) / span;
				glyph = t < 0.35 ? DOT : t < 0.75 ? OS : OB;
				ink = vec3(0.6, 0.9, 1.0) * (0.6 + 0.4 * t);
			}
		}
	}

	// Food and the fish each click calls over
	int eater[8];
	for (int k = 0; k < 8; k++) {
		eater[k] = -1;
		vec3 click = odClicks[k];
		if (click.z > EAT + 3.0) continue;
		vec2 food = foodPos(click, 0.0);
		float best = 1e9;
		for (int i = 0; i < FISH; i++) {
			float d = distance(swimPath(i, iTime - click.z), food);
			if (d < best) {
				best = d;
				eater[k] = i;
			}
		}
		if (click.z < EAT && sameCell(cell, foodPos(click, click.z))) {
			glyph = FOOD;
			ink = vec3(0.95, 0.7, 0.35);
		}
		float after = click.z - EAT;
		if (after > 0.0 && after < 1.5) {
			vec2 heart = foodPos(click, EAT) + vec2(0.0, cs.y * (1.0 + after * 2.0));
			if (sameCell(cell, heart)) {
				glyph = HRT;
				ink = vec3(1.0, 0.4, 0.6) * (1.0 - after / 1.5 * 0.6);
			}
		}
	}

	// Fish
	for (int i = 0; i < FISH; i++) {
		vec2 head = fishPos(i, 0.0, eater);
		vec2 before = fishPos(i, 0.15, eater);
		bool right = head.x >= before.x;
		vec2 hc = floor(head / cs);
		if (cell.y != hc.y) continue;
		int len = fishLength(i);
		int index = right ? int(cell.x - (hc.x - float(len) + 1.0)) : int(cell.x - hc.x);
		if (index < 0 || index >= len) continue;
		glyph = fishGlyph(i, right, index);
		ink = fishColor(i);
	}

	float on = glyphPixel(glyph, local);
	vec3 col = water + ink * on * 1.1;
	col += ink * 0.1 * float(glyph != SP);
	fragColor = vec4(col, 1.0);
}
