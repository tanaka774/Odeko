<script lang="ts">
	import { open } from '@tauri-apps/plugin-dialog';
	import X from '@lucide/svelte/icons/x';
	import { fontFamilyValue, fontStore, primaryFamily } from '$lib/stores/fonts.svelte';

	interface Props {
		id?: string;
		value: string;
		onchange: (value: string) => void;
	}

	let { id, value, onchange }: Props = $props();

	const MAX_SHOWN = 200;

	let isOpen = $state(false);
	let query = $state('');
	let error = $state('');
	let rootEl = $state<HTMLDivElement | null>(null);

	const current = $derived(primaryFamily(value).toLowerCase());

	function matches(family: string): boolean {
		return family.toLowerCase().includes(query.trim().toLowerCase());
	}

	const added = $derived(fontStore.userFamilies.filter(matches));
	const generic = $derived(fontStore.generic.filter(matches));
	const installed = $derived(fontStore.system.filter(matches).slice(0, MAX_SHOWN));

	function openList() {
		isOpen = true;
		query = '';
		error = '';
		void fontStore.loadSystem();
	}

	function pick(family: string) {
		onchange(fontFamilyValue(family));
		isOpen = false;
	}

	function handleInput(event: Event) {
		const text = (event.currentTarget as HTMLInputElement).value;
		query = text;
		isOpen = true;
		onchange(text);
	}

	function handleFocusOut(event: FocusEvent) {
		if (!rootEl?.contains(event.relatedTarget as Node | null)) isOpen = false;
	}

	async function addFontFile() {
		error = '';
		const selected = await open({
			multiple: false,
			filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'ttc'] }]
		});
		if (typeof selected !== 'string') return;
		try {
			const family = await fontStore.importFile(selected);
			if (family) pick(family);
		} catch (err) {
			error = String(err);
		}
	}

	async function removeFont(family: string) {
		error = '';
		try {
			await fontStore.remove(family);
		} catch (err) {
			error = String(err);
		}
	}
</script>

<div class="font-picker" bind:this={rootEl} onfocusout={handleFocusOut}>
	<div class="font-picker-row">
		<input
			{id}
			class="text-input"
			type="text"
			role="combobox"
			aria-expanded={isOpen}
			aria-controls={id ? `${id}-list` : undefined}
			autocomplete="off"
			spellcheck="false"
			{value}
			style:font-family={value}
			onfocus={openList}
			onclick={() => !isOpen && openList()}
			oninput={handleInput}
			onkeydown={(event) => event.key === 'Escape' && (isOpen = false)}
		/>
		<button type="button" class="font-add" onclick={addFontFile}>Add font file…</button>
	</div>

	{#if error}
		<p class="font-error">{error}</p>
	{/if}

	{#if isOpen}
		<div class="font-list" id={id ? `${id}-list` : undefined} role="listbox" tabindex="-1">
			{#if added.length}
				<p class="font-group">Added</p>
				{#each added as family (family)}
					<div class="font-option-row">
						<button
							type="button"
							class="font-option"
							class:active={family.toLowerCase() === current}
							style:font-family={fontFamilyValue(family)}
							onclick={() => pick(family)}>{family}</button
						>
						<button
							type="button"
							class="font-remove"
							title="Remove {family}"
							aria-label="Remove {family}"
							onclick={() => removeFont(family)}
						>
							<X size={12} />
						</button>
					</div>
				{/each}
			{/if}

			{#if generic.length}
				<p class="font-group">Generic</p>
				{#each generic as family (family)}
					<button
						type="button"
						class="font-option"
						class:active={family === current}
						style:font-family={family}
						onclick={() => pick(family)}>{family}</button
					>
				{/each}
			{/if}

			{#if installed.length}
				<p class="font-group">Installed</p>
				{#each installed as family (family)}
					<button
						type="button"
						class="font-option"
						class:active={family.toLowerCase() === current}
						style:font-family={fontFamilyValue(family)}
						onclick={() => pick(family)}>{family}</button
					>
				{/each}
			{/if}

			{#if !added.length && !generic.length && !installed.length}
				<p class="font-group">No matching font. The typed value is used as is.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.font-picker {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.font-picker-row {
		display: flex;
		gap: 4px;
	}

	.font-picker-row .text-input {
		flex: 1;
		min-width: 0;
	}

	.font-add {
		flex-shrink: 0;
		padding: 0 8px;
		background: var(--modal-input-bg, rgba(0, 0, 0, 0.4));
		border: 1px solid var(--modal-input-border, rgba(255, 255, 255, 0.2));
		border-radius: var(--modal-control-radius, 8px);
		color: var(--modal-text, white);
		font-size: calc(0.8571 * var(--modal-font-size));
		cursor: pointer;
	}

	.font-add:hover {
		border-color: var(--modal-accent, rgba(120, 160, 200, 0.6));
	}

	.font-list {
		max-height: 240px;
		overflow-y: auto;
		background: var(--modal-input-bg, rgba(0, 0, 0, 0.4));
		border: 1px solid var(--modal-input-border, rgba(255, 255, 255, 0.2));
		border-radius: var(--modal-control-radius, 8px);
	}

	.font-group {
		margin: 0;
		padding: 4px 8px 2px;
		color: var(--modal-muted, rgba(255, 255, 255, 0.5));
		font-size: calc(0.7857 * var(--modal-font-size));
	}

	.font-option-row {
		display: flex;
	}

	.font-option {
		flex: 1;
		min-width: 0;
		display: block;
		width: 100%;
		padding: 3px 8px;
		background: transparent;
		border: none;
		color: var(--modal-text, white);
		font-size: calc(1.0714 * var(--modal-font-size));
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: pointer;
	}

	.font-option:hover,
	.font-option.active {
		background: rgba(255, 255, 255, 0.1);
	}

	.font-remove {
		display: flex;
		align-items: center;
		padding: 0 6px;
		background: transparent;
		border: none;
		color: var(--modal-muted, rgba(255, 255, 255, 0.5));
		cursor: pointer;
	}

	.font-remove:hover {
		color: #f87171;
	}

	.font-error {
		margin: 0;
		color: #f87171;
		font-size: calc(0.8571 * var(--modal-font-size));
	}
</style>
