<script lang="ts">
	import {
		WIDGET_REGISTRY,
		type WidgetType,
		createDefaultWidgetConfig,
		getWidgetMeta
	} from '$lib/widgets/types';
	import type { CanvasIcon } from '$lib/icons';
	import { createBackdropClickHandler } from '$lib/components/modal/backdrop';
	import Clock from '@lucide/svelte/icons/clock';
	import Cpu from '@lucide/svelte/icons/cpu';
	import CloudSun from '@lucide/svelte/icons/cloud-sun';
	import Terminal from '@lucide/svelte/icons/terminal';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Music from '@lucide/svelte/icons/music';
	import FileText from '@lucide/svelte/icons/file-text';
	import StickyNote from '@lucide/svelte/icons/sticky-note';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Images from '@lucide/svelte/icons/images';
	import Moon from '@lucide/svelte/icons/moon';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import Power from '@lucide/svelte/icons/power';
	import Clipboard from '@lucide/svelte/icons/clipboard';
	import Code from '@lucide/svelte/icons/code';
	import type { Component } from 'svelte';

	interface Props {
		isOpen?: boolean;
		onSelect: (widget: CanvasIcon) => void;
		hasTerminal?: boolean;
	}

	let { isOpen = $bindable(false), onSelect, hasTerminal = false }: Props = $props();

	const iconComponents: Record<string, Component> = {
		clock: Clock,
		cpu: Cpu,
		'cloud-sun': CloudSun,
		terminal: Terminal,
		'list-checks': ListChecks,
		music: Music,
		'file-text': FileText,
		'sticky-note': StickyNote,
		pencil: Pencil,
		images: Images,
		moon: Moon,
		'rotate-cw': RotateCw,
		power: Power,
		clipboard: Clipboard,
		code: Code
	};

	function handleSelect(widgetType: WidgetType) {
		const meta = getWidgetMeta(widgetType);
		if (!meta) return;

		const newWidget: CanvasIcon = {
			id: `widget-${Date.now()}`,
			name: meta.name,
			path: '',
			icon_type: 'widget',
			widget_type: widgetType,
			widget_config: createDefaultWidgetConfig(widgetType),
			x: 150,
			y: 150,
			width: meta.defaultWidth,
			height: meta.defaultHeight
		};

		onSelect(newWidget);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}

	const backdrop = createBackdropClickHandler(handleClose);
</script>

{#if isOpen}
	<div class="modal-overlay" {...backdrop} role="dialog" tabindex="-1" aria-modal="true">
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Add Widget</h2>
				<button class="close-btn" onclick={handleClose}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>

			<div class="widget-list">
				{#each WIDGET_REGISTRY as widget (widget.type)}
					{@const isTerminal = widget.type === 'terminal'}
					{@const isDisabled = isTerminal && hasTerminal}
					{@const IconComponent = iconComponents[widget.icon]}
					<button
						class="widget-row"
						class:disabled={isDisabled}
						onclick={() => !isDisabled && handleSelect(widget.type)}
						title={isDisabled ? 'Only one terminal widget allowed at a time' : widget.name}
						disabled={isDisabled}
					>
						<span class="widget-icon">
							{#if IconComponent}
								<IconComponent size={20} stroke-width={1.5} />
							{/if}
						</span>
						<span class="widget-name">{widget.name}</span>
						{#if isDisabled}
							<span class="widget-disabled-badge">Already added</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: rgba(30, 30, 40, 0.95);
		border-radius: 16px;
		padding: 24px;
		min-width: 360px;
		max-width: 480px;
		max-height: 100%;
		overflow-y: auto;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
		padding-bottom: 12px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.modal-header h2 {
		color: white;
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.close-btn {
		background: none;
		border: none;
		border-radius: 4px;
		width: 32px;
		height: 32px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		padding: 4px;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.widget-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.widget-row {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.04);
		border: none;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		gap: 12px;
	}

	.widget-row:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.widget-row.disabled {
		background: rgba(255, 255, 255, 0.02);
		cursor: not-allowed;
		opacity: 0.4;
	}

	.widget-row.disabled:hover {
		background: rgba(255, 255, 255, 0.02);
	}

	.widget-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		color: rgba(255, 255, 255, 0.8);
	}

	.widget-name {
		color: white;
		font-weight: 500;
		font-size: 0.9rem;
		flex: 1;
	}

	.widget-disabled-badge {
		color: rgba(255, 150, 100, 0.9);
		font-size: 0.7rem;
		font-weight: 600;
		padding: 2px 8px;
		background: rgba(255, 150, 100, 0.15);
		border-radius: 4px;
		flex-shrink: 0;
	}
</style>
