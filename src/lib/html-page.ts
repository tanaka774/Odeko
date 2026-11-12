// HTML background layers and Custom HTML widgets run as full pages in a
// sandboxed iframe (scripts only, opaque origin). The page gets a small
// `odeko` helper, and its https script URLs are routed through the app's
// library cache so libraries download once and work offline. With scripts
// off, a CSP lets only the helper run.
//
// Every message a page sends carries the token it was built with: WebKitGTK
// does not report which frame an opaque-origin message came from, so the
// token is what ties a request to its widget.

export type PageKind = 'background' | 'widget';

// Injected first into every page. Kept dependency-free and in plain ES5 so
// it runs before (and regardless of) the page's own code.
function helperScript(token: string, kind: PageKind): string {
	return `(function () {
	var TOKEN = ${JSON.stringify(token)};
	var KIND = ${JSON.stringify(kind)};
	var listeners = { frame: [], pause: [], resume: [], storage: [] };
	var pending = {};
	var nextId = 1;
	var data = {};
	function send(message) {
		message.token = TOKEN;
		parent.postMessage(message, '*');
	}
	function request(message) {
		return new Promise(function (resolve, reject) {
			var id = nextId++;
			pending[id] = { resolve: resolve, reject: reject };
			message.id = id;
			send(message);
		});
	}
	var odeko = {
		kind: KIND,
		state: null,
		paused: false,
		on: function (type, callback) {
			if (listeners[type]) listeners[type].push(callback);
		},
		fetch: function (url) {
			return request({ kind: 'widget-fetch', url: String(url), from: KIND });
		},
		open: function (url) {
			send({ kind: 'odeko-open', url: String(url) });
		}
	};
	if (KIND === 'widget') {
		odeko.storage = {
			ready: request({ kind: 'odeko-storage-load' }).then(function (values) {
				data = values || {};
				return data;
			}),
			get: function (key) {
				return this.ready.then(function () {
					var value = data[String(key)];
					return value === undefined ? null : JSON.parse(value);
				});
			},
			set: function (key, value) {
				var text = JSON.stringify(value);
				if (text === undefined) return this.remove(key);
				return this.ready.then(function () {
					data[String(key)] = text;
					return request({ kind: 'odeko-storage-set', key: String(key), value: text });
				});
			},
			remove: function (key) {
				return this.ready.then(function () {
					delete data[String(key)];
					return request({ kind: 'odeko-storage-set', key: String(key), value: null });
				});
			},
			keys: function () {
				return this.ready.then(function () { return Object.keys(data); });
			}
		};
	}
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
		} else if (msg.kind === 'odeko-reply' && pending[msg.id]) {
			var entry = pending[msg.id];
			delete pending[msg.id];
			if (msg.ok) entry.resolve(msg.value);
			else entry.reject(new Error(msg.error || 'request failed'));
		}
	});
	// Links never navigate the frame: absolute ones open in the browser.
	document.addEventListener('click', function (event) {
		var target = event.target;
		var anchor = target && target.closest ? target.closest('a[href]') : null;
		if (!anchor || event.defaultPrevented) return;
		var href = anchor.getAttribute('href') || '';
		if (href.charAt(0) === '#') return;
		event.preventDefault();
		if (/^(https?|mailto):/i.test(href)) odeko.open(href);
	});
	// WebKitGTK sends right-clicks into the frame despite pointer-events:
	// none, so hand them back to the app instead of opening the page's menu.
	window.addEventListener('contextmenu', function (event) {
		event.preventDefault();
		send({ kind: 'odeko-contextmenu', x: event.clientX, y: event.clientY });
	});
	// An interactive page takes the pointer and focus away from the app; pass
	// them on so other layers keep tracking and app shortcuts keep working.
	function forwardPointer(event) {
		send({ kind: 'odeko-pointer', type: event.type, x: event.clientX, y: event.clientY, button: event.button });
	}
	window.addEventListener('pointermove', forwardPointer, true);
	window.addEventListener('pointerdown', forwardPointer, true);
	window.addEventListener('pointerup', forwardPointer, true);
	window.addEventListener('keydown', function (event) {
		var target = event.target;
		if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		setTimeout(function () {
			if (event.defaultPrevented) return;
			send({
				kind: 'odeko-key',
				key: event.key,
				code: event.code,
				ctrlKey: event.ctrlKey,
				altKey: event.altKey,
				shiftKey: event.shiftKey,
				metaKey: event.metaKey
			});
		});
	});
	window.odeko = odeko;
})();`;
}

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

// Widgets start transparent with readable text, so a page that sets nothing
// looks at home on the widget's own background.
const WIDGET_BASE_STYLE =
	'<style>html{color-scheme:dark}body{margin:0;color:#fff;font-family:system-ui,sans-serif;background:transparent}</style>';

/**
 * The helper goes before the page's own markup, so nothing in the page can
 * run first. The leading doctype keeps standards mode; the page's own
 * doctype after it is ignored.
 */
export function buildSrcdoc(
	source: string,
	scripts: boolean,
	libraryBase: string | null,
	token: string,
	kind: PageKind
): string {
	const nonce = crypto.randomUUID();
	const csp = scripts
		? ''
		: `<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}'">`;
	const page = scripts && libraryBase ? rewriteLibraryUrls(source, libraryBase) : source;
	const base = kind === 'widget' ? WIDGET_BASE_STYLE : '';
	return `<!doctype html>${csp}<script nonce="${nonce}">${helperScript(token, kind)}</script>${base}${page}`;
}
