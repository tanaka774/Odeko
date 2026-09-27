import type { CanvasIcon } from '$lib/icons';
import type { WidgetAppearanceConfig, WidgetConfigType } from '$lib/widgets/types';

/**
 * Dispatches "apply these appearance properties to every icon and widget"
 * requests.
 *
 * The icon list is owned by IconGrid.svelte, which registers the real handler
 * on mount. Appearance editors (item settings modals, the app settings
 * default-appearance section) call `applyAppearanceToAllItems` instead of
 * threading a callback through every modal in the tree.
 */
type BulkAppearanceHandler = (appearance: WidgetAppearanceConfig) => void;

let applyToAllHandler: BulkAppearanceHandler | null = null;

export function setBulkAppearanceHandler(handler: BulkAppearanceHandler | null): void {
	applyToAllHandler = handler;
}

/** `appearance` is a patch: properties left out are not touched. */
export function applyAppearanceToAllItems(appearance: WidgetAppearanceConfig): void {
	applyToAllHandler?.(appearance);
}

/** Merges a patch into one icon, so properties left out keep that icon's own
 *  value (or, when it has none, its type's default). */
export function mergeIconAppearance(icon: CanvasIcon, patch: WidgetAppearanceConfig): CanvasIcon {
	if (icon.icon_type !== 'widget') {
		return { ...icon, appearance: { ...icon.appearance, ...patch } };
	}

	const config: WidgetConfigType = icon.widget_config ?? {};
	return {
		...icon,
		widget_config: { ...config, appearance: { ...config.appearance, ...patch } }
	};
}
