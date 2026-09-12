<script lang="ts">
	import {
		WIDGET_REGISTRY,
		type WidgetType,
		createDefaultWidgetConfig,
		getWidgetMeta
	} from '$lib/widgets/types';
	import type { CanvasIcon } from '$lib/icons';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
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
</script>

<SettingsModalShell
	bind:isOpen
	modalKey="widget-picker"
	title="Add Widget"
	onClose={handleClose}
	maxWidth="480px"
	height="auto"
	footer={null}
	bodyFlush
>
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
</SettingsModalShell>

<style>
	.widget-list {
		display: flex;
		flex-direction: column;
		gap: calc(0.2857 * var(--modal-font-size));
		padding: calc(0.2857 * var(--modal-font-size));
	}

	.widget-row {
		display: flex;
		align-items: center;
		width: 100%;
		padding: calc(0.7143 * var(--modal-font-size)) calc(0.8571 * var(--modal-font-size));
		background: rgba(255, 255, 255, 0.04);
		border: none;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		gap: calc(0.8571 * var(--modal-font-size));
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
		width: calc(2.2857 * var(--modal-font-size));
		height: calc(2.2857 * var(--modal-font-size));
		flex-shrink: 0;
		color: rgba(255, 255, 255, 0.8);
	}

	.widget-name {
		color: white;
		font-weight: 500;
		font-size: calc(1.0286 * var(--modal-font-size));
		flex: 1;
	}

	.widget-disabled-badge {
		color: rgba(255, 150, 100, 0.9);
		font-size: calc(0.8 * var(--modal-font-size));
		font-weight: 600;
		padding: calc(0.1429 * var(--modal-font-size)) calc(0.5714 * var(--modal-font-size));
		background: rgba(255, 150, 100, 0.15);
		border-radius: 4px;
		flex-shrink: 0;
	}
</style>
