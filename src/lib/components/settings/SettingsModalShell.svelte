<script lang="ts">
	import { createBackdropClickHandler } from '$lib/components/modal/backdrop';
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
	}

	let {
		isOpen = $bindable(false),
		title,
		onClose,
		onSave,
		saveLabel = 'Save Changes',
		maxWidth = '480px',
		tabKey = ''
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
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div
		class="modal-overlay"
		{...backdrop}
		oncontextmenu={(e) => e.preventDefault()}
		role="dialog"
		tabindex="-1"
		aria-modal="true"
	>
		<div class="modal-anchor" style:width="min({maxWidth}, 92%)">
			<div
				class="modal-content"
				onclick={(e) => e.stopPropagation()}
				oncontextmenu={(e) => e.preventDefault()}
				role="document"
				tabindex="-1"
			>
				<div class="modal-header">
					<h2>{title}</h2>
					<button class="close-btn" onclick={onClose} aria-label="Close">&#10005;</button>
				</div>

				<div class="modal-body" bind:this={bodyEl}>
					<slot />
				</div>

				<div class="modal-footer">
					<button class="cancel-btn" onclick={onClose}>Cancel</button>
					{#if onSave}
						<button class="save-btn" onclick={onSave}>{saveLabel}</button>
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
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		box-sizing: border-box;
		backdrop-filter: blur(4px);
	}

	/* The dialog box. Centered on screen by the overlay, then shifted so its
	   center sits over the canvas panel (App.svelte publishes the offset as
	   --canvas-dx/dy). Falls back to screen-centered when the vars are
	   unset. The clamp keeps the dialog fully on screen when the canvas is
	   near an edge. */
	.modal-anchor {
		width: min(480px, 92%);
		height: min(85%, 640px);
		transform: translate(
			clamp(calc(240px - 50vw), var(--canvas-dx, 0px), calc(50vw - 240px)),
			clamp(calc(320px - 50vh), var(--canvas-dy, 0px), calc(50vh - 320px))
		);
	}

	.modal-content {
		background: rgba(30, 30, 40, 0.95);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
	}

	.modal-header h2 {
		margin: 0;
		color: white;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.close-btn {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		font-size: 1.25rem;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
		transition: all 0.2s ease;
		line-height: 1;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 12px 16px;
		min-height: 0;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(0, 0, 0, 0.2);
		flex-shrink: 0;
	}

	.cancel-btn,
	.save-btn {
		padding: 8px 16px;
		border-radius: 8px;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.cancel-btn {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
	}

	.cancel-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.save-btn {
		background: rgba(120, 160, 200, 0.85);
		color: white;
	}

	.save-btn:hover {
		background: rgba(120, 160, 200, 1);
	}

	/* Scrollbar */
	.modal-body::-webkit-scrollbar {
		width: 8px;
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
