<script lang="ts">
	import { prefixSelectors } from './custom-css';
	import type { WidgetAppearanceConfig } from './types';

	interface Props {
		/** Stable instance id; must match the `data-item-id` on the icon's root. */
		id: string;
		appearance?: WidgetAppearanceConfig;
	}

	let { id, appearance = {} }: Props = $props();

	// Injects the user's custom CSS scoped to this widget instance. The effect
	// re-runs on every appearance change, and the cleanup removes the style
	// element so nothing leaks after the widget is deleted or the CSS is
	// cleared. The element is appended to <head> after the app's stylesheet,
	// so on a specificity tie the user's rules win.
	//
	// `appearance` can arrive as null: Rust serializes an absent icon
	// appearance as JSON null, and prop defaults don't apply to null. Guard
	// before dereferencing — a TypeError here aborts the whole effect flush,
	// silently killing custom CSS for every icon mounted after this one.
	$effect(() => {
		const css = appearance?.customCss;
		if (!appearance?.customCssEnabled || !css?.trim()) return;

		const styleEl = document.createElement('style');
		styleEl.dataset.widgetCss = id;
		styleEl.textContent = prefixSelectors(css, `[data-item-id="${id}"]`);
		document.head.appendChild(styleEl);

		return () => {
			styleEl.remove();
		};
	});
</script>
