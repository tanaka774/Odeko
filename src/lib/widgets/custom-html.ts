import DOMPurify from 'dompurify';

// Security policy for user-authored widget HTML (one channel for everything):
// - Scripts, event handlers, javascript: URLs, <style>/<link> are always removed;
//   styling must flow through the app-scoped Custom CSS editor.
// - Only the allowlists below survive. <iframe> is the one scripting escape
//   hatch: it must carry a sandbox, its tokens are filtered (see
//   SAFE_SANDBOX_TOKENS), and only srcdoc content is allowed — a remote src is
//   dropped. Links are hardened to open in the system browser, never navigate
//   the webview (see hardenAnchor).

/** Content tags the widget accepts. Everything else is removed by DOMPurify. */
const ALLOWED_TAGS = [
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'ul',
	'ol',
	'li',
	'dl',
	'dt',
	'dd',
	'table',
	'thead',
	'tbody',
	'tfoot',
	'tr',
	'th',
	'td',
	'caption',
	'a',
	'img',
	'blockquote',
	'pre',
	'code',
	'hr',
	'br',
	'div',
	'span',
	'strong',
	'em',
	'b',
	'i',
	'u',
	's',
	'del',
	'ins',
	'mark',
	'sub',
	'sup',
	'small',
	'iframe'
];

/** Attributes that survive on the allowed tags. */
const ALLOWED_ATTR = [
	'href',
	'src',
	'alt',
	'title',
	'class',
	'style',
	'sandbox',
	'srcdoc',
	'width',
	'height',
	'colspan',
	'rowspan',
	'scope',
	'start',
	'reversed',
	'type',
	'loading',
	'target',
	'rel',
	'id'
];

// Absolute http(s)/mailto links, bundled asset images, data: images and
// same-document fragments. Anything else (javascript:, relative paths,
// data:text/html, ...) is removed from href/src.
const ALLOWED_URI_REGEXP =
	/^(?:(?:https?|mailto):|asset:|data:image\/(?:png|jpe?g|gif|webp|svg\+xml|avif)[;,])|#/i;

// The dangerous sandbox tokens are always stripped, even if the user writes
// them: allow-same-origin (gives srcdoc frames the parent origin),
// allow-top-navigation, allow-popups-to-escape-sandbox and allow-popups (a
// popup window is a new browsing context the sandbox cannot fully constrain).
const SAFE_SANDBOX_TOKENS = new Set([
	'allow-scripts',
	'allow-forms',
	'allow-modals',
	'allow-pointer-lock',
	'allow-downloads'
]);

// DOMPurify's attribute-breakout guard strips any attribute whose value
// contains </style>/</script> — right for hrefs, but a false positive for a
// sandboxed iframe's srcdoc, whose whole point is to hold a full document.
// Remember the value here; afterSanitizeAttributes restores it on iframes
// that pass the sandbox policy.
const strippedSrcdoc = new WeakMap<Element, string>();

DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
	// Veto non-image data: URIs — DOMPurify's built-in DATA_URI_TAGS list
	// would otherwise allow any data: URI on <img>, bypassing
	// ALLOWED_URI_REGEXP entirely.
	if (
		(data.attrName === 'src' || data.attrName === 'href') &&
		/^data:/i.test(data.attrValue) &&
		!/^data:image\//i.test(data.attrValue)
	) {
		data.keepAttr = false;
	}

	if (data.attrName === 'srcdoc') {
		strippedSrcdoc.set(node, data.attrValue);
	}
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
	if (node.tagName === 'IFRAME') {
		const srcdoc = strippedSrcdoc.get(node);
		if (srcdoc && !node.hasAttribute('srcdoc')) {
			node.setAttribute('srcdoc', srcdoc);
		}
		guardIframe(node);
		return;
	}
	if (node.tagName === 'A') {
		hardenAnchor(node);
	}
});

// Drops iframes that are not safely sandboxed and rewrites the sandbox list.
// A frame without (useful) sandbox tokens or with a remote src is removed.
function guardIframe(node: Element) {
	const rawSandbox = node.getAttribute('sandbox') ?? '';
	const safeTokens = rawSandbox.split(/\s+/).filter((token) => SAFE_SANDBOX_TOKENS.has(token));

	if (safeTokens.length === 0 || node.hasAttribute('src')) {
		node.remove();
		return;
	}

	node.setAttribute('sandbox', safeTokens.join(' '));
}

// Makes anchors inert by default: the widget's own click listener opens
// absolute URLs in the system browser, so a click can never navigate the
// webview away from the launcher. Fragments scroll in place and stay.
function hardenAnchor(node: Element) {
	const href = node.getAttribute('href');

	if (!href) return;

	if (href.startsWith('#')) return;

	node.setAttribute('target', '_blank');
	node.setAttribute('rel', 'noopener noreferrer');
}

// Sanitizes user HTML for display inside the widget. The caller keeps the
// raw string in the config; only this sanitized output may reach the DOM.
export function sanitizeCustomHtml(html: string): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		ALLOWED_URI_REGEXP,
		// sandbox/srcdoc hold non-URI values and would be dropped by the
		// URI-safety check without this.
		ADD_URI_SAFE_ATTR: ['sandbox', 'srcdoc'],
		ALLOW_ARIA_ATTR: false,
		ALLOW_DATA_ATTR: false
	});
}
