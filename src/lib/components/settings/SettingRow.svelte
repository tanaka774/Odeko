<script lang="ts">
	interface Props {
		label?: string;
		labelFor?: string;
	}

	let { label, labelFor }: Props = $props();
</script>

<div class="setting-row">
	{#if label}
		<label class="setting-label" for={labelFor}>{label}</label>
	{/if}
	<slot />
</div>

<style>
	.setting-row {
		display: flex;
		flex-direction: column;
		gap: calc(0.5714 * var(--modal-font-size));
	}

	.setting-label {
		display: block;
		color: var(--modal-text, rgba(255, 255, 255, 0.9));
		font-weight: 600;
		font-size: calc(1.0286 * var(--modal-font-size));
	}
</style>
