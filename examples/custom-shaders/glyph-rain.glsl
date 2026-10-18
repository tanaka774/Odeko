// Glyph Rain
// Columns of random glyphs falling at different speeds; they light up near
// the pointer, the hovered icon and icon clicks.
const vec3 COLOR = vec3(0.31, 1.0, 0.55);
const float CELL = 12.0;

float hash11(float n) { return fract(sin(n) * 43758.5453123); }

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float glyphBit(int bits, vec2 cellUv) {
	vec2 sub = floor(cellUv * vec2(6.0, 7.0));
	if (sub.x > 4.0 || sub.y < 1.0 || sub.y > 5.0) return 0.0;
	int index = (5 - int(sub.y)) * 5 + int(sub.x);
	return float((bits >> index) & 1);
}

// Random left half mirrored to the right, which reads as a glyph.
int randomGlyph(float seed) {
	int bits = 0;
	for (int row = 0; row < 5; row++) {
		int left = int(hash11(seed * 7.13 + float(row) * 1.91) * 8.0);
		int mirrored = (left & 1) << 4 | (left & 2) << 2 | (left & 4);
		bits |= ((left & 3) | mirrored) << (row * 5);
	}
	return bits;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	float cell = CELL * odPixelRatio;
	vec2 id = floor(fragCoord / cell);
	vec2 uv = fract(fragCoord / cell);
	vec2 center = (id + 0.5) * cell;
	float rows = ceil(iResolution.y / cell);
	float speed = 5.0 + 9.0 * hash11(id.x);
	float len = 8.0 + 18.0 * hash11(id.x + 7.0);
	float head = mod(iTime * speed + hash11(id.x + 3.0) * 400.0, rows + len);
	float behind = head - (rows - id.y - 1.0);
	float trail = behind >= 0.0 && behind < len ? 1.0 - behind / len : 0.0;
	float isHead = behind >= 0.0 && behind < 1.0 ? 1.0 : 0.0;
	float lift = odHoverGlow(center, 30.0) + odPointerGlow(center, 70.0) * 0.6
		+ odPulseRing(center, 480.0, 26.0, 1.8);
	float rate = 2.0 + 10.0 * hash21(id);
	float ink = glyphBit(randomGlyph(hash21(id + floor(iTime * rate) * 0.37)), uv);
	float glow = trail * trail + lift * 0.7 * (0.35 + trail);
	vec3 col = COLOR * glow + vec3(0.85) * (isHead + lift * 0.25) * trail;
	fragColor = vec4(vec3(0.01) + col * ink, 1.0);
}
