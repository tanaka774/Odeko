/**
 * Helpers for modal backdrop interactions.
 *
 * The click handler below guards against closing a modal when the user
 * starts a drag inside the modal (e.g. on a slider/range input) and
 * releases the pointer on the backdrop. It only triggers the close action
 * when both pointerdown and click happened on the backdrop itself.
 */

export interface BackdropClickHandlers {
	onpointerdown: (event: PointerEvent) => void;
	onclick: (event: MouseEvent) => void;
}

export function createBackdropClickHandler(onClose: () => void): BackdropClickHandlers {
	let pointerDownTarget: EventTarget | null = null;

	return {
		onpointerdown(event: PointerEvent) {
			pointerDownTarget = event.target;
		},
		onclick(event: MouseEvent) {
			if (event.target === event.currentTarget && event.target === pointerDownTarget) {
				onClose();
			}
		}
	};
}
