import { describe, it, expect } from 'vitest';
import { isVideoBackground, backgroundFilePath } from './background';

describe('isVideoBackground', () => {
	it('detects common video extensions', () => {
		expect(isVideoBackground('/home/user/wallpaper.mp4')).toBe(true);
		expect(isVideoBackground('/home/user/wallpaper.webm')).toBe(true);
		expect(isVideoBackground('/home/user/wallpaper.mov')).toBe(true);
		expect(isVideoBackground('/home/user/wallpaper.m4v')).toBe(true);
		expect(isVideoBackground('/home/user/wallpaper.ogv')).toBe(true);
		expect(isVideoBackground('/home/user/wallpaper.mkv')).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(isVideoBackground('/home/user/WALLPAPER.MP4')).toBe(true);
		expect(isVideoBackground('/home/user/Wallpaper.WebM')).toBe(true);
	});

	it('detects videos behind asset protocol URLs', () => {
		expect(isVideoBackground('asset://localhost/home/user/bg.mp4')).toBe(true);
		expect(isVideoBackground('http://asset.localhost/home/user/bg.webm')).toBe(true);
	});

	it('ignores query strings and fragments', () => {
		expect(isVideoBackground('https://example.com/bg.mp4?token=abc')).toBe(true);
		expect(isVideoBackground('https://example.com/bg.png?file=mp4')).toBe(false);
	});

	it('returns false for images', () => {
		expect(isVideoBackground('/home/user/bg.png')).toBe(false);
		expect(isVideoBackground('/home/user/bg.gif')).toBe(false);
		expect(isVideoBackground('/home/user/bg.webp')).toBe(false);
	});

	it('returns false for empty or extension-less values', () => {
		expect(isVideoBackground(null)).toBe(false);
		expect(isVideoBackground(undefined)).toBe(false);
		expect(isVideoBackground('')).toBe(false);
		expect(isVideoBackground('/home/user/no-extension')).toBe(false);
	});
});

describe('backgroundFilePath', () => {
	it('returns plain paths unchanged', () => {
		expect(backgroundFilePath('/home/user/videos/bg.mp4')).toBe('/home/user/videos/bg.mp4');
	});

	it('decodes asset://localhost URLs', () => {
		expect(backgroundFilePath('asset://localhost/%2Fhome%2Fuser%2Fmy%20video.mp4')).toBe(
			'/home/user/my video.mp4'
		);
	});

	it('decodes asset.localhost URLs (Windows/Android form)', () => {
		expect(backgroundFilePath('http://asset.localhost/C%3A%5Cvideos%5Cbg.mp4')).toBe(
			'C:\\videos\\bg.mp4'
		);
	});

	it('returns null for remote and inline sources', () => {
		expect(backgroundFilePath('https://example.com/bg.mp4')).toBeNull();
		expect(backgroundFilePath('http://example.com/bg.mp4')).toBeNull();
		expect(backgroundFilePath('data:video/mp4;base64,AAAA')).toBeNull();
	});
});
