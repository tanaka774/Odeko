<script lang="ts">
	import { Canvas, PencilBrush } from 'fabric';
	import { getAppearanceBackground, getAppearanceBorder, getWidgetAppearance } from './appearance';
	import type { DrawingWidgetConfig, WidgetComponentProps } from './types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from './types';

	type Props = WidgetComponentProps<DrawingWidgetConfig>;

	let { config = {}, isEditMode = false, borderRadius = 12, onConfigChange }: Props = $props();

	const penColor = $derived(config.penColor ?? '#000000');
	const brushSize = $derived(config.brushSize ?? 3);
	const eraserSize = $derived(config.eraserSize ?? 20);
	const canvasBackground = $derived(config.canvasBackground ?? '#ffffff');
	const penOpacity = $derived(config.penOpacity ?? 1);
	const appearance = $derived(
		getWidgetAppearance(config, { ...WIDGET_TYPE_APPEARANCE_DEFAULTS.drawing, borderRadius })
	);
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));

	let tool = $state<'pen' | 'eraser'>('pen');
	let currentColor = $state(penColor);
	let currentBrushSize = $state(brushSize);
	let currentEraserSize = $state(eraserSize);
	let currentOpacity = $state(penOpacity);

	let canvasEl = $state<HTMLCanvasElement>();
	let fabricCanvas = $state<Canvas | null>(null);
	let historyUndo: string[] = $state([]);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let initRaf = $state<number | null>(null);

	let justSavedState: string | null = null;
	let loadingUndo = $state(false);

	function pushHistory() {
		if (!fabricCanvas) return;
		const json = JSON.stringify(fabricCanvas.toJSON());
		historyUndo = [...historyUndo, json];
		if (historyUndo.length > 50) {
			historyUndo = historyUndo.slice(-50);
		}
	}

	function scheduleSave() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			if (fabricCanvas && onConfigChange) {
				const json = JSON.stringify(fabricCanvas.toJSON());
				justSavedState = json;
				onConfigChange({
					...config,
					canvasState: json
				});
			}
		}, 500);
	}

	function initCanvas() {
		if (!canvasEl) return;
		if (fabricCanvas) return;

		const parent = canvasEl.parentElement;
		if (!parent) return;

		// Wait for browser layout to settle so parent dimensions are correct
		initRaf = requestAnimationFrame(() => {
			initRaf = null;
			if (!canvasEl || fabricCanvas) return;
			const pw = parent.clientWidth;
			const ph = parent.clientHeight;
			if (pw <= 0 || ph <= 0) return;

			fabricCanvas = new Canvas(canvasEl, {
				width: pw,
				height: ph,
				backgroundColor: canvasBackground,
				selection: false
			});

			fabricCanvas.freeDrawingBrush = new PencilBrush(fabricCanvas);
			fabricCanvas.isDrawingMode = true;
			applyBrushSettings();

			if (config.canvasState) {
				try {
					const parsed = JSON.parse(config.canvasState);
					fabricCanvas.loadFromJSON(parsed).then(() => {
						fabricCanvas?.requestRenderAll();
						pushHistory();
					});
				} catch {
					pushHistory();
				}
			} else {
				pushHistory();
			}

			fabricCanvas.on('object:added', () => {
				scheduleSave();
			});

			fabricCanvas.on('path:created', () => {
				pushHistory();
				scheduleSave();
			});

			resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const { width: rw, height: rh } = entry.contentRect;
					if (rw > 0 && rh > 0 && fabricCanvas) {
						fabricCanvas.setDimensions({ width: rw, height: rh });
						fabricCanvas.requestRenderAll();
					}
				}
			});
			resizeObserver.observe(parent);
		});
	}

	function destroyCanvas() {
		if (initRaf !== null) {
			cancelAnimationFrame(initRaf);
			initRaf = null;
		}
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
		if (saveTimer) {
			clearTimeout(saveTimer);
		}
		if (fabricCanvas) {
			fabricCanvas.dispose();
			fabricCanvas = null;
		}
	}

	function applyBrushSettings() {
		if (!fabricCanvas) return;
		const brush = fabricCanvas.freeDrawingBrush;
		if (!brush) return;

		if (tool === 'eraser') {
			brush.color = canvasBackground;
			brush.width = currentEraserSize;
		} else {
			brush.color = toRgba(currentColor, currentOpacity);
			brush.width = currentBrushSize;
		}
	}

	function toRgba(hex: string, alpha: number): string {
		hex = hex.replace('#', '');
		if (hex.length === 3) {
			hex = hex
				.split('')
				.map((c) => c + c)
				.join('');
		}
		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	function selectTool(newTool: 'pen' | 'eraser') {
		tool = newTool;
		applyBrushSettings();
	}

	function updateColor(e: Event) {
		currentColor = (e.target as HTMLInputElement).value;
		onConfigChange?.({ ...config, penColor: currentColor });
		applyBrushSettings();
	}

	function updateBrushSize(e: Event) {
		currentBrushSize = parseInt((e.target as HTMLInputElement).value);
		onConfigChange?.({ ...config, brushSize: currentBrushSize });
		applyBrushSettings();
	}

	function updateEraserSize(e: Event) {
		currentEraserSize = parseInt((e.target as HTMLInputElement).value);
		onConfigChange?.({ ...config, eraserSize: currentEraserSize });
		applyBrushSettings();
	}

	function updateOpacity(e: Event) {
		currentOpacity = parseFloat((e.target as HTMLInputElement).value);
		onConfigChange?.({ ...config, penOpacity: currentOpacity });
		applyBrushSettings();
	}

	function clearCanvas() {
		if (!fabricCanvas) return;
		fabricCanvas.getObjects().forEach((o) => fabricCanvas?.remove(o));
		fabricCanvas.requestRenderAll();
		pushHistory();
		scheduleSave();
	}

	function undo() {
		if (!fabricCanvas || historyUndo.length <= 1 || loadingUndo) return;
		loadingUndo = true;

		historyUndo = historyUndo.slice(0, -1);
		const prev = historyUndo[historyUndo.length - 1];
		try {
			const parsed = JSON.parse(prev);

			// Detach object:added during loadFromJSON so restored objects
			// don't trigger redundant saves. The then() callback handles it.
			fabricCanvas.off('object:added');

			fabricCanvas
				.loadFromJSON(parsed)
				.then(() => {
					fabricCanvas?.requestRenderAll();
					fabricCanvas?.on('object:added', () => scheduleSave());
					scheduleSave();
					loadingUndo = false;
				})
				.catch(() => {
					fabricCanvas?.on('object:added', () => scheduleSave());
					loadingUndo = false;
				});
		} catch {
			loadingUndo = false;
		}
	}

	$effect(() => {
		if (!canvasEl || isEditMode) return;
		initCanvas();

		return () => {
			destroyCanvas();
		};
	});

	// Reload canvas state only when it changes from outside (e.g. layout restore)
	$effect(() => {
		const state = config.canvasState;
		if (!state || !fabricCanvas || state === justSavedState) return;
		try {
			const parsed = JSON.parse(state);
			fabricCanvas.loadFromJSON(parsed).then(() => {
				fabricCanvas?.requestRenderAll();
			});
		} catch {
			// ignore
		}
	});
</script>

<div
	class="drawing-widget"
	style:--appearance-background={widgetBackground}
	style:--appearance-border={widgetBorder}
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-text-color={appearance.textColor}
	style:--appearance-padding="{appearance.padding}px"
	style:--appearance-opacity={appearance.opacity}
>
	{#if !isEditMode}
		<div class="drawing-toolbar" role="toolbar">
			<button
				class="tool-btn"
				class:active={tool === 'pen'}
				onclick={() => selectTool('pen')}
				title="Pen"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
				</svg>
			</button>
			<button
				class="tool-btn"
				class:active={tool === 'eraser'}
				onclick={() => selectTool('eraser')}
				title="Eraser"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						d="m7 21-4.3-4.3c-1-1-1-2.6 0-3.6l9.6-9.6c1-1 2.6-1 3.6 0l5.6 5.6c1 1 1 2.6 0 3.6L13 21"
					></path>
					<path d="M22 21H7"></path>
					<path d="m5 11 9 9"></path>
				</svg>
			</button>

			<div class="toolbar-divider"></div>

			{#if tool === 'pen'}
				<label class="color-picker-btn" title="Color">
					<input type="color" value={currentColor} oninput={updateColor} class="color-input" />
					<span class="color-swatch" style="background: {toRgba(currentColor, currentOpacity)}"
					></span>
				</label>

				<div class="slider-group">
					<span class="slider-label">Size</span>
					<input
						type="range"
						min="1"
						max="40"
						value={currentBrushSize}
						oninput={updateBrushSize}
						class="slider"
					/>
					<span class="slider-value">{currentBrushSize}px</span>
				</div>

				<div class="slider-group">
					<span class="slider-label">Opacity</span>
					<input
						type="range"
						min="0.1"
						max="1"
						step="0.1"
						value={currentOpacity}
						oninput={updateOpacity}
						class="slider"
					/>
					<span class="slider-value">{Math.round(currentOpacity * 100)}%</span>
				</div>
			{:else}
				<div class="slider-group">
					<span class="slider-label">Eraser</span>
					<input
						type="range"
						min="5"
						max="60"
						value={currentEraserSize}
						oninput={updateEraserSize}
						class="slider"
					/>
					<span class="slider-value">{currentEraserSize}px</span>
				</div>
			{/if}

			<div class="toolbar-divider"></div>

			<button
				class="tool-btn"
				onclick={undo}
				title="Undo"
				disabled={historyUndo.length <= 1 || loadingUndo}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M3 7v6h6"></path>
					<path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
				</svg>
			</button>

			<button class="tool-btn tool-btn-danger" onclick={clearCanvas} title="Clear Canvas">
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M3 6h18"></path>
					<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
					<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
				</svg>
			</button>
		</div>
	{/if}

	<div class="canvas-wrapper">
		<canvas bind:this={canvasEl}></canvas>
	</div>
</div>

<style>
	.drawing-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-sizing: border-box;
		backdrop-filter: blur(4px);
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		color: var(--appearance-text-color);
		padding: var(--appearance-padding);
		opacity: var(--appearance-opacity);
	}

	.drawing-toolbar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 8px;
		background: rgba(0, 0, 0, 0.4);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		flex-wrap: wrap;
		flex-shrink: 0;
	}

	.canvas-wrapper {
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	/* Force Fabric's internal canvas-container to fill the wrapper */
	.canvas-wrapper :global(.canvas-container) {
		width: 100% !important;
		height: 100% !important;
	}

	.canvas-wrapper :global(canvas) {
		display: block;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.tool-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.9);
	}

	.tool-btn.active {
		background: rgba(100, 150, 255, 0.4);
		color: white;
	}

	.tool-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.tool-btn-danger:hover {
		background: var(--edit-danger-bg-hover);
	}

	.toolbar-divider {
		width: 1px;
		height: 20px;
		background: rgba(255, 255, 255, 0.15);
		margin: 0 4px;
		flex-shrink: 0;
	}

	.color-picker-btn {
		position: relative;
		width: 32px;
		height: 32px;
		border-radius: 6px;
		cursor: pointer;
		overflow: hidden;
		flex-shrink: 0;
		border: 2px solid rgba(255, 255, 255, 0.2);
	}

	.color-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		width: 100%;
		height: 100%;
	}

	.color-swatch {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: 4px;
	}

	.slider-group {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.slider-label {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		min-width: fit-content;
	}

	.slider {
		width: 60px;
		height: 4px;
		accent-color: rgba(100, 150, 255, 0.8);
		cursor: pointer;
	}

	.slider-value {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.5);
		min-width: 30px;
	}
</style>
