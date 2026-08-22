<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import CustomWidget from '$lib/widgets/CustomWidget.svelte';
	import { grantedHosts, revokeHost, setAllowLocalNetwork } from '$lib/widgets/network-bridge.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import './settings/modal-form.css';
	import type { CustomWidgetConfig } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: CustomWidgetConfig;
		/** Stable instance id, used to key this widget's network grants. */
		widgetId?: string;
		onSave: (config: CustomWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, widgetId, onSave }: Props = $props();
	const htmlPlaceholder = '<h1>My widget</h1>\n<p>Your HTML here...</p>';

	let activeTab = $state('content');
	let localConfig = $state<CustomWidgetConfig>({ content: '', ...config });
	$effect(() => {
		if (isOpen) {
			localConfig = { content: '', ...config };
			activeTab = 'content';
		}
	});

	const widgetGrants = $derived(grantedHosts());

	function handleSave() {
		onSave(localConfig);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}
</script>

<SettingsModalShell
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
				{ key: 'content', label: 'HTML' },
				{ key: 'appearance', label: 'Appearance' },
				{ key: 'network', label: 'Network' }
			]}
		/>

		{#if activeTab === 'content'}
			<SettingSection title="HTML Content">
				<SettingRow label="HTML" labelFor="widget-custom-html">
					<textarea
						id="widget-custom-html"
						class="html-input"
						bind:value={localConfig.content}
						placeholder={htmlPlaceholder}
						spellcheck="false"
					></textarea>
				</SettingRow>
				<p class="hint">
					HTML is sanitized — scripts, event handlers, and inline styles are removed. See the
					examples README for details.
				</p>
			</SettingSection>

			<!-- Live preview: the real widget component, fed by the same config
			     the editor edits — sanitized and styled exactly as production. -->
			<div class="preview-box">
				<span class="preview-label">Preview</span>
				<div class="preview-surface">
					<CustomWidget config={localConfig} />
				</div>
			</div>
		{:else if activeTab === 'appearance'}
			<WidgetAppearanceSettings widgetType="custom" bind:appearance={localConfig.appearance} />
		{:else}
			<SettingSection title="Network access">
				{#if widgetGrants.length === 0}
					<p class="hint">
						No hosts granted yet. A prompt appears the first time a widget fetches data from a
						host.
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
					<label class="toggle-row">
						<input
							type="checkbox"
							checked={settingsStore.settings.allow_local_network}
							onchange={(e) => setAllowLocalNetwork(e.currentTarget.checked)}
						/>
						<span>
							Allow widgets to fetch from private/LAN addresses (e.g. Home Assistant, a NAS).
							Applies to all Custom HTML widgets.
						</span>
					</label>
				</SettingRow>
			</SettingSection>
		{/if}
	</div>
</SettingsModalShell>

<style>
	.hint {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.85rem;
		margin: 8px 0 0;
	}

	.preview-box {
		margin-top: 12px;
	}

	.preview-label {
		display: block;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
		margin-bottom: 6px;
	}

	.preview-surface {
		width: 100%;
		height: 240px;
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
		padding: 6px 8px;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 6px;
	}

	.grant-host {
		font-size: 0.85rem;
		word-break: break-all;
	}

	.grant-revoke {
		flex-shrink: 0;
		padding: 4px 10px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.08);
		color: white;
		cursor: pointer;
	}

	.toggle-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
	}
</style>
