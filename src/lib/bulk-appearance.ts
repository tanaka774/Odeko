import type { WidgetAppearanceConfig } from '$lib/widgets/types';

/**
 * Dispatches "apply this appearance to every icon and widget" requests.
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

export function applyAppearanceToAllItems(appearance: WidgetAppearanceConfig): void {
	applyToAllHandler?.(appearance);
}
