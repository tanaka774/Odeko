<script lang="ts">
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { KeybindConfig } from '$lib/stores/settings.svelte';
	import { keybindToString, eventToKeybind } from '$lib/stores/settings.svelte';

	let {
		value = $bindable({
			key: '',
			ctrl: false,
			alt: false,
			shift: false,
			meta: false
		} satisfies KeybindConfig),
		label,
		disabled = false,
		onRemove
	} = $props<{
		value: KeybindConfig;
		label: string;
		disabled?: boolean;
		onRemove?: () => void;
	}>();

	let isRecording = $state(false);

	function startRecording() {
		if (disabled) return;
		isRecording = true;
	}

	function handleRecordingKeydown(event: KeyboardEvent) {
		if (!isRecording || disabled) return;
		event.preventDefault();
		event.stopPropagation();

		if (event.key === 'Escape') {
			isRecording = false;
			return;
		}

		const modifierOnly = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'Unidentified'].includes(
			event.key
		);
		if (modifierOnly) return;

		value = eventToKeybind(event);
		isRecording = false;
	}

	let displayText = $derived(keybindToString(value));
</script>

<div class="keybind-recorder">
	<div class="keybind-label">{label}</div>
	<div class="keybind-controls">
		<div class="key-bindings" class:recording={isRecording}>
			{#if isRecording}
				<span class="recording-indicator">Press a key...</span>
			{:else if value.key}
				<span class="key-display">{displayText}</span>
			{:else}
				<span class="key-empty">Not set</span>
			{/if}
		</div>
		<div class="keybind-actions">
			<button class="record-btn" class:recording={isRecording} onclick={startRecording} {disabled}>
				{#if isRecording}
					Recording...
				{:else}
					Record
				{/if}
			</button>
			{#if onRemove}
				<button class="remove-btn" onclick={onRemove} title="Remove keybind" {disabled}>
					<Trash2 size={14} strokeWidth={2} />
				</button>
			{/if}
		</div>
	</div>
</div>

<svelte:window onkeydown={handleRecordingKeydown} />

<style>
	.keybind-recorder {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
	}

	.keybind-label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.8rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.keybind-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.key-bindings {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 120px;
	}

	.key-display {
		font-family: monospace;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.9);
	}

	.key-empty {
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.85rem;
		font-style: italic;
	}

	.recording-indicator {
		color: rgba(59, 130, 246, 0.9);
		font-size: 0.85rem;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.record-btn {
		padding: 5px 14px;
		height: 30px;
		box-sizing: border-box;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.record-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.record-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.record-btn.recording {
		background: rgba(59, 130, 246, 0.3);
		border-color: rgba(59, 130, 246, 0.5);
		color: rgba(59, 130, 246, 1);
	}

	.keybind-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.remove-btn {
		padding: 6px 8px;
		height: 30px;
		width: 30px;
		box-sizing: border-box;
		background: var(--edit-danger-bg);
		border: 1px solid var(--edit-control-border);
		border-radius: 8px;
		color: var(--edit-control-fg);
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.remove-btn:hover:not(:disabled) {
		background: var(--edit-danger-bg-hover);
		color: var(--edit-control-fg);
	}

	.remove-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
