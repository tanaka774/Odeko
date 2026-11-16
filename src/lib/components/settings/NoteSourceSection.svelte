<script lang="ts">
	import SettingSection from './SettingSection.svelte';
	import SettingRow from './SettingRow.svelte';
	import {
		MAIN_NOTE,
		NEW_NOTE,
		OWN_AS_SHARED,
		notesStore,
		type NoteChoice,
		type NoteKind
	} from '$lib/stores/notes.svelte';

	interface Props {
		kind: NoteKind;
		/** The widget's saved noteId. */
		noteId: string | undefined;
		choice: NoteChoice;
		/** The dialog has unsaved tab edits. */
		dirty: boolean;
		/** The shown note changed; the dialog reloads its tabs from it. */
		onswitch: (id: string) => void;
	}

	let { kind, noteId, choice = $bindable(), dirty, onswitch }: Props = $props();

	const ownPrivate = $derived(notesStore.isPrivate(kind, notesStore.effectiveId(kind, noteId)));
	const notes = $derived(notesStore.lists[kind]);
	const selected = $derived(notesStore.get(kind, choice.selected));
	const existing = $derived(
		choice.shared && choice.selected !== OWN_AS_SHARED && choice.selected !== NEW_NOTE
	);
	const loses = $derived(notesStore.losesOwnContent(kind, noteId, choice));

	let renaming = $state(false);
	let draftName = $state('');

	function confirmDiscardEdits(): boolean {
		return !dirty || confirm('Discard your unsaved tab changes?');
	}

	async function apply(next: NoteChoice) {
		const before = notesStore.sourceId(kind, noteId, choice);
		if (next.shared && ![OWN_AS_SHARED, NEW_NOTE].includes(next.selected)) {
			await notesStore.load(kind, next.selected);
		}
		const after = notesStore.sourceId(kind, noteId, next);
		if (after !== before && !confirmDiscardEdits()) return false;
		choice = next;
		if (after !== before) onswitch(after);
		return true;
	}

	async function select(event: Event & { currentTarget: HTMLSelectElement }) {
		const value = event.currentTarget.value;
		renaming = false;
		if (!(await apply({ ...choice, selected: value }))) event.currentTarget.value = choice.selected;
	}

	async function toggleShared(event: Event & { currentTarget: HTMLInputElement }) {
		const shared = event.currentTarget.checked;
		if (!(await apply({ ...choice, shared }))) event.currentTarget.checked = choice.shared;
	}

	async function startNew() {
		const name = notesStore.uniqueName(kind, kind === 'memo' ? 'Memo' : 'Tasks');
		if (!(await apply({ ...choice, selected: NEW_NOTE, newName: name }))) return;
		draftName = name;
		renaming = true;
	}

	async function commitRename() {
		if (!renaming) return;
		renaming = false;
		if (choice.selected === NEW_NOTE) {
			choice = { ...choice, newName: draftName.trim() || choice.newName };
		} else {
			await notesStore.rename(kind, choice.selected, draftName);
		}
	}

	async function removeSelected() {
		if (!confirm(`Delete the shared note "${selected?.name ?? ''}" for every preset?`)) return;
		await notesStore.remove(kind, choice.selected);
		choice = { ...choice, selected: MAIN_NOTE };
		onswitch(notesStore.sourceId(kind, noteId, choice));
	}

	$effect(() => {
		void notesStore.refreshList(kind);
	});
</script>

<SettingSection title="Content">
	<SettingRow>
		<label class="checkbox-label">
			<input type="checkbox" checked={choice.shared} onchange={toggleShared} />
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
						onchange={select}
					>
						{#each notes as note (note.id)}
							<option value={note.id}>{note.name || 'Untitled'}</option>
						{/each}
						{#if ownPrivate}
							<option value={OWN_AS_SHARED}>Keep this widget's content as a new shared note</option>
						{/if}
						{#if choice.selected === NEW_NOTE}
							<option value={NEW_NOTE}>{choice.newName} (new)</option>
						{/if}
					</select>
				{/if}
				<button class="action-btn" type="button" disabled={renaming} onclick={startNew}>New</button>
				<button
					class="action-btn"
					type="button"
					disabled={renaming || !(existing || choice.selected === NEW_NOTE)}
					onclick={() => {
						draftName = choice.selected === NEW_NOTE ? choice.newName : (selected?.name ?? '');
						renaming = true;
					}}>Rename</button
				>
				<button
					class="action-btn danger"
					type="button"
					disabled={renaming || !existing || choice.selected === MAIN_NOTE}
					onclick={removeSelected}>Delete</button
				>
			</div>
		</SettingRow>
		{#if loses}
			<p class="note-warning">
				This widget's own content is replaced by the shared note and deleted on save. To keep it,
				pick "Keep this widget's content as a new shared note".
			</p>
		{/if}
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

	.note-warning {
		margin: 0;
		color: var(--modal-warning, #f5b85c);
		font-size: calc(0.9286 * var(--modal-font-size));
	}
</style>
