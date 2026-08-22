// Helpers for the launcher background media (image or video).

// Video containers the webview can decode natively (hardware accelerated).
// mkv is a container, so it still needs the codecs inside (H.264/VP9/...) to
// be available in the platform's GStreamer/WebKit setup.
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'];

// Returns the lowercase file extension without dot, or '' when absent.
function fileExtension(path: string): string {
	const clean = path.split(/[?#]/)[0];
	const dot = clean.lastIndexOf('.');
	return dot < 0 ? '' : clean.slice(dot + 1).toLowerCase();
}

// Returns true when the given background path/URL points to a video file.
// Works for plain paths, asset: URLs and http(s) URLs.
export function isVideoBackground(path: string | null | undefined): boolean {
	if (!path) return false;
	return VIDEO_EXTENSIONS.includes(fileExtension(path));
}

// Extracts the real filesystem path from a local background value.
// Handles plain paths and asset-protocol URLs (asset://localhost/<encoded>
// on Linux/macOS, http(s)://asset.localhost/<encoded> on Windows/Android).
// Returns null for remote (http/https) and inline (data:) sources.
export function backgroundFilePath(src: string): string | null {
	if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
		// ...unless it is an asset.localhost URL, which wraps a local path.
		const match = src.match(/^https?:\/\/asset\.localhost\/(.+)$/);
		return match ? decodeURIComponent(match[1]) : null;
	}
	if (src.startsWith('asset://localhost/')) {
		return decodeURIComponent(src.slice('asset://localhost/'.length));
	}
	return src;
}
