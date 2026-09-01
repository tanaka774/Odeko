<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { loadIconDataUrl } from '$lib/icon-image';
	import type { CanvasIcon } from '$lib/icons';
	import { createBackdropClickHandler } from '$lib/components/modal/backdrop';

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

	const backdrop = createBackdropClickHandler(close);

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

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			close();
		}
	}
</script>

{#if isOpen}
	<div
		class="modal-overlay"
		{...backdrop}
		onkeydown={handleKeydown}
		role="dialog"
		tabindex="-1"
		aria-modal="true"
	>
		<div
			class="modal-content"
			onclick={(e) => e.stopPropagation()}
			style="border-radius: {settingsStore.settings.border_radius}px;"
		>
			<div class="modal-header">
				<h2>Select Application</h2>
				<button class="close-btn" onclick={close}>✕</button>
			</div>

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

			{#if selectedApp}
				<div class="selected-info">
					<div class="selected-details">
						<span class="selected-name">{selectedApp.name}</span>
						<span class="selected-exec"
							>{selectedApp.exec}{selectedApp.args ? ` ${selectedApp.args}` : ''}</span
						>
					</div>
					<button class="add-btn" onclick={confirmSelection}> Add to Canvas </button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(5px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}

	.modal-content {
		background: rgba(30, 30, 40, 0.95);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		width: 85%;
		max-width: 900px;
		height: 90%;
		max-height: 90%;
		display: flex;
		flex-direction: column;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		overflow: hidden;
		border-radius: 16px;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 24px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
	}

	.close-btn {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		font-size: 1.25rem;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
		transition: all 0.2s ease;
		line-height: 1;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.search-box {
		position: relative;
		padding: 12px 24px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.search-icon {
		position: absolute;
		left: 40px;
		top: 50%;
		transform: translateY(-50%);
		font-size: 16px;
		opacity: 0.5;
	}

	.search-box input {
		width: 100%;
		padding: 10px 16px 10px 44px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 10px;
		color: rgba(255, 255, 255, 0.95);
		font-size: 15px;
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
		padding: 16px 24px;
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
		gap: 16px;
	}

	.spinner {
		width: 40px;
		height: 40px;
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
		grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		gap: 12px;
	}

	.app-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 12px 10px;
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
		width: 56px;
		height: 56px;
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
		padding: 4px;
	}

	.icon-placeholder {
		font-size: 24px;
		font-weight: bold;
		color: rgba(255, 255, 255, 0.8);
	}

	.app-name {
		font-size: 13px;
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
		padding: 12px 24px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.03);
		border-radius: 0 0 24px 24px;
		flex-shrink: 0;
	}

	.selected-details {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.selected-name {
		font-size: 16px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
	}

	.selected-exec {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.5);
		font-family: monospace;
	}

	.add-btn {
		padding: 10px 20px;
		background: rgba(120, 160, 200, 0.25);
		border: 1px solid rgba(120, 160, 200, 0.5);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.95);
		font-size: 14px;
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
		width: 10px;
	}

	.apps-container::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 5px;
		margin: 4px;
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
