<script lang="ts">
	interface Props {
		id?: string;
		/** A key is stored; it is never shown, only replaced or removed. */
		saved: boolean;
		onchange: (key: string) => void;
	}

	let { id, saved, onchange }: Props = $props();

	let editing = $state(false);
	let value = $state('');
</script>

{#if saved && !editing}
	<div class="secret-saved">
		<span>Saved</span>
		<button class="action-btn" onclick={() => (editing = true)}>Replace</button>
		<button
			class="action-btn danger"
			onclick={() => {
				value = '';
				onchange('');
			}}>Remove</button
		>
	</div>
{:else}
	<input
		{id}
		class="text-input"
		type="password"
		autocomplete="off"
		spellcheck="false"
		bind:value
		oninput={() => onchange(value)}
	/>
{/if}

<style>
	.secret-saved {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.secret-saved span {
		flex: 1;
		color: var(--modal-muted, rgba(255, 255, 255, 0.6));
	}

	.secret-saved .action-btn {
		padding: 2px 10px;
	}
</style>
