<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import {
		colorWithOpacity,
		getAppearanceBackground,
		getAppearanceBorder,
		getWidgetAppearance
	} from './appearance';
	import type { SystemWidgetConfig, WidgetComponentProps } from './types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from './types';

	interface SystemStats {
		cpu_usage: number;
		memory_used: number;
		memory_total: number;
		memory_usage_percent: number;
		disk_used: number;
		disk_total: number;
		disk_usage_percent: number;
	}

	type Props = WidgetComponentProps<SystemWidgetConfig>;

	let { config = {} }: Props = $props();

	const showCpu = $derived(config.showCpu ?? true);
	const showMemory = $derived(config.showMemory ?? true);
	const showDisk = $derived(config.showDisk ?? true);
	const showPercentage = $derived(config.showPercentage ?? true);
	const showActualUsage = $derived(config.showActualUsage ?? true);
	const refreshInterval = $derived(config.refreshInterval ?? 2000);

	// The CRT look is the system widget's structural default: square corners
	// unless the user sets a radius on the item.
	const appearance = $derived(getWidgetAppearance(config, WIDGET_TYPE_APPEARANCE_DEFAULTS.system));
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));
	const textColor80 = $derived(colorWithOpacity(appearance.textColor, 0.8));
	const textColor60 = $derived(colorWithOpacity(appearance.textColor, 0.6));

	const gaugeLowColor = $derived(config.gaugeLowColor?.trim() || '');
	const gaugeMidColor = $derived(config.gaugeMidColor?.trim() || '');
	const gaugeHighColor = $derived(config.gaugeHighColor?.trim() || '');
	const gaugeTrackColor = $derived(config.gaugeTrackColor?.trim() || '');

	const gaugeFillBackground = $derived(
		`linear-gradient(to right, ${gaugeLowColor || '#39ff14'}, ${gaugeMidColor || '#e6c619'} 50%, ${
			gaugeHighColor || '#e63219'
		})`
	);
	const gaugeGlow = $derived(
		gaugeMidColor ? colorWithOpacity(gaugeMidColor, 0.25) : 'rgba(230, 198, 25, 0.25)'
	);

	let stats = $state<SystemStats>({
		cpu_usage: 0,
		memory_used: 0,
		memory_total: 0,
		memory_usage_percent: 0,
		disk_used: 0,
		disk_total: 0,
		disk_usage_percent: 0
	});

	async function fetchStats() {
		try {
			const newStats = await invoke<SystemStats>('get_system_stats');
			stats = newStats;
		} catch (error) {
			console.error('Failed to fetch system stats:', error);
		}
	}

	$effect(() => {
		fetchStats();
		const interval = setInterval(fetchStats, refreshInterval);
		return () => clearInterval(interval);
	});

	function formatMemory(gb: number): string {
		return `${gb.toFixed(1)}GB`;
	}

	function formatDisk(gb: number): string {
		if (gb >= 1024) {
			return `${(gb / 1024).toFixed(1)}TB`;
		}
		return `${gb.toFixed(0)}GB`;
	}
</script>

<div
	class="system-widget"
	style:--appearance-background={widgetBackground}
	style:--appearance-border={widgetBorder}
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-text-color={appearance.textColor}
	style:--appearance-font-family={appearance.fontFamily}
	style:--appearance-font-size="{appearance.fontSize}px"
	style:--widget-text-color-80={textColor80}
	style:--widget-text-color-60={textColor60}
	style:--gauge-fill-bg={gaugeFillBackground}
	style:--gauge-glow={gaugeGlow}
	style:--gauge-track-bg={gaugeTrackColor || 'rgba(0, 0, 0, 0.35)'}
	style:--appearance-padding="{appearance.padding}px"
	style:--appearance-opacity={appearance.opacity}
>
	<div class="stats-container">
		{#if showCpu}
			<div class="stat-row">
				<div class="stat-label">
					<span>[ CPU ]</span>
					{#if showPercentage}
						<span class="stat-value">{stats.cpu_usage.toFixed(1)}%</span>
					{/if}
				</div>
				<div class="progress-bar">
					<div class="progress-fill" style="--pct: {Math.min(100, stats.cpu_usage)}"></div>
				</div>
			</div>
		{/if}

		{#if showMemory}
			<div class="stat-row">
				<div class="stat-label">
					<span>[ RAM ]</span>
					<span class="stat-value">
						{#if showPercentage}{stats.memory_usage_percent.toFixed(1)}%
						{/if}
						{#if showActualUsage}{formatMemory(stats.memory_used)} / {formatMemory(
								stats.memory_total
							)}{/if}
					</span>
				</div>
				<div class="progress-bar">
					<div
						class="progress-fill"
						style="--pct: {Math.min(100, stats.memory_usage_percent)}"
					></div>
				</div>
			</div>
		{/if}

		{#if showDisk}
			<div class="stat-row">
				<div class="stat-label">
					<span>[ DISK ]</span>
					<span class="stat-value">
						{#if showPercentage}{stats.disk_usage_percent.toFixed(1)}%
						{/if}
						{#if showActualUsage}{formatDisk(stats.disk_used)} / {formatDisk(stats.disk_total)}{/if}
					</span>
				</div>
				<div class="progress-bar">
					<div class="progress-fill" style="--pct: {Math.min(100, stats.disk_usage_percent)}"></div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.system-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		position: relative;
		overflow: hidden;
		container-type: inline-size;
		font-size: var(--appearance-font-size);
		font-family: var(--appearance-font-family);
		text-shadow: 0 0 4px rgba(57, 255, 20, 0.3);
		box-shadow: inset 0 0 50px rgba(0, 0, 0, 0.55);
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		color: var(--appearance-text-color);
		padding: var(--appearance-padding);
		opacity: var(--appearance-opacity);
	}

	.system-widget::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: repeating-linear-gradient(
			to bottom,
			transparent 0px,
			transparent 2px,
			rgba(0, 0, 0, 0.12) 2px,
			rgba(0, 0, 0, 0.12) 4px
		);
		pointer-events: none;
		z-index: 2;
	}

	.stats-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 16px;
		justify-content: center;
		position: relative;
		z-index: 1;
	}

	.stat-row {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.stat-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: clamp(0.7em, 6cqw, 1.05em);
		color: var(--widget-text-color-80);
		letter-spacing: 0.05em;
	}

	.stat-label span:first-child {
		font-weight: 700;
		font-size: clamp(0.6em, 5cqw, 0.9em);
		min-width: 50px;
	}

	.stat-value {
		color: var(--widget-text-color-60);
		font-size: clamp(0.6em, 5.5cqw, 0.95em);
		text-align: right;
	}

	.progress-bar {
		width: 100%;
		height: 10px;
		background: var(--gauge-track-bg, rgba(0, 0, 0, 0.35));
		border-radius: 0;
		overflow: hidden;
	}

	.progress-fill {
		width: 100%;
		height: 100%;
		border-radius: 0;
		clip-path: inset(0 calc(100% - var(--pct, 0) * 1%) 0 0);
		background:
			repeating-linear-gradient(
				to right,
				rgba(0, 0, 0, 0.2) 0px,
				rgba(0, 0, 0, 0.2) 2px,
				transparent 2px,
				transparent 10px
			),
			var(--gauge-fill-bg);
		box-shadow: 0 0 6px var(--gauge-glow);
		transition: clip-path 0.3s ease;
	}
</style>
