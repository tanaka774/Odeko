<script lang="ts">
	interface Props {
		title: string;
	}

	let { title }: Props = $props();
</script>

<section class="setting-section">
	<h3>{title}</h3>
	<div class="section-content">
		<slot />
	</div>
</section>

<style>
	.setting-section {
		display: flex;
		flex-direction: column;
		gap: calc(0.7143 * var(--modal-font-size));
	}

	.setting-section h3 {
		margin: 0;
		color: var(--modal-text, rgba(255, 255, 255, 0.8));
		font-size: calc(1 * var(--modal-font-size));
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid var(--modal-divider, rgba(255, 255, 255, 0.1));
		padding-bottom: calc(0.4286 * var(--modal-font-size));
	}

	.section-content {
		display: flex;
		flex-direction: column;
		gap: calc(0.7143 * var(--modal-font-size));
	}
</style>
