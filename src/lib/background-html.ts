// HTML background layers run in a sandboxed iframe (scripts only, opaque
// origin). The page gets a small `odeko` helper with the same pointer, icon
// and click inputs shaders get, and its https script URLs are routed through
// the app's library cache so libraries download once and work offline.
// With scripts off, a CSP lets only the helper run.

// Injected first into every page. Kept dependency-free and in plain ES5 so
// it runs before (and regardless of) the page's own code.
export const HELPER_SCRIPT = `(function () {
	var listeners = { frame: [], pause: [], resume: [] };
	var pending = {};
	var nextId = 1;
	var odeko = {
		state: null,
		paused: false,
		on: function (type, callback) {
			if (listeners[type]) listeners[type].push(callback);
		},
		fetch: function (url) {
			return new Promise(function (resolve, reject) {
				var id = nextId++;
				pending[id] = { resolve: resolve, reject: reject };
				parent.postMessage({ kind: 'widget-fetch', id: id, url: String(url), from: 'background' }, '*');
			});
		}
	};
	function emit(type, value) {
		for (var i = 0; i < listeners[type].length; i++) listeners[type][i](value);
	}
	window.addEventListener('message', function (event) {
		var msg = event.data;
		if (!msg || typeof msg.kind !== 'string') return;
		if (msg.kind === 'odeko-frame') {
			odeko.state = msg.state;
			emit('frame', msg.state);
		} else if (msg.kind === 'odeko-pause') {
			odeko.paused = true;
			emit('pause');
		} else if (msg.kind === 'odeko-resume') {
			odeko.paused = false;
			emit('resume');
		} else if (msg.kind === 'widget-fetch-result' && pending[msg.id]) {
			var entry = pending[msg.id];
			delete pending[msg.id];
			if (msg.ok) entry.resolve({ status: msg.status, body: msg.body });
			else entry.reject(new Error(msg.error || 'request failed'));
		}
	});
	// WebKitGTK sends right-clicks into the frame despite pointer-events:
	// none, so hand them back to the app instead of opening the page's menu.
	window.addEventListener('contextmenu', function (event) {
		event.preventDefault();
		parent.postMessage({ kind: 'odeko-contextmenu', x: event.clientX, y: event.clientY }, '*');
	});
	// An interactive page takes the pointer and focus away from the app; pass
	// them on so other layers keep tracking and app shortcuts keep working.
	function forwardPointer(event) {
		parent.postMessage(
			{ kind: 'odeko-pointer', type: event.type, x: event.clientX, y: event.clientY, button: event.button },
			'*'
		);
	}
	window.addEventListener('pointermove', forwardPointer, true);
	window.addEventListener('pointerdown', forwardPointer, true);
	window.addEventListener('pointerup', forwardPointer, true);
	window.addEventListener('keydown', function (event) {
		var target = event.target;
		if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		setTimeout(function () {
			if (event.defaultPrevented) return;
			parent.postMessage(
				{
					kind: 'odeko-key',
					key: event.key,
					code: event.code,
					ctrlKey: event.ctrlKey,
					altKey: event.altKey,
					shiftKey: event.shiftKey,
					metaKey: event.metaKey
				},
				'*'
			);
		});
	});
	window.odeko = odeko;
})();`;

/** Routes https script/module URLs through the library cache at `base`. */
export function rewriteLibraryUrls(source: string, base: string): string {
	const viaCache = (prefix: string) => `${prefix}${base}`;
	return (
		source
			// <script src="https://...">
			.replace(/(<script\b[^>]*?\bsrc\s*=\s*["'])https:\/\//gi, (_, prefix) => viaCache(prefix))
			// import maps: every https URL inside them
			.replace(
				/(<script\b[^>]*\btype\s*=\s*["']importmap["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
				(_, open, body: string, close) =>
					open + body.replace(/(["'])https:\/\//g, (_m: string, q: string) => viaCache(q)) + close
			)
			// import ... from "https://...", import("https://..."), import "https://..."
			.replace(/(\bfrom\s*["']|\bimport\s*\(\s*["']|\bimport\s+["'])https:\/\//g, (_, prefix) =>
				viaCache(prefix)
			)
	);
}

/**
 * The helper goes before the page's own markup, so nothing in the page can
 * run first. The leading doctype keeps standards mode; the page's own
 * doctype after it is ignored.
 */
export function buildSrcdoc(source: string, scripts: boolean, libraryBase: string | null): string {
	const nonce = crypto.randomUUID();
	const csp = scripts
		? ''
		: `<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}'">`;
	const page = scripts && libraryBase ? rewriteLibraryUrls(source, libraryBase) : source;
	return `<!doctype html>${csp}<script nonce="${nonce}">${HELPER_SCRIPT}</script>${page}`;
}
