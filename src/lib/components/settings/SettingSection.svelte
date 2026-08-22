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
		gap: 10px;
	}

	.setting-section h3 {
		margin: 0;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		padding-bottom: 6px;
	}

	.section-content {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
</style>
