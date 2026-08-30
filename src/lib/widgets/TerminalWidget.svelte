<script lang="ts" module>
	// Module-level buffer that persists across component lifecycle
	// This stores terminal output even when the widget is destroyed
	const terminalOutputBuffer: string[] = [];
	// Track if we've already restored the buffer (persists across remounts)
	let hasRestoredBuffer = false;

	const terminalAnsiTheme = {
		foreground: '#e0e0e0',
		cursor: '#e0e0e0',
		cursorAccent: '#000000',
		selectionBackground: '#264f78',
		black: '#000000',
		red: '#cd3131',
		green: '#0dbc79',
		yellow: '#e5e510',
		blue: '#2472c8',
		magenta: '#bc3fbc',
		cyan: '#11a8cd',
		white: '#e5e5e5',
		brightBlack: '#666666',
		brightRed: '#f14c4c',
		brightGreen: '#23d18b',
		brightYellow: '#f5f543',
		brightBlue: '#3b8eea',
		brightMagenta: '#d670d6',
		brightCyan: '#29b8db',
		brightWhite: '#e5e5e5'
	};
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { listen, type UnlistenFn } from '@tauri-apps/api/event';
	import { getAppearanceBackground, getAppearanceBorder, getWidgetAppearance } from './appearance';
	import type { TerminalWidgetConfig, WidgetComponentProps } from './types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from './types';
	import type { Terminal } from '@xterm/xterm';
	import type { FitAddon } from '@xterm/addon-fit';

	import '@xterm/xterm/css/xterm.css';

	type Props = WidgetComponentProps<TerminalWidgetConfig>;

	let { config = {}, borderRadius = 12 }: Props = $props();

	// Extract config values with defaults
	const fontSize = $derived(config.fontSize ?? 14);
	const fontFamily = $derived(config.fontFamily ?? 'Consolas');

	// Create a key that changes when any visual config value changes - triggers terminal recreation
	const configKey = $derived(
		`${config.fontSize}-${config.fontFamily}-${config.appearance?.backgroundColor}-${config.appearance?.backgroundOpacity}-${config.appearance?.textColor}`
	);

	// DOM reference for the terminal container
	let terminalContainer = $state<HTMLElement>();
	let terminal = $state<Terminal | null>(null);
	let fitAddon = $state<FitAddon | null>(null);
	let resizeObserver = $state<ResizeObserver | null>(null);

	// Track if terminal is ready
	let isReady = $state(false);
	let unlistenOutput: UnlistenFn | null = null;
	// Track restore index to only show new output on remount
	let restoreIndex = $state(0);

	// Track previous config key to detect changes
	let previousConfigKey = $state('');

	// Function to create and initialize the terminal
	async function createTerminal() {
		if (!terminalContainer) return;

		// Cleanup existing terminal if any
		await cleanupTerminal();

		// Dynamically import xterm to avoid SSR issues
		const { Terminal } = await import('@xterm/xterm');
		const { FitAddon } = await import('@xterm/addon-fit');

		// Build xterm theme: dark ANSI palette + user's appearance overrides.
		const theme = {
			...terminalAnsiTheme,
			background: getAppearanceBackground(appearance)
		};
		if (config?.appearance?.textColor) {
			theme.foreground = appearance.textColor;
		}

		// Create terminal instance with transparency enabled
		terminal = new Terminal({
			fontFamily: `${fontFamily}, "Courier New", monospace`,
			fontSize: fontSize,
			theme: theme,
			cursorStyle: 'block',
			cursorBlink: true,
			allowProposedApi: true,
			allowTransparency: true, // Enable transparency support
			scrollback: 1000 // Limit scrollback to prevent memory issues
		});

		// Create and load fit addon
		fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);

		// Open terminal in container
		terminal.open(terminalContainer);

		// Mark that we've restored the buffer at least once
		hasRestoredBuffer = true;

		// First resize to get proper dimensions
		fitTerminal();
		// Deferred fit: ensures correct dimensions after layout fully settles
		requestAnimationFrame(() => fitTerminal());

		// Restore buffered output from where we left off
		// This ensures we don't clear the buffer and can remount multiple times
		if (terminalOutputBuffer.length > restoreIndex) {
			// Write all buffered content since last restore
			for (let i = restoreIndex; i < terminalOutputBuffer.length; i++) {
				terminal.write(terminalOutputBuffer[i]);
			}
			restoreIndex = terminalOutputBuffer.length;
		}

		// After restoring, ensure clean prompt by scrolling to bottom
		// and letting the shell continue naturally
		setTimeout(() => {
			terminal?.scrollToBottom();
		}, 100);

		// Handle input from terminal to PTY
		terminal.onData((data: string) => {
			invoke('terminal_write', { data }).catch((err: Error) => console.error(err));
		});

		// Listen for output from PTY
		unlistenOutput = await listen<string>('terminal-output', (event) => {
			// Buffer the output for future widget remounts
			terminalOutputBuffer.push(event.payload);
			// Keep only last 500 entries to prevent memory bloat
			// Remove from the beginning (oldest) when over limit
			if (terminalOutputBuffer.length > 500) {
				terminalOutputBuffer.splice(0, terminalOutputBuffer.length - 500);
				// Adjust restore index to match
				restoreIndex = Math.max(0, restoreIndex - (terminalOutputBuffer.length - 500));
			}
			// Write to current terminal
			terminal?.write(event.payload);
		});

		// Shell should already be running from initial mount
		// Just mark as ready if this is a recreation
		isReady = true;

		// Initial fit
		setTimeout(() => {
			fitTerminal();
		}, 100);

		// Setup ResizeObserver to auto-resize when container changes
		resizeObserver = new ResizeObserver(() => {
			fitTerminal();
		});
		resizeObserver.observe(terminalContainer);
	}

	// Function to cleanup terminal without killing the shell
	async function cleanupTerminal() {
		// Clean up event listener
		if (unlistenOutput) {
			unlistenOutput();
			unlistenOutput = null;
		}

		// Clean up ResizeObserver
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}

		// Dispose terminal instance
		if (terminal) {
			terminal.dispose();
			terminal = null;
		}

		fitAddon = null;
	}

	onMount(async () => {
		// Store initial config key
		previousConfigKey = configKey;

		// Create initial terminal
		await createTerminal();

		// Start the shell (only on initial mount)
		try {
			await invoke('terminal_create_shell');
			// Start the reader to begin receiving output
			await invoke('terminal_start_reader');
		} catch (error) {
			console.error('Failed to create shell:', error);
			terminal?.writeln('\r\n\x1b[91mFailed to start shell. Error: ' + error + '\x1b[0m');
		}
	});

	// Reactive effect: recreate terminal when config changes
	$effect(() => {
		// Only recreate if we've already mounted and the key has changed
		if (previousConfigKey && configKey !== previousConfigKey && terminalContainer) {
			createTerminal();
			previousConfigKey = configKey;
		}
	});

	onDestroy(async () => {
		// Clean up event listener
		if (unlistenOutput) {
			unlistenOutput();
		}
		// Clean up ResizeObserver
		if (resizeObserver) {
			resizeObserver.disconnect();
		}
		// Note: We don't kill the shell process here as per requirements
		// The shell continues running in the background
		// Output continues to be buffered in terminalOutputBuffer
	});

	// Function to fit terminal to container size
	export function fitTerminal() {
		if (!fitAddon || !terminal) return;

		fitAddon.fit();

		// Notify Rust backend of resize
		const rows = terminal.rows;
		const cols = terminal.cols;
		if (rows && cols) {
			invoke('terminal_resize', { rows, cols }).catch((err: Error) => console.error(err));
		}
	}

	// Expose fit function for parent component
	export function handleResize() {
		fitTerminal();
	}

	const appearance = $derived(
		getWidgetAppearance(config, { ...WIDGET_TYPE_APPEARANCE_DEFAULTS.terminal, borderRadius })
	);
	const widgetBorder = $derived(getAppearanceBorder(appearance));
</script>

<div
	class="terminal-widget"
	style:--appearance-border={widgetBorder}
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-opacity={appearance.opacity}
>
	<div bind:this={terminalContainer} class="terminal-container"></div>
	{#if !isReady}
		<div
			class="loading-overlay"
			style:background="rgba(30, 30, 30, 0.9)"
			style:border-radius="{appearance.borderRadius}px"
		>
			<span class="loading-text">Starting terminal...</span>
		</div>
	{/if}
</div>

<style>
	.terminal-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative;
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		opacity: var(--appearance-opacity);
	}

	.terminal-container {
		flex: 1;
		padding: 0;
		overflow: hidden;
		background: transparent !important;
	}

	:global(.xterm) {
		padding: 0;
		background: transparent !important;
		width: 100%;
		height: 100%;
	}

	:global(.xterm-scrollable-element) {
		width: 100%;
		height: 100%;
	}

	:global(.xterm-viewport) {
		background-color: transparent !important;
		width: 100%;
		height: 100%;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	:global(.xterm-viewport::-webkit-scrollbar) {
		display: none;
		width: 0;
		height: 0;
	}

	/* Make xterm.js canvas and all internal elements transparent */
	:global(.xterm-screen) {
		background-color: transparent !important;
	}

	:global(.xterm-rows) {
		background-color: transparent !important;
	}

	:global(.xterm-screen canvas) {
		background-color: transparent !important;
	}

	/* Ensure terminal wrapper doesn't add background */
	:global(.xterm-terminal) {
		background-color: transparent !important;
	}

	.loading-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.loading-text {
		color: rgba(255, 255, 255, 0.7);
		font-size: 14px;
	}
</style>
