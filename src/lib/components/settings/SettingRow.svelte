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
		gap: 8px;
	}

	.setting-label {
		display: block;
		color: rgba(255, 255, 255, 0.9);
		font-weight: 600;
		font-size: 0.9rem;
	}
</style>
