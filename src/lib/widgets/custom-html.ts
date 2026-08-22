import DOMPurify from 'dompurify';

/**
 * Sanitizer for user-authored HTML in the Custom HTML widget.
 *
 * Policy (one channel for everything):
 * - Scripts, event handlers, javascript: URLs, <style> and <link> are always
 *   removed — all styling must flow through the Custom CSS editor, which the
 *   app scopes to the widget instance. Inline <style> would bypass that
 *   scoping and leak globally, so it is stripped here.
 * - Only an explicit allowlist of content tags survives. That automatically
 *   excludes <script>, <form>, form controls, media elements, <object>,
 *   <embed>, <base> and <meta>.
 * - <iframe> is the one "interactive" escape hatch: it must carry a sandbox
 *   attribute, its token list is filtered to a safe subset (notably
 *   `allow-same-origin` is stripped, because combined with srcdoc it would
 *   give frame scripts the app's origin), and only srcdoc content is allowed
 *   — a remote `src` is dropped.
 * - Links keep http(s)/mailto hrefs and fragments; the widget's click handler
 *   opens absolute URLs in the system browser instead of letting the webview
 *   navigate away from the launcher.
 */

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

/**
 * Absolute http(s)/mailto links, bundled asset images (`asset:` protocol),
 * data: images and same-document fragments. Anything else (javascript:,
 * relative paths, data:text/html, …) is removed from href/src.
 */
const ALLOWED_URI_REGEXP =
	/^(?:(?:https?|mailto):|asset:|data:image\/(?:png|jpe?g|gif|webp|svg\+xml|avif)[;,])|#/i;

/**
 * Sandbox tokens we keep. The dangerous ones — `allow-same-origin` (gives
 * srcdoc frames the parent origin), `allow-top-navigation` and
 * `allow-popups-to-escape-sandbox` — are always stripped, even if the user
 * writes them.
 */
const SAFE_SANDBOX_TOKENS = new Set([
	'allow-scripts',
	'allow-forms',
	'allow-popups',
	'allow-modals',
	'allow-pointer-lock',
	'allow-downloads'
]);

/**
 * DOMPurify 3.4 registers hooks globally via addHook (per-call config hooks
 * are ignored). This module is the only DOMPurify consumer in the app, so the
 * hooks below define the app-wide policy — they only act on elements that
 * matter here and are registered once at module load.
 */

/** srcdoc values the attribute-breakout guard strips (see the hook below). */
const strippedSrcdoc = new WeakMap<Element, string>();

// Veto non-image data: URIs. DOMPurify allows any data: URI on <img> via its
// built-in DATA_URI_TAGS list, which bypasses ALLOWED_URI_REGEXP entirely.
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
	if (
		(data.attrName === 'src' || data.attrName === 'href') &&
		/^data:/i.test(data.attrValue) &&
		!/^data:image\//i.test(data.attrValue)
	) {
		data.keepAttr = false;
	}

	// DOMPurify's attribute-breakout guard removes any attribute whose value
	// contains `</style>`, `</script>` and friends — which is right for hrefs
	// but a false positive for a sandboxed iframe's srcdoc, whose whole point
	// is to hold a full HTML document. Remember the value; the
	// afterSanitizeAttributes hook restores it on iframes that pass the
	// sandbox policy.
	if (data.attrName === 'srcdoc') {
		strippedSrcdoc.set(node, data.attrValue);
	}
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
	if (node.tagName === 'IFRAME') {
		// Restore the srcdoc the attribute guard stripped (see above), then
		// apply the sandbox policy — guardIframe may still remove the node.
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

/** Drops iframes that are not safely sandboxed and rewrites the sandbox list. */
function guardIframe(node: Element) {
	const rawSandbox = node.getAttribute('sandbox') ?? '';
	const safeTokens = rawSandbox.split(/\s+/).filter((token) => SAFE_SANDBOX_TOKENS.has(token));

	// No (useful) sandbox, or a remote src: not allowed in v1. srcdoc only.
	if (safeTokens.length === 0 || node.hasAttribute('src')) {
		node.remove();
		return;
	}

	node.setAttribute('sandbox', safeTokens.join(' '));
}

/**
 * Makes anchors inert by default: the widget's own click listener intercepts
 * them, so if that listener ever fails to run (or the markup is rendered
 * elsewhere) the click still cannot navigate the webview.
 */
function hardenAnchor(node: Element) {
	const href = node.getAttribute('href');
	// No href (or one that sanitization already stripped) cannot navigate.
	if (!href) return;
	// Fragments scroll inside the document and never leave the app — leave
	// them alone so in-widget anchors keep working.
	if (href.startsWith('#')) return;

	node.setAttribute('target', '_blank');
	node.setAttribute('rel', 'noopener noreferrer');
}

/**
 * Sanitizes user HTML for display inside the widget. The caller keeps the
 * raw string in the config; only the sanitized output may reach the DOM.
 */
export function sanitizeCustomHtml(html: string): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		ALLOWED_URI_REGEXP,
		// sandbox/srcdoc contain non-URI values and would be dropped by the
		// URI-safety check without this.
		ADD_URI_SAFE_ATTR: ['sandbox', 'srcdoc'],
		ALLOW_ARIA_ATTR: false,
		ALLOW_DATA_ATTR: false
	});
}
