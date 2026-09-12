<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { createBackdropClickHandler } from '$lib/components/modal/backdrop';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { prefixSelectors } from '$lib/widgets/custom-css';
	import {
		diffModalAppearance,
		modalAppearanceStyle,
		modalCssScope,
		overlayModalAppearance,
		DEFAULT_MODAL_APPEARANCE,
		MODAL_BASE_DEFAULTS,
		type ModalAppearanceConfig,
		type ModalKey
	} from './modal-appearance';
	import ModalAppearancePanel from './ModalAppearancePanel.svelte';
	import './modal-form.css';

	interface Props {
		isOpen?: boolean;
		title: string;
		onClose: () => void;
		onSave?: () => void;
		saveLabel?: string;
		maxWidth?: string;
		/** The modal's active tab key. Changes reset the body scroll to the top. */
		tabKey?: string;
		/** Which modal this is; enables per-modal appearance customization. */
		modalKey?: ModalKey;
		/** `fixed` fills the height knob, `auto` hugs its content up to it. */
		height?: 'fixed' | 'auto';
		/** Replaces the default Cancel/Save row. Pass `null` for no footer. */
		footer?: Snippet | null;
		/** Drop the body padding (full-bleed lists, grids). */
		bodyFlush?: boolean;
		children?: Snippet;
	}

	let {
		isOpen = $bindable(false),
		title,
		onClose,
		onSave,
		saveLabel = 'Save Changes',
		maxWidth = '480px',
		tabKey = '',
		modalKey,
		height = 'fixed',
		footer,
		bodyFlush = false,
		children
	}: Props = $props();

	const backdrop = createBackdropClickHandler(() => onClose());

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}

	let bodyEl: HTMLElement | undefined = $state();

	// When the modal's active tab changes, start the new tab at the top
	// instead of inheriting the previous tab's scroll position.
	$effect(() => {
		void tabKey;
		if (bodyEl) bodyEl.scrollTop = 0;
	});

	const baseDefaults = $derived<Partial<ModalAppearanceConfig>>({
		...(modalKey ? MODAL_BASE_DEFAULTS[modalKey] : {}),
		width: Number.parseInt(maxWidth, 10) || DEFAULT_MODAL_APPEARANCE.width
	});

	const storedLayer = $derived(
		modalKey ? (settingsStore.settings.modal_appearance?.modals?.[modalKey] ?? {}) : {}
	);
	const globalLayer = $derived(settingsStore.settings.modal_appearance?.global);

	// Everything below this modal's own override; also the diff base used to
	// keep the stored override sparse.
	const lowerLayers = $derived(overlayModalAppearance(baseDefaults, globalLayer));

	let draft = $state<Partial<ModalAppearanceConfig>>({});
	let appearanceOpen = $state(false);

	// Re-seed the draft on every open so a cancelled edit never leaks into the
	// next visit.
	$effect(() => {
		if (!isOpen) return;
		untrack(() => {
			draft = { ...storedLayer };
			appearanceOpen = false;
		});
	});

	const effective = $derived(overlayModalAppearance(baseDefaults, globalLayer, draft));
	const modalStyle = $derived(modalAppearanceStyle(effective));

	$effect(() => {
		const css = effective.customCss;
		if (!isOpen || !modalKey || !effective.customCssEnabled || !css.trim()) return;

		const styleEl = document.createElement('style');
		styleEl.dataset.modalCss = modalKey;
		styleEl.textContent = prefixSelectors(css, modalCssScope(modalKey));
		document.head.appendChild(styleEl);

		return () => {
			styleEl.remove();
		};
	});

	function persistAppearance() {
		if (!modalKey) return;
		const stored = settingsStore.settings.modal_appearance ?? {};
		const layer = diffModalAppearance(draft, lowerLayers);
		const currentLayer = stored.modals?.[modalKey] ?? {};
		if (JSON.stringify(layer) === JSON.stringify(currentLayer)) return;

		const modals = { ...(stored.modals ?? {}) };
		if (Object.keys(layer).length > 0) {
			modals[modalKey] = layer;
		} else {
			delete modals[modalKey];
		}
		settingsStore.updateSettings({ modal_appearance: { ...stored, modals } });
		void settingsStore.saveSettings();
	}

	function handleSave() {
		persistAppearance();
		onSave?.();
	}

	function handleClose() {
		appearanceOpen = false;
		onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- Scope wrapper: per-modal custom CSS is prefixed with [data-modal="…"],
	     so the attribute must live on a parent for .modal-overlay itself to be
	     styleable. It has no styles of its own and the overlay is fixed. -->
	<div class="modal-scope" data-modal={modalKey}>
		<div
			class="modal-overlay"
			style={modalStyle}
			{...backdrop}
			oncontextmenu={(e) => e.preventDefault()}
			role="dialog"
			tabindex="-1"
			aria-modal="true"
		>
			<div class="modal-anchor" class:auto={height === 'auto'}>
				<div
					class="modal-content"
					onclick={(e) => e.stopPropagation()}
					oncontextmenu={(e) => e.preventDefault()}
					role="document"
					tabindex="-1"
				>
					<div class="modal-header">
						<h2 class="modal-title">{title}</h2>
						<div class="header-actions">
							{#if modalKey}
								<button
									class="gear-btn"
									class:active={appearanceOpen}
									onclick={() => (appearanceOpen = !appearanceOpen)}
									aria-label="Modal appearance"
									title="Modal appearance"
								>
									&#9881;
								</button>
							{/if}
							<button class="close-btn" onclick={handleClose} aria-label="Close">&#10005;</button>
						</div>
					</div>

					{#if appearanceOpen}
						<div class="modal-body appearance-body">
							<ModalAppearancePanel
								bind:appearance={draft}
								base={baseDefaults}
								title="{title} Appearance"
								onReset={() => (draft = {})}
							/>
						</div>
					{:else}
						<div class="modal-body" class:flush={bodyFlush} bind:this={bodyEl}>
							{@render children?.()}
						</div>
					{/if}

					{#if footer !== null}
						<div class="modal-footer">
							{#if footer}
								{@render footer()}
							{:else}
								<button class="cancel-btn" onclick={handleClose}>Cancel</button>
								{#if onSave}
									<button class="save-btn" onclick={handleSave}>{saveLabel}</button>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: var(--modal-overlay-bg, rgba(0, 0, 0, 0.7));
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		box-sizing: border-box;
		backdrop-filter: blur(var(--modal-overlay-blur, 4px));
	}

	/* The dialog box. Centered on screen by the overlay, then shifted so its
	   center sits over the canvas panel (App.svelte publishes the offset as
	   --canvas-dx/dy). Falls back to screen-centered when the vars are
	   unset. The clamp keeps the dialog fully on screen when the canvas is
	   near an edge. */
	.modal-anchor {
		width: var(--modal-width, min(480px, 92%));
		height: var(--modal-height, min(85%, 640px));
		transform: translate(
			clamp(calc(240px - 50vw), var(--canvas-dx, 0px), calc(50vw - 240px)),
			clamp(calc(320px - 50vh), var(--canvas-dy, 0px), calc(50vh - 320px))
		);
	}

	/* Content-sized dialogs (pickers) hug their content up to the height knob. */
	.modal-anchor.auto {
		height: auto;
		max-height: var(--modal-height, min(85%, 640px));
	}

	.modal-content {
		background: var(--modal-surface-bg, rgba(30, 30, 40, 0.95));
		backdrop-filter: blur(var(--modal-surface-blur, 20px));
		border: var(--modal-border-width, 1px) solid var(--modal-border-color, rgba(255, 255, 255, 0.1));
		border-radius: var(--modal-radius, 16px);
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: var(--modal-shadow, 0 25px 50px -12px rgba(0, 0, 0, 0.5));
		color: var(--modal-text, rgba(255, 255, 255, 0.9));
		font-size: var(--modal-font-size, 14px);
		font-family: var(--modal-font-family, inherit);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: calc(0.7143 * var(--modal-font-size)) calc(1.1429 * var(--modal-font-size));
		background: var(--modal-header-bg, transparent);
		border-bottom: 1px solid var(--modal-divider, rgba(255, 255, 255, 0.1));
		flex-shrink: 0;
	}

	.modal-header h2 {
		margin: 0;
		color: var(--modal-title-color, white);
		font-size: var(--modal-title-size, 1.4286em);
		font-weight: 600;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: calc(0.1429 * var(--modal-font-size));
	}

	.gear-btn,
	.close-btn {
		background: none;
		border: none;
		color: var(--modal-muted, rgba(255, 255, 255, 0.6));
		font-size: calc(1.4286 * var(--modal-font-size));
		cursor: pointer;
		padding: calc(0.2857 * var(--modal-font-size)) calc(0.5714 * var(--modal-font-size));
		border-radius: 4px;
		transition: all 0.2s ease;
		line-height: 1;
	}

	.gear-btn:hover,
	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		background: color-mix(in srgb, var(--modal-accent, #78a0c8) 30%, transparent);
		color: var(--modal-title-color, white);
	}

	.gear-btn.active {
		color: var(--modal-accent, rgba(120, 160, 200, 0.85));
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: calc(0.8571 * var(--modal-font-size)) calc(1.1429 * var(--modal-font-size));
		min-height: 0;
	}

	.modal-body.flush {
		padding: 0;
	}

	.appearance-body {
		overflow-x: hidden;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: calc(0.8571 * var(--modal-font-size));
		padding: calc(0.7143 * var(--modal-font-size)) calc(1.1429 * var(--modal-font-size));
		border-top: 1px solid var(--modal-divider, rgba(255, 255, 255, 0.1));
		background: var(--modal-footer-bg, rgba(0, 0, 0, 0.2));
		flex-shrink: 0;
	}

	.cancel-btn,
	.save-btn {
		padding: calc(0.5714 * var(--modal-font-size)) calc(1.1429 * var(--modal-font-size));
		border-radius: var(--modal-control-radius, 8px);
		border: none;
		cursor: pointer;
		font-size: calc(1 * var(--modal-font-size));
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.cancel-btn {
		background: rgba(255, 255, 255, 0.1);
		background: color-mix(in srgb, var(--modal-text, white) 14%, transparent);
		color: var(--modal-text, rgba(255, 255, 255, 0.7));
	}

	.cancel-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		background: color-mix(in srgb, var(--modal-text, white) 26%, transparent);
		color: var(--modal-title-color, white);
	}

	.save-btn {
		background: var(--modal-accent, rgba(120, 160, 200, 0.85));
		color: var(--modal-accent-fg, white);
	}

	.save-btn:hover {
		background: color-mix(in srgb, var(--modal-accent, #78a0c8) 80%, white);
	}

	/* Scrollbar */
	.modal-body::-webkit-scrollbar {
		width: calc(0.5714 * var(--modal-font-size));
	}

	.modal-body::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
	}

	.modal-body::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
	}

	.modal-body::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.3);
	}
</style>
