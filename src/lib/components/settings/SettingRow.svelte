<script lang="ts">
	interface Props {
		label?: string;
		labelFor?: string;
		/** Leading checkbox, used by the bulk-apply editor to select a property. */
		select?: { checked: boolean; label: string; onchange: (checked: boolean) => void };
	}

	let { label, labelFor, select }: Props = $props();
</script>

<div class="setting-row">
	{#if label || select}
		<div class="setting-label-row">
			{#if select}
				<input
					type="checkbox"
					class="select-checkbox"
					aria-label={select.label}
					checked={select.checked}
					onchange={(event) => select.onchange(event.currentTarget.checked)}
				/>
			{/if}
			{#if label}
				<label class="setting-label" for={labelFor}>{label}</label>
			{/if}
		</div>
	{/if}
	<slot />
</div>

<style>
	.setting-row {
		display: flex;
		flex-direction: column;
		gap: calc(0.5714 * var(--modal-font-size));
	}

	.setting-label-row {
		display: flex;
		align-items: center;
		gap: calc(0.4286 * var(--modal-font-size));
	}

	.select-checkbox {
		width: calc(1.1429 * var(--modal-font-size));
		height: calc(1.1429 * var(--modal-font-size));
		accent-color: var(--modal-accent, rgba(120, 160, 200, 0.9));
		cursor: pointer;
		flex-shrink: 0;
		margin: 0;
	}

	.setting-label {
		display: block;
		color: var(--modal-text, rgba(255, 255, 255, 0.9));
		font-weight: 600;
		font-size: calc(1.0286 * var(--modal-font-size));
	}
</style>
