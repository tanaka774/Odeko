<script lang="ts">
	import { dayPeriod } from './widget-state';
	import { getAppearanceBackground, getAppearanceBorder, getWidgetAppearance } from './appearance';
	import {
		WIDGET_TYPE_APPEARANCE_DEFAULTS,
		type ClockWidgetConfig,
		type WidgetComponentProps
	} from './types';

	type Props = WidgetComponentProps<ClockWidgetConfig>;

	const PROBE_SIZE = 100;

	let { config = {}, borderRadius = 12 }: Props = $props();

	// Default config values
	const displayMode = $derived(config.displayMode ?? 'digital');
	const format = $derived(config.format ?? '24h');
	const showSeconds = $derived(config.showSeconds ?? true);
	const showDate = $derived(config.showDate ?? true);
	const timezone = $derived(config.timezone ?? 'local');
	const analogBackgroundColor = $derived(config.analogBackgroundColor ?? '#f2f4f8');
	const analogBackgroundOpacity = $derived(
		Math.min(1, Math.max(0, config.analogBackgroundOpacity ?? 0.75))
	);
	const analogNumberColor = $derived(config.analogNumberColor ?? '#080a0e');
	const analogTickColor = $derived(config.analogTickColor ?? '#080a0e');
	const analogHourHandColor = $derived(
		config.analogHourHandColor ?? config.analogHandColor ?? '#080a0e'
	);
	const analogMinuteHandColor = $derived(
		config.analogMinuteHandColor ?? config.analogHandColor ?? '#080a0e'
	);
	const analogSecondHandColor = $derived(config.analogSecondHandColor ?? '#3a7ee8');
	const analogShowNumbers = $derived(config.analogShowNumbers ?? false);
	const analogShowSecondHand = $derived(config.analogShowSecondHand ?? true);
	const fitText = $derived(config.fitText ?? true);
	const appearance = $derived(
		getWidgetAppearance(config, {
			...WIDGET_TYPE_APPEARANCE_DEFAULTS.clock,
			borderRadius,
			padding: displayMode === 'analog' ? 10 : 16
		})
	);
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));
	const minuteTicks = Array.from({ length: 60 }, (_, index) => index);
	const clockNumbers = Array.from({ length: 12 }, (_, index) => {
		const value = index + 1;
		const angle = (((value % 12) * 30 - 90) * Math.PI) / 180;

		return {
			value,
			x: 50 + 34 * Math.cos(angle),
			y: 50 + 34 * Math.sin(angle) + 1.5
		};
	});

	// Reactive time state
	let currentTime = $state(new Date());

	// Update time every second
	$effect(() => {
		const interval = setInterval(() => {
			currentTime = new Date();
		}, 1000);

		return () => {
			clearInterval(interval);
		};
	});

	// Format time based on config
	function formatTime(date: Date): string {
		let options: Intl.DateTimeFormatOptions = {
			hour: '2-digit',
			minute: '2-digit',
			hour12: format === '12h'
		};

		if (showSeconds) {
			options.second = '2-digit';
		}

		if (timezone !== 'local') {
			options.timeZone = timezone;
		}

		return date.toLocaleTimeString('en-US', options);
	}

	// Format date
	function formatDate(date: Date): string {
		const options: Intl.DateTimeFormatOptions = {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		};

		if (timezone !== 'local') {
			options.timeZone = timezone;
		}

		return date.toLocaleDateString('en-US', options);
	}

	function getClockParts(date: Date) {
		if (timezone === 'local') {
			return {
				hours: date.getHours(),
				minutes: date.getMinutes(),
				seconds: date.getSeconds()
			};
		}

		const formatter = new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric',
			hour12: false,
			timeZone: timezone
		});

		const parts = formatter.formatToParts(date);
		const valueFor = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);

		return {
			hours: valueFor('hour') % 24,
			minutes: valueFor('minute'),
			seconds: valueFor('second')
		};
	}

	const clockParts = $derived(getClockParts(currentTime));

	const timeText = $derived(formatTime(currentTime));
	const dateText = $derived(formatDate(currentTime));
	// Digits swapped for the widest one, so the size settles once per format
	// instead of twitching every second.
	const timeTemplate = $derived(timeText.replace(/\d/g, '8'));

	let root = $state<HTMLDivElement | null>(null);
	let timeProbe = $state<HTMLSpanElement | null>(null);
	let dateProbe = $state<HTMLSpanElement | null>(null);
	let fitted = $state<{ time: number; date: number } | null>(null);

	function fit() {
		if (!root || !timeProbe) return;
		const style = getComputedStyle(root);
		const width = root.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
		const height =
			root.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
		const timeWidth = timeProbe.getBoundingClientRect().width;
		if (width <= 0 || height <= 0 || timeWidth <= 0) {
			fitted = null;
			return;
		}
		const dateWidth = dateProbe?.getBoundingClientRect().width ?? 0;
		const time = Math.min(
			(width * 0.96 * PROBE_SIZE) / timeWidth,
			(height * (showDate ? 0.64 : 0.92)) / 1.2
		);
		const date = showDate
			? Math.min(time * 0.24, dateWidth > 0 ? (width * 0.96 * PROBE_SIZE) / dateWidth : time)
			: 0;
		fitted = { time: Math.max(6, time), date: Math.max(6, date) };
	}

	$effect(() => {
		if (!fitText || displayMode !== 'digital' || !root) {
			fitted = null;
			return;
		}
		void timeTemplate;
		void dateText.length;
		void showDate;
		void appearance.fontFamily;
		fit();
		const observer = new ResizeObserver(() => fit());
		observer.observe(root);
		void document.fonts?.ready.then(() => fit());
		return () => observer.disconnect();
	});
	const hourAngle = $derived(((clockParts.hours % 12) + clockParts.minutes / 60) * 30);
	const minuteAngle = $derived((clockParts.minutes + clockParts.seconds / 60) * 6);
	const secondAngle = $derived(clockParts.seconds * 6);
</script>

<div
	bind:this={root}
	class="clock-widget"
	data-period={dayPeriod(clockParts.hours)}
	data-hour={clockParts.hours}
	data-mode={displayMode}
	style:--appearance-background={widgetBackground}
	style:--appearance-border={widgetBorder}
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-text-color={appearance.textColor}
	style:--appearance-font-family={appearance.fontFamily}
	style:--appearance-font-size="{appearance.fontSize}px"
	style:--appearance-padding="{appearance.padding}px"
	style:--appearance-opacity={appearance.opacity}
>
	{#if displayMode === 'analog'}
		<div
			class="analog-clock"
			style:--analog-background-color={analogBackgroundColor}
			style:--analog-background-opacity={analogBackgroundOpacity}
			style:--analog-number-color={analogNumberColor}
			style:--analog-tick-color={analogTickColor}
			style:--analog-hour-hand-color={analogHourHandColor}
			style:--analog-minute-hand-color={analogMinuteHandColor}
			style:--analog-second-hand-color={analogSecondHandColor}
			aria-label="Analog clock"
		>
			<svg class="clock-svg" viewBox="0 0 100 100" aria-hidden="true">
				<circle class="clock-face" cx="50" cy="50" r="47"></circle>
				<circle class="clock-ring" cx="50" cy="50" r="47"></circle>

				{#each minuteTicks as tick}
					<line
						class="tick"
						class:major-tick={tick % 5 === 0}
						x1="50"
						y1="5"
						x2="50"
						y2={tick % 5 === 0 ? 10 : 7}
						transform="rotate({tick * 6} 50 50)"
					></line>
				{/each}

				{#if analogShowNumbers}
					{#each clockNumbers as number}
						<text class="clock-number" x={number.x} y={number.y}>{number.value}</text>
					{/each}
				{/if}

				<line
					class="hour-hand"
					x1="50"
					y1="50"
					x2="50"
					y2="31"
					transform="rotate({hourAngle} 50 50)"
				></line>
				<line
					class="minute-hand"
					x1="50"
					y1="50"
					x2="50"
					y2="22"
					transform="rotate({minuteAngle} 50 50)"
				></line>
				{#if analogShowSecondHand}
					<line
						class="second-hand"
						x1="50"
						y1="55"
						x2="50"
						y2="17"
						transform="rotate({secondAngle} 50 50)"
					></line>
				{/if}
				<circle class="center-dot" cx="50" cy="50" r="4"></circle>
			</svg>
		</div>
	{:else}
		<div class="time-display" style:font-size={fitted ? `${fitted.time}px` : null}>
			{timeText}
		</div>
		{#if showDate}
			<div class="date-display" style:font-size={fitted ? `${fitted.date}px` : null}>
				{dateText}
			</div>
		{/if}
		{#if fitText}
			<span class="fit-probe time-display" aria-hidden="true" bind:this={timeProbe}
				>{timeTemplate}</span
			>
			{#if showDate}
				<span class="fit-probe date-display" aria-hidden="true" bind:this={dateProbe}
					>{dateText}</span
				>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.clock-widget {
		width: 100%;
		height: 100%;
		container-type: size;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		font-size: var(--appearance-font-size);
		font-family: var(--appearance-font-family);
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		color: var(--appearance-text-color);
		padding: var(--appearance-padding);
		opacity: var(--appearance-opacity);
		position: relative;
		overflow: hidden;
	}

	.analog-clock {
		--clock-face-fill: var(--analog-background-color);
		--clock-face-opacity: var(--analog-background-opacity);
		--clock-ring: var(--analog-tick-color);
		--clock-tick: var(--analog-tick-color);
		--clock-major-tick: var(--analog-tick-color);
		--clock-number: var(--analog-number-color);
		--clock-hour-hand: var(--analog-hour-hand-color);
		--clock-minute-hand: var(--analog-minute-hand-color);
		--clock-second-hand: var(--analog-second-hand-color);
		--clock-center: var(--analog-hour-hand-color);
		position: relative;
		width: min(100cqw, 100cqh);
		height: min(100cqw, 100cqh);
		max-width: 100%;
		max-height: 100%;
		border-radius: 50%;
	}

	.clock-svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.clock-face {
		fill: var(--clock-face-fill);
		opacity: var(--clock-face-opacity);
	}

	.clock-ring {
		fill: transparent;
		stroke: var(--clock-ring);
		stroke-width: 1.5;
	}

	.tick {
		stroke: var(--clock-tick);
		stroke-linecap: round;
		stroke-width: 0.7;
	}

	.major-tick {
		stroke: var(--clock-major-tick);
		stroke-width: 1.3;
	}

	.clock-number {
		fill: var(--clock-number);
		font-family: 'Arial Rounded MT Bold', 'Avenir Next Rounded', 'Nunito', system-ui, sans-serif;
		font-size: 8.7px;
		font-weight: 700;
		text-anchor: middle;
		dominant-baseline: middle;
	}

	.hour-hand {
		stroke: var(--clock-hour-hand);
		stroke-linecap: round;
		stroke-width: 3.2;
	}

	.minute-hand {
		stroke: var(--clock-minute-hand);
		stroke-linecap: round;
		stroke-width: 2.2;
	}

	.second-hand {
		stroke: var(--clock-second-hand);
		stroke-linecap: round;
		stroke-width: 1.2;
	}

	.center-dot {
		fill: var(--clock-center);
	}

	.time-display {
		font-size: clamp(1.5em, 4vw, 3em);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.05em;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		line-height: 1.2;
	}

	.date-display {
		font-size: clamp(0.75em, 2vw, 1em);
		font-weight: 400;
		opacity: 0.8;
		margin-top: 0.4em;
		text-align: center;
		white-space: nowrap;
	}

	.time-display {
		white-space: nowrap;
	}

	.fit-probe {
		position: absolute;
		visibility: hidden;
		pointer-events: none;
		font-size: 100px;
		margin: 0;
	}
</style>
