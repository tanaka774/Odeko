<script lang="ts">
	import SettingSection from './SettingSection.svelte';
	import SettingRow from './SettingRow.svelte';
	import {
		KEEP_AS_SHARED,
		MAIN_NOTE,
		notesStore,
		type NoteChoice,
		type NoteKind
	} from '$lib/stores/notes.svelte';

	interface Props {
		kind: NoteKind;
		/** The widget's saved noteId. */
		noteId: string | undefined;
		choice: NoteChoice;
		/** Lets the dialog drop its edits when the shown note changes. */
		onswitch: (id: string) => void;
	}

	let { kind, noteId, choice = $bindable(), onswitch }: Props = $props();

	const ownPrivate = $derived(notesStore.isPrivate(kind, notesStore.effectiveId(kind, noteId)));
	const notes = $derived(notesStore.lists[kind]);
	const selected = $derived(notesStore.get(kind, choice.selected));
	const canEditSelected = $derived(
		choice.shared && choice.selected !== KEEP_AS_SHARED && !!selected?.loaded
	);

	let renaming = $state(false);
	let draftName = $state('');

	function emit() {
		onswitch(notesStore.sourceId(kind, noteId, choice));
	}

	async function select(id: string) {
		renaming = false;
		choice = { ...choice, selected: id };
		if (id !== KEEP_AS_SHARED) await notesStore.load(kind, id);
		emit();
	}

	async function toggleShared(shared: boolean) {
		choice = { ...choice, shared };
		if (shared && choice.selected !== KEEP_AS_SHARED) await notesStore.load(kind, choice.selected);
		emit();
	}

	async function createShared() {
		const name = notesStore.uniqueName(kind, kind === 'memo' ? 'Memo' : 'Tasks');
		const id = await notesStore.create(kind, { name, shared: true, data: null });
		await select(id);
		draftName = name;
		renaming = true;
	}

	async function commitRename() {
		renaming = false;
		await notesStore.rename(kind, choice.selected, draftName);
	}

	async function removeSelected() {
		const name = selected?.name ?? '';
		if (!confirm(`Delete the shared note "${name}" for every preset? This cannot be undone.`))
			return;
		const id = choice.selected;
		await notesStore.remove(kind, id);
		await select(MAIN_NOTE);
	}

	$effect(() => {
		void notesStore.refreshList(kind);
	});
</script>

<SettingSection title="Content">
	<SettingRow>
		<label class="checkbox-label">
			<input
				type="checkbox"
				checked={choice.shared}
				onchange={(event) => toggleShared(event.currentTarget.checked)}
			/>
			<span>Shared between presets</span>
		</label>
	</SettingRow>

	{#if choice.shared}
		<SettingRow label="Shared note" labelFor="note-source-{kind}">
			<div class="note-row">
				{#if renaming}
					<input
						class="text-input"
						bind:value={draftName}
						onkeydown={(event) => {
							if (event.key === 'Enter') void commitRename();
							if (event.key === 'Escape') renaming = false;
						}}
						onblur={commitRename}
					/>
				{:else}
					<select
						id="note-source-{kind}"
						class="select-input"
						value={choice.selected}
						onchange={(event) => select(event.currentTarget.value)}
					>
						{#if ownPrivate}
							<option value={KEEP_AS_SHARED}>This widget's content (new shared note)</option>
						{/if}
						{#each notes as note (note.id)}
							<option value={note.id}>{note.name || 'Untitled'}</option>
						{/each}
					</select>
				{/if}
				<button class="action-btn" type="button" onclick={createShared}>New</button>
				<button
					class="action-btn"
					type="button"
					disabled={!canEditSelected || renaming}
					onclick={() => {
						draftName = selected?.name ?? '';
						renaming = true;
					}}>Rename</button
				>
				<button
					class="action-btn danger"
					type="button"
					disabled={!canEditSelected || choice.selected === MAIN_NOTE}
					onclick={removeSelected}>Delete</button
				>
			</div>
		</SettingRow>
	{/if}
</SettingSection>

<style>
	.note-row {
		display: flex;
		gap: calc(0.4286 * var(--modal-font-size));
		align-items: stretch;
	}

	.note-row > :first-child {
		flex: 1;
		min-width: 0;
	}

	.note-row .action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
