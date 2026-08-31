<script lang="ts">
	import { open } from '@tauri-apps/plugin-dialog';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import {
		TEXT_APPEARANCE_FIELDS,
		WIDGET_TYPE_APPEARANCE_DEFAULTS,
		type SlideshowWidgetConfig
	} from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: SlideshowWidgetConfig;
		onSave: (config: SlideshowWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');

	let localConfig = $state<SlideshowWidgetConfig>({
		intervalMs: 5000,
		shuffle: false,
		loop: true,
		transitionMs: 600,
		...config,
		images: [...(config.images ?? [])]
	});

	$effect(() => {
		if (isOpen) {
			localConfig = {
				intervalMs: 5000,
				shuffle: false,
				loop: true,
				transitionMs: 600,
				...config,
				images: [...(config.images ?? [])]
			};
			activeTab = 'settings';
		}
	});

	function handleSave() {
		onSave(localConfig);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}

	async function handleAddImages() {
		const selected = await open({
			multiple: true,
			filters: [
				{
					name: 'Images',
					extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
				}
			]
		});

		if (selected && Array.isArray(selected)) {
			const newPaths = selected
				.map((p) => {
					if (typeof p === 'string') return convertFileSrc(p);
					return null;
				})
				.filter(Boolean) as string[];

			localConfig.images = [...(localConfig.images ?? []), ...newPaths];
		}
	}

	function handleRemoveImage(index: number) {
		const updated = [...(localConfig.images ?? [])];
		updated.splice(index, 1);
		localConfig.images = updated;
	}
</script>

<SettingsModalShell
	bind:isOpen
	title="Slideshow Settings"
	onClose={handleClose}
	onSave={handleSave}
	tabKey={activeTab}
>
	<div class="settings-form">
		<TabBar
			{activeTab}
			onTabChange={(key) => (activeTab = key)}
			tabs={[
				{ key: 'settings', label: 'Settings' },
				{ key: 'appearance', label: 'Appearance' }
			]}
		/>

		{#if activeTab === 'settings'}
			<SettingSection title="Images">
				<SettingRow>
					<div class="image-list">
						{#if (localConfig.images ?? []).length === 0}
							<div class="image-empty">No images added yet</div>
						{:else}
							{#each localConfig.images ?? [] as imgPath, i (i)}
								<div class="image-item">
									<img class="image-thumb" src={imgPath} alt={`Image ${i + 1}`} />
									<span class="image-name" title={imgPath}>Image {i + 1}</span>
									<button
										class="remove-image-btn"
										onclick={() => handleRemoveImage(i)}
										title="Remove"
									>
										&#10005;
									</button>
								</div>
							{/each}
						{/if}
					</div>
				</SettingRow>
				<button class="add-images-btn" onclick={handleAddImages}> &#xFF0B; Add Images </button>
			</SettingSection>

			<SettingSection title="Playback">
				<SettingRow label="Interval: {((localConfig.intervalMs ?? 5000) / 1000).toFixed(1)}s">
					<input
						class="range-input"
						type="range"
						min="1000"
						max="60000"
						step="1000"
						bind:value={localConfig.intervalMs}
					/>
				</SettingRow>

				<SettingRow label="Transition: {localConfig.transitionMs ?? 600}ms">
					<input
						class="range-input"
						type="range"
						min="200"
						max="2000"
						step="100"
						bind:value={localConfig.transitionMs}
					/>
				</SettingRow>

				<SettingRow>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={localConfig.shuffle} />
						<span>Shuffle order</span>
					</label>
				</SettingRow>

				<SettingRow>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={localConfig.loop} />
						<span>Loop (restart at end)</span>
					</label>
				</SettingRow>
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType="slideshow"
				bind:appearance={localConfig.appearance}
				defaults={WIDGET_TYPE_APPEARANCE_DEFAULTS.slideshow ?? {}}
				hideFields={[...TEXT_APPEARANCE_FIELDS, 'padding']}
			/>
		{/if}
	</div>
</SettingsModalShell>

<style>
	.image-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 200px;
		overflow-y: auto;
	}

	.image-list::-webkit-scrollbar {
		width: 6px;
	}

	.image-list::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
	}

	.image-list::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
	}

	.image-list::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.image-empty {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.85rem;
		padding: 12px;
		text-align: center;
	}

	.image-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
	}

	.image-thumb {
		width: 40px;
		height: 30px;
		object-fit: cover;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.image-name {
		flex: 1;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.remove-image-btn {
		background: none;
		border: none;
		color: rgba(255, 100, 100, 0.6);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 2px 6px;
		border-radius: 4px;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.remove-image-btn:hover {
		background: rgba(255, 100, 100, 0.2);
		color: rgba(255, 100, 100, 0.9);
	}

	.add-images-btn {
		width: 100%;
		padding: 10px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px dashed rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.2s ease;
	}

	.add-images-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.4);
		color: white;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.checkbox-label input[type='checkbox'] {
		accent-color: rgba(120, 160, 200, 0.85);
	}
</style>
