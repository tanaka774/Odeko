<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { loadIconDataUrl } from '$lib/icon-image';
	import type { CanvasIcon } from '$lib/icons';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';

	interface SystemApp {
		id: string;
		name: string;
		exec: string;
		args?: string;
		icon?: string;
		icon_path?: string;
		desktop_file: string;
		categories: string[];
		comment?: string;
	}

	let { isOpen = $bindable(false), onSelect } = $props<{
		isOpen: boolean;
		onSelect: (app: CanvasIcon) => void;
	}>();

	let apps = $state<SystemApp[]>([]);
	let filteredApps = $state<SystemApp[]>([]);
	let searchQuery = $state('');
	let isLoading = $state(false);
	let selectedApp = $state<SystemApp | null>(null);

	async function loadApps() {
		if (apps.length > 0) return;

		isLoading = true;
		try {
			const result = await invoke<SystemApp[]>('scan_installed_apps');
			apps = result;
			filteredApps = result;
		} catch (error) {
			console.error('Failed to scan apps:', error);
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (isOpen) {
			loadApps();
		}
	});

	$effect(() => {
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			filteredApps = apps.filter(
				(app) =>
					app.name.toLowerCase().includes(query) ||
					app.categories.some((cat) => cat.toLowerCase().includes(query))
			);
		} else {
			filteredApps = apps;
		}
	});

	function close() {
		isOpen = false;
		searchQuery = '';
		selectedApp = null;
	}

	function selectApp(app: SystemApp) {
		selectedApp = app;
	}

	function confirmSelection() {
		if (selectedApp) {
			const newIcon: CanvasIcon = {
				id: `app-${Date.now()}`,
				name: selectedApp.name,
				path: selectedApp.exec,
				icon_path: selectedApp.icon_path,
				icon_type: 'app',
				args: selectedApp.args,
				x: 150,
				y: 150,
				width: 80,
				height: 80
			};
			onSelect(newIcon);
			close();
		}
	}
</script>

{#snippet appFooter()}
	<div class="selected-info">
		<div class="selected-details">
			<span class="selected-name">{selectedApp?.name}</span>
			<span class="selected-exec"
				>{selectedApp?.exec}{selectedApp?.args ? ` ${selectedApp.args}` : ''}</span
			>
		</div>
		<button class="add-btn" onclick={confirmSelection}> Add to Canvas </button>
	</div>
{/snippet}

<SettingsModalShell
	bind:isOpen
	modalKey="app-picker"
	title="Select Application"
	onClose={close}
	maxWidth="900px"
	footer={selectedApp ? appFooter : null}
	bodyFlush
>
	<div class="search-box">
		<span class="search-icon">🔍</span>
		<input type="text" placeholder="Search apps..." bind:value={searchQuery} />
	</div>

	<div class="apps-container">
		{#if isLoading}
			<div class="loading">
				<span class="spinner"></span>
				<p>Scanning applications...</p>
			</div>
		{:else if filteredApps.length === 0}
			<div class="empty-state">
				{#if searchQuery}
					<p>No apps found matching "{searchQuery}"</p>
				{:else}
					<p>No applications found</p>
				{/if}
			</div>
		{:else}
			<div class="apps-grid">
				{#each filteredApps as app (app.id)}
					<button
						class="app-item"
						class:selected={selectedApp?.id === app.id}
						onclick={() => selectApp(app)}
						title={app.comment || app.exec}
					>
						<div class="app-icon">
							{#await loadIconDataUrl(app.icon_path)}
								<span class="icon-placeholder">{app.name.charAt(0)}</span>
							{:then iconData}
								{#if iconData}
									<img src={iconData} alt={app.name} />
								{:else}
									<span class="icon-placeholder">{app.name.charAt(0)}</span>
								{/if}
							{:catch}
								<span class="icon-placeholder">{app.name.charAt(0)}</span>
							{/await}
						</div>
						<span class="app-name">{app.name}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</SettingsModalShell>

<style>
	.search-box {
		position: relative;
		padding: calc(0.8571 * var(--modal-font-size)) calc(1.7143 * var(--modal-font-size));
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.search-icon {
		position: absolute;
		left: calc(2.8571 * var(--modal-font-size));
		top: 50%;
		transform: translateY(-50%);
		font-size: calc(1.1429 * var(--modal-font-size));
		opacity: 0.5;
	}

	.search-box input {
		width: 100%;
		padding: calc(0.7143 * var(--modal-font-size)) calc(1.1429 * var(--modal-font-size))
			calc(0.7143 * var(--modal-font-size)) calc(3.1429 * var(--modal-font-size));
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 10px;
		color: rgba(255, 255, 255, 0.95);
		font-size: calc(1.0714 * var(--modal-font-size));
		outline: none;
		transition: all 0.2s ease;
	}

	.search-box input:focus {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(120, 160, 200, 0.6);
		box-shadow: 0 0 0 3px rgba(120, 160, 200, 0.15);
	}

	.search-box input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}

	.apps-container {
		flex: 1;
		overflow-y: auto;
		padding: calc(1.1429 * var(--modal-font-size)) calc(1.7143 * var(--modal-font-size));
		min-height: 0;
	}

	.loading,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: rgba(255, 255, 255, 0.5);
		gap: calc(1.1429 * var(--modal-font-size));
	}

	.spinner {
		width: calc(2.8571 * var(--modal-font-size));
		height: calc(2.8571 * var(--modal-font-size));
		border: 3px solid rgba(255, 255, 255, 0.1);
		border-top-color: rgba(120, 160, 200, 0.8);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.apps-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(calc(7.1429 * var(--modal-font-size)), 1fr));
		gap: calc(0.8571 * var(--modal-font-size));
	}

	.app-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(0.5714 * var(--modal-font-size));
		padding: calc(0.8571 * var(--modal-font-size)) calc(0.7143 * var(--modal-font-size));
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid transparent;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.app-item:hover {
		background: rgba(255, 255, 255, 0.1);
		transform: translateY(-2px);
	}

	.app-item.selected {
		background: rgba(120, 160, 200, 0.2);
		border-color: rgba(120, 160, 200, 0.5);
	}

	.app-icon {
		width: calc(4 * var(--modal-font-size));
		height: calc(4 * var(--modal-font-size));
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		overflow: hidden;
	}

	.app-icon img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		padding: calc(0.2857 * var(--modal-font-size));
	}

	.icon-placeholder {
		font-size: calc(1.7143 * var(--modal-font-size));
		font-weight: bold;
		color: rgba(255, 255, 255, 0.8);
	}

	.app-name {
		font-size: calc(0.9286 * var(--modal-font-size));
		color: rgba(255, 255, 255, 0.8);
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}

	.selected-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: calc(0.8571 * var(--modal-font-size));
		width: 100%;
	}

	.selected-details {
		display: flex;
		flex-direction: column;
		gap: calc(0.2857 * var(--modal-font-size));
	}

	.selected-name {
		font-size: calc(1.1429 * var(--modal-font-size));
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
	}

	.selected-exec {
		font-size: calc(0.9286 * var(--modal-font-size));
		color: rgba(255, 255, 255, 0.5);
		font-family: monospace;
	}

	.add-btn {
		padding: calc(0.7143 * var(--modal-font-size)) calc(1.4286 * var(--modal-font-size));
		background: rgba(120, 160, 200, 0.25);
		border: 1px solid rgba(120, 160, 200, 0.5);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.95);
		font-size: calc(1 * var(--modal-font-size));
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.add-btn:hover {
		background: rgba(120, 160, 200, 0.35);
		transform: scale(1.03);
	}

	.add-btn:active {
		transform: scale(0.98);
	}

	.apps-container::-webkit-scrollbar {
		width: calc(0.7143 * var(--modal-font-size));
	}

	.apps-container::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 5px;
		margin: calc(0.2857 * var(--modal-font-size));
	}

	.apps-container::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 5px;
		border: 2px solid transparent;
		background-clip: content-box;
	}

	.apps-container::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.35);
		border: 2px solid transparent;
		background-clip: content-box;
	}
</style>
