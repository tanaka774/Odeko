<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { open } from '@tauri-apps/plugin-dialog';
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import CustomWidget from '$lib/widgets/CustomWidget.svelte';
	import { grantedHosts, revokeHost, setAllowLocalNetwork } from '$lib/page-bridge.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import './settings/modal-form.css';
	import type { CustomWidgetConfig } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: CustomWidgetConfig;
		/** Stable instance id; keys the widget's saved data. */
		widgetId?: string;
		onSave: (config: CustomWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, widgetId, onSave }: Props = $props();

	const GUIDE_URL = 'https://github.com/tanaka774/Odeko/tree/main/examples/custom-html-widgets';

	function createLocalConfig(source: CustomWidgetConfig): CustomWidgetConfig {
		return { content: '', scripts: true, file: null, watch: false, ...source };
	}

	let activeTab = $state('content');
	let localConfig = $state<CustomWidgetConfig>(createLocalConfig(config));
	let previewConfig = $state<CustomWidgetConfig>(createLocalConfig(config));
	let status = $state('');

	$effect(() => {
		if (isOpen) {
			localConfig = createLocalConfig(config);
			previewConfig = createLocalConfig(config);
			activeTab = 'content';
			status = '';
		}
	});

	const widgetGrants = $derived(grantedHosts());

	function fileName(path: string): string {
		return path.split(/[\\/]/).pop() ?? path;
	}

	async function readText(path: string): Promise<string> {
		const file = await invoke<{ content: string }>('read_text_file', { path });
		return file.content;
	}

	async function run(task: () => Promise<void>) {
		status = '';
		try {
			await task();
		} catch (error) {
			status = String(error);
		}
	}

	function refreshPreview() {
		previewConfig = $state.snapshot(localConfig) as CustomWidgetConfig;
	}

	async function linkFile() {
		await run(async () => {
			const path = await open({
				multiple: false,
				filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
			});
			if (typeof path !== 'string') return;
			localConfig.content = await readText(path);
			localConfig.file = path;
			localConfig.watch = true;
			refreshPreview();
		});
	}

	async function unlinkFile() {
		await run(async () => {
			if (localConfig.file) localConfig.content = await readText(localConfig.file);
			localConfig.file = null;
			localConfig.watch = false;
			refreshPreview();
		});
	}

	async function clearData() {
		if (!widgetId) return;
		await run(async () => {
			await invoke('widget_data_clear', { widgetId });
			status = 'Saved data cleared. It reloads with the page.';
		});
	}

	function handleSave() {
		onSave($state.snapshot(localConfig) as CustomWidgetConfig);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}
</script>

<SettingsModalShell
	modalKey="custom"
	bind:isOpen
	title="Custom HTML Settings"
	onClose={handleClose}
	onSave={handleSave}
	tabKey={activeTab}
>
	<div class="settings-form">
		<TabBar
			{activeTab}
			onTabChange={(key) => (activeTab = key)}
			tabs={[
				{ key: 'content', label: 'Page' },
				{ key: 'appearance', label: 'Appearance' },
				{ key: 'network', label: 'Network & Data' }
			]}
		/>

		{#if activeTab === 'content'}
			<SettingSection title="Page">
				<p class="hint">
					A full HTML page with its own CSS and JavaScript, plus the <code>odeko</code> helper for
					saved data and network access.
					<button class="link" onclick={() => invoke('open_url', { url: GUIDE_URL })}
						>Guide &amp; examples</button
					>
				</p>

				<div class="row">
					{#if localConfig.file}
						<span class="path" title={localConfig.file}>{fileName(localConfig.file)}</span>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.watch} onchange={refreshPreview} />
							<span>Reload on change</span>
						</label>
						<button type="button" class="action-btn" onclick={unlinkFile}>Unlink</button>
					{:else}
						<button type="button" class="action-btn" onclick={linkFile}>Load from file…</button>
					{/if}
				</div>

				<SettingRow label="HTML" labelFor="widget-custom-html">
					<textarea
						id="widget-custom-html"
						class="html-input"
						bind:value={localConfig.content}
						readonly={Boolean(localConfig.file && localConfig.watch)}
						spellcheck="false"
					></textarea>
				</SettingRow>

				<SettingRow>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={localConfig.scripts} onchange={refreshPreview} />
						<span>Run JavaScript</span>
					</label>
				</SettingRow>

				{#if status}
					<p class="hint">{status}</p>
				{/if}
			</SettingSection>

			<div class="preview-box">
				<div class="preview-head">
					<span class="preview-label">Preview</span>
					<button type="button" class="action-btn" onclick={refreshPreview}>Run</button>
				</div>
				<div class="preview-surface">
					<CustomWidget config={previewConfig} {widgetId} />
				</div>
			</div>
		{:else if activeTab === 'appearance'}
			<WidgetAppearanceSettings widgetType="custom" bind:appearance={localConfig.appearance} />
		{:else}
			<SettingSection title="Network access">
				{#if widgetGrants.length === 0}
					<p class="hint">
						No hosts allowed yet. A prompt appears the first time a page fetches from a host.
					</p>
				{:else}
					{#each widgetGrants as host (host)}
						<div class="grant-row">
							<span class="grant-host">{host}</span>
							<button class="grant-revoke" onclick={() => revokeHost(host)}>Revoke</button>
						</div>
					{/each}
				{/if}
			</SettingSection>

			<SettingSection title="Local network">
				<SettingRow>
					<label class="checkbox-label">
						<input
							type="checkbox"
							checked={settingsStore.settings.allow_local_network}
							onchange={(e) => setAllowLocalNetwork(e.currentTarget.checked)}
						/>
						<span>
							Allow pages to fetch from private/LAN addresses (e.g. Home Assistant, a NAS). Applies
							to every Custom HTML widget and background.
						</span>
					</label>
				</SettingRow>
			</SettingSection>

			<SettingSection title="Saved data">
				<p class="hint">
					What this widget saved with <code>odeko.storage</code>. It stays on this computer and is
					not part of exported presets.
				</p>
				<SettingRow>
					<button type="button" class="action-btn danger" disabled={!widgetId} onclick={clearData}
						>Clear saved data</button
					>
				</SettingRow>
				{#if status}
					<p class="hint">{status}</p>
				{/if}
			</SettingSection>
		{/if}
	</div>
</SettingsModalShell>

<style>
	.hint {
		color: var(--modal-muted, rgba(255, 255, 255, 0.55));
		font-size: calc(0.9286 * var(--modal-font-size));
		margin: 0;
	}

	.link {
		padding: 0;
		background: none;
		border: none;
		color: var(--modal-accent, #7cb3e8);
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.path {
		max-width: 50%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: monospace;
		font-size: calc(0.9286 * var(--modal-font-size));
	}

	.preview-box {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.preview-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.preview-label {
		font-size: calc(0.9143 * var(--modal-font-size));
		color: var(--modal-muted, rgba(255, 255, 255, 0.5));
	}

	.preview-surface {
		width: 100%;
		height: calc(17.1429 * var(--modal-font-size));
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.3);
	}

	.grant-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 2px 6px;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 6px;
	}

	.grant-host {
		font-size: calc(0.9714 * var(--modal-font-size));
		word-break: break-all;
	}

	.grant-revoke {
		flex-shrink: 0;
		padding: 2px 8px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.08);
		color: white;
		cursor: pointer;
	}
</style>
