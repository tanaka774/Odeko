// jsdom does not implement the Web Animations API or pointer capture.
// Svelte transitions call element.animate(), and the icon drag code calls
// setPointerCapture/releasePointerCapture, so stub them for component tests.

if (typeof Element !== 'undefined') {
	const fakeAnimation = () =>
		({
			finished: Promise.resolve(),
			cancel: () => {},
			play: () => {},
			pause: () => {},
			reverse: () => {},
			addEventListener: () => {},
			removeEventListener: () => {}
		}) as unknown as Animation;

	Element.prototype.animate = fakeAnimation as unknown as typeof Element.prototype.animate;
	Element.prototype.setPointerCapture =
		(() => {}) as unknown as typeof Element.prototype.setPointerCapture;
	Element.prototype.releasePointerCapture =
		(() => {}) as unknown as typeof Element.prototype.releasePointerCapture;
}

if (typeof Window !== 'undefined') {
	// Some components attach pointer handlers to <svelte:window>, where
	// event.currentTarget is the window object. jsdom's global `window` is a
	// proxy, so patch the prototype to cover the real target object too.
	const windowProto = Window.prototype as unknown as {
		setPointerCapture: (pointerId: number) => void;
		releasePointerCapture: (pointerId: number) => void;
	};
	const noop = () => {};
	windowProto.setPointerCapture = noop;
	windowProto.releasePointerCapture = noop;
}
