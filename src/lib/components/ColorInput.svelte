<script lang="ts">
	import { normalizeColorInput } from '$lib/utils';

	let {
		value,
		onchange
	}: {
		/** Current color in "R, G, B" format, e.g. "20, 20, 30". */
		value: string;
		/** Called with the new "R, G, B" string whenever a valid color is chosen. */
		onchange: (value: string) => void;
	} = $props();

	// Draft shown in the text field. A writable $derived (Svelte 5.25+):
	// it follows `value`, but while typing it can be temporarily overridden
	// with an unfinished input (e.g. "#ff8") that never reaches the stored
	// setting. The override is dropped as soon as `value` changes.
	let draft = $derived(value);

	let hex = $derived(
		`#${value
			.split(',')
			.map((v) => parseInt(v.trim()).toString(16).padStart(2, '0'))
			.join('')}`
	);

	function commit(rgb: string) {
		draft = rgb;
		onchange(rgb);
	}
</script>

<div class="color-input-row">
	<input
		type="color"
		value={hex}
		oninput={(e) => {
			const hexValue = e.currentTarget.value.slice(1);
			commit(
				`${parseInt(hexValue.slice(0, 2), 16)}, ${parseInt(hexValue.slice(2, 4), 16)}, ${parseInt(hexValue.slice(4, 6), 16)}`
			);
		}}
		class="color-picker"
		title="Pick a color"
	/>
	<input
		type="text"
		value={draft}
		placeholder="#ff8800"
		oninput={(e) => {
			const parsed = normalizeColorInput(e.currentTarget.value);
			if (parsed) {
				commit(parsed);
			} else {
				draft = e.currentTarget.value;
			}
		}}
		class="color-code-input"
	/>
</div>

<style>
	.color-input-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.color-picker {
		width: 48px;
		height: 32px;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		background: none;
	}

	.color-code-input {
		flex: 1;
		min-width: 0;
		padding: 6px 10px;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.9);
		font-family: monospace;
		font-size: 0.875rem;
		outline: none;
	}

	.color-code-input:focus {
		border-color: rgba(120, 160, 200, 0.6);
	}

	.color-code-input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}
</style>
