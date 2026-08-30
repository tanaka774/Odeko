<script lang="ts">
	import { getAppearanceBackground, getAppearanceBorder, getWidgetAppearance } from './appearance';
	import type { SlideshowWidgetConfig, WidgetComponentProps } from './types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from './types';

	type Props = WidgetComponentProps<SlideshowWidgetConfig>;

	let { config = {}, isEditMode = false, borderRadius = 12, onConfigChange }: Props = $props();

	const images = $derived(config.images ?? []);
	const intervalMs = $derived(config.intervalMs ?? 5000);
	const shuffle = $derived(config.shuffle ?? false);
	const loop = $derived(config.loop ?? true);
	const transitionMs = $derived(config.transitionMs ?? 600);

	const appearance = $derived(
		getWidgetAppearance(config, { ...WIDGET_TYPE_APPEARANCE_DEFAULTS.slideshow, borderRadius })
	);
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));

	let currentIndex = $state(0);
	let prevIndex = $state(-1);
	let intervalHandle: ReturnType<typeof setInterval> | null = null;

	let shuffledOrder = $derived.by(() => {
		if (!shuffle || images.length <= 1) return null;
		const order = Array.from({ length: images.length }, (_, i) => i);
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
		while (order[0] === currentIndex && order.length > 1) {
			const j = 1 + Math.floor(Math.random() * (order.length - 1));
			[order[0], order[j]] = [order[j], order[0]];
		}
		return order;
	});

	function advance() {
		if (images.length === 0) return;

		prevIndex = currentIndex;

		if (shuffle && shuffledOrder) {
			const currentPosition = shuffledOrder.indexOf(currentIndex);
			if (currentPosition < shuffledOrder.length - 1) {
				currentIndex = shuffledOrder[currentPosition + 1];
			} else {
				if (loop) {
					currentIndex = shuffledOrder[0];
				}
			}
		} else {
			if (currentIndex < images.length - 1) {
				currentIndex = currentIndex + 1;
			} else {
				if (loop) {
					currentIndex = 0;
				}
			}
		}
	}

	function goToPrev() {
		if (images.length === 0) return;
		prevIndex = currentIndex;
		if (shuffle && shuffledOrder) {
			const pos = shuffledOrder.indexOf(currentIndex);
			if (pos > 0) {
				currentIndex = shuffledOrder[pos - 1];
			} else if (loop) {
				currentIndex = shuffledOrder[shuffledOrder.length - 1];
			}
		} else {
			if (currentIndex > 0) {
				currentIndex = currentIndex - 1;
			} else if (loop) {
				currentIndex = images.length - 1;
			}
		}
	}

	function goToNext() {
		if (images.length === 0) return;
		advance();
	}

	$effect(() => {
		if (intervalHandle) {
			clearInterval(intervalHandle);
			intervalHandle = null;
		}

		if (images.length <= 1 || isEditMode) return;

		intervalHandle = setInterval(advance, intervalMs);

		return () => {
			if (intervalHandle) {
				clearInterval(intervalHandle);
				intervalHandle = null;
			}
		};
	});

	$effect(() => {
		currentIndex = 0;
		prevIndex = -1;
	});
</script>

<div
	class="slideshow-widget"
	style="
		--appearance-background: {widgetBackground};
		--appearance-border: {widgetBorder};
		--appearance-border-radius: {appearance.borderRadius}px;
		--appearance-opacity: {appearance.opacity};
	"
>
	{#if images.length === 0}
		<div class="empty-state">
			<span class="empty-icon">&#128444;</span>
			<span class="empty-text">No images yet</span>
		</div>
	{:else}
		<div class="image-stack">
			{#each images as src, i}
				{@const isActive = i === currentIndex}
				{@const isPrevious = i === prevIndex && !isActive}
				<img
					class="slide-img"
					class:active={isActive}
					class:fading-out={isPrevious}
					{src}
					alt="Slide {i + 1}"
					style="transition-duration: {transitionMs}ms;"
					draggable="false"
				/>
			{/each}
		</div>

		<div class="nav-controls">
			<button class="nav-btn nav-prev" onclick={goToPrev} aria-label="Previous slide">
				<span>&#8249;</span>
			</button>
			<button class="nav-btn nav-next" onclick={goToNext} aria-label="Next slide">
				<span>&#8250;</span>
			</button>
		</div>
	{/if}
</div>

<style>
	.slideshow-widget {
		width: 100%;
		height: 100%;
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		opacity: var(--appearance-opacity);
		overflow: hidden;
		position: relative;
		box-sizing: border-box;
	}

	.empty-state {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.4);
		gap: 8px;
		font-size: 0.85rem;
	}

	.empty-icon {
		font-size: 2rem;
		opacity: 0.5;
	}

	.image-stack {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	.slide-img {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		opacity: 0;
		transition-property: opacity;
		transition-timing-function: ease;
		pointer-events: none;
		user-select: none;
	}

	.slide-img.active {
		opacity: 1;
	}

	.slide-img.fading-out {
		opacity: 0;
	}

	.nav-controls {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
	}

	.nav-btn {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: auto;
		background: rgba(0, 0, 0, 0.35);
		border: none;
		border-radius: 50%;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition:
			background 0.2s ease,
			opacity 0.2s ease;
		font-size: 1.2rem;
		line-height: 1;
		opacity: 0;
	}

	.nav-btn:hover {
		background: rgba(0, 0, 0, 0.6);
	}

	.slideshow-widget:hover .nav-btn {
		opacity: 1;
	}

	.nav-prev {
		left: 6px;
	}

	.nav-next {
		right: 6px;
	}
</style>
