<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import SecretInput from './settings/SecretInput.svelte';
	import type { AiChatWidgetConfig } from '$lib/widgets/types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from '$lib/widgets/types';
	import {
		aiSettingsStore,
		effectiveSearch,
		isDeepSeek,
		newProfile,
		PROVIDER_LABELS,
		PROVIDER_PRESETS,
		SEARCH_LABELS,
		searchKeyId,
		type AiProfile,
		type AiProviderKind,
		type ConfigAccess,
		type SearchService,
		type SearchSettings
	} from '$lib/ai/settings.svelte';
	import { formatResults, search } from '$lib/ai/web';

	interface Props {
		isOpen?: boolean;
		config?: AiChatWidgetConfig;
		onSave: (config: AiChatWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('chat');
	let localConfig = $state<AiChatWidgetConfig>({});
	let profiles = $state<AiProfile[]>([]);
	let editingId = $state<string | null>(null);
	let configAccess = $state<ConfigAccess>('ask');
	let searchSettings = $state<SearchSettings>({
		service: 'off',
		deepseekProfileId: null,
		searxngUrl: ''
	});
	let searchTouched = false;
	/** Keys typed in this dialog, written to Rust on save; '' removes a key. */
	let pendingKeys = $state<Record<string, string>>({});
	let saveError = $state('');
	let testResult = $state('');
	let testing = $state(false);

	const editing = $derived(profiles.find((p) => p.id === editingId) ?? null);
	const kinds = Object.keys(PROVIDER_LABELS) as AiProviderKind[];
	const services = Object.keys(SEARCH_LABELS) as SearchService[];
	const deepseekProfiles = $derived(profiles.filter(isDeepSeek));

	$effect(() => {
		if (!isOpen) return;
		localConfig = { profileId: null, instructions: '', ...config };
		activeTab = 'chat';
		saveError = '';
		testResult = '';
		pendingKeys = {};
		searchTouched = false;
		void aiSettingsStore.load().then(() => {
			const current = aiSettingsStore.settings;
			profiles = structuredClone($state.snapshot(current.profiles));
			configAccess = current.configAccess;
			searchTouched = current.search !== null;
			searchSettings = { ...effectiveSearch(current) };
			editingId = localConfig.profileId ?? current.defaultProfileId ?? profiles[0]?.id ?? null;
		});
	});

	function hasKey(id: string): boolean {
		if (id in pendingKeys) return pendingKeys[id].trim().length > 0;
		return aiSettingsStore.hasKey(id);
	}

	function setSearch(patch: Partial<SearchSettings>) {
		searchSettings = { ...searchSettings, ...patch };
		searchTouched = true;
		testResult = '';
	}

	function addProfile(presetLabel: string) {
		const preset = PROVIDER_PRESETS.find((p) => p.label === presetLabel) ?? PROVIDER_PRESETS[0];
		const profile = newProfile(preset);
		profiles.push(profile);
		editingId = profile.id;
		localConfig.profileId ??= profile.id;
	}

	function removeProfile(id: string) {
		profiles = profiles.filter((p) => p.id !== id);
		delete pendingKeys[id];
		if (localConfig.profileId === id) localConfig.profileId = profiles[0]?.id ?? null;
		if (editingId === id) editingId = profiles[0]?.id ?? null;
		if (searchSettings.deepseekProfileId === id) searchSettings.deepseekProfileId = null;
	}

	function currentSearch(): SearchSettings {
		const chosen = { ...searchSettings };
		if (chosen.service === 'deepseek' && !chosen.deepseekProfileId) {
			chosen.deepseekProfileId = deepseekProfiles[0]?.id ?? null;
		}
		return chosen;
	}

	async function persist() {
		for (const [id, key] of Object.entries(pendingKeys)) await aiSettingsStore.setKey(id, key);
		pendingKeys = {};
		const current = aiSettingsStore.settings;
		const defaultProfileId = profiles.some((p) => p.id === current.defaultProfileId)
			? current.defaultProfileId
			: (localConfig.profileId ?? profiles[0]?.id ?? null);
		await aiSettingsStore.save({
			profiles: $state.snapshot(profiles) as AiProfile[],
			defaultProfileId,
			search: searchTouched ? currentSearch() : null,
			configAccess
		});
		await aiSettingsStore.pruneKeys();
	}

	async function testSearch() {
		testing = true;
		testResult = '';
		try {
			await persist();
			const chosen = currentSearch();
			const results = await search(
				{
					settings: chosen,
					deepseekProfile: profiles.find((p) => p.id === chosen.deepseekProfileId) ?? null,
					hasKey: (id) => aiSettingsStore.hasKey(id)
				},
				'Odeko desktop canvas',
				2
			);
			testResult = `OK: ${results.length} results\n${formatResults(results).slice(0, 300)}`;
		} catch (error) {
			testResult = `Failed: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			testing = false;
		}
	}

	async function handleSave() {
		try {
			await persist();
		} catch (error) {
			saveError = String(error);
			return;
		}
		onSave({ ...localConfig });
		isOpen = false;
	}
</script>

<SettingsModalShell
	modalKey="aichat"
	bind:isOpen
	title="AI Chat Settings"
	onClose={() => (isOpen = false)}
	onSave={handleSave}
	tabKey={activeTab}
>
	<div class="settings-form">
		<TabBar
			{activeTab}
			onTabChange={(key) => (activeTab = key)}
			tabs={[
				{ key: 'chat', label: 'Chat' },
				{ key: 'providers', label: 'Providers' },
				{ key: 'appearance', label: 'Appearance' }
			]}
		/>

		{#if activeTab === 'chat'}
			<SettingSection title="Model">
				<SettingRow label="Provider for this widget" labelFor="aichat-profile">
					{#if profiles.length === 0}
						<button class="action-btn" onclick={() => (activeTab = 'providers')}>
							<Plus size={14} />Add a provider
						</button>
					{:else}
						<select id="aichat-profile" class="select-input" bind:value={localConfig.profileId}>
							{#each profiles as profile (profile.id)}
								<option value={profile.id}>{profile.name} · {profile.model}</option>
							{/each}
						</select>
					{/if}
				</SettingRow>
			</SettingSection>
			<SettingSection title="Instructions">
				<SettingRow labelFor="aichat-instructions">
					<textarea
						id="aichat-instructions"
						class="html-input instructions"
						bind:value={localConfig.instructions}
						spellcheck="false"
					></textarea>
					<p class="hint">Added to the system prompt, e.g. a personality or style rules.</p>
				</SettingRow>
			</SettingSection>
			<SettingSection title="Canvas config access">
				<SettingRow>
					<div class="radio-group">
						<label class="radio-label">
							<input type="radio" name="ai-config-access" value="ask" bind:group={configAccess} />
							<span>Ask once per chat</span>
						</label>
						<label class="radio-label">
							<input
								type="radio"
								name="ai-config-access"
								value="always"
								bind:group={configAccess}
							/>
							<span>Always allow</span>
						</label>
					</div>
					<p class="hint">
						The config includes app paths and memo text. Launching programs, shortcuts and disabling
						power confirmations always ask first. Shared by all AI chat widgets.
					</p>
				</SettingRow>
			</SettingSection>
		{:else if activeTab === 'providers'}
			<SettingSection title="Providers">
				<p class="hint">
					Shared by every AI chat widget. API keys stay in the app's backend and are never part of
					presets or exports.
				</p>
				<div class="profile-list">
					{#each profiles as profile (profile.id)}
						<button
							class="profile-chip"
							class:active={profile.id === editingId}
							onclick={() => (editingId = profile.id)}
						>
							{profile.name}
						</button>
					{/each}
					<select
						class="select-input add-select"
						aria-label="Add provider"
						value=""
						onchange={(event) => {
							addProfile(event.currentTarget.value);
							event.currentTarget.value = '';
						}}
					>
						<option value="" disabled>+ Add</option>
						{#each PROVIDER_PRESETS as preset (preset.label)}
							<option value={preset.label}>{preset.label}</option>
						{/each}
					</select>
				</div>
			</SettingSection>

			{#if editing}
				<SettingSection title={editing.name || 'Provider'}>
					<div class="field-grid">
						<SettingRow label="Name" labelFor="ai-name">
							<input id="ai-name" class="text-input" type="text" bind:value={editing.name} />
						</SettingRow>
						<SettingRow label="API type" labelFor="ai-kind">
							<select id="ai-kind" class="select-input" bind:value={editing.kind}>
								{#each kinds as kind (kind)}
									<option value={kind}>{PROVIDER_LABELS[kind]}</option>
								{/each}
							</select>
						</SettingRow>
					</div>
					<SettingRow label="Model" labelFor="ai-model">
						<input
							id="ai-model"
							class="text-input"
							type="text"
							bind:value={editing.model}
							spellcheck="false"
						/>
					</SettingRow>
					<SettingRow label="API key" labelFor="ai-key">
						<SecretInput
							id="ai-key"
							saved={hasKey(editing.id)}
							onchange={(key) => (pendingKeys[editing.id] = key)}
						/>
					</SettingRow>
					<SettingRow
						label={editing.kind === 'openai-compatible' ? 'Base URL' : 'Base URL (optional)'}
						labelFor="ai-base"
					>
						<input
							id="ai-base"
							class="text-input"
							type="text"
							bind:value={editing.baseUrl}
							spellcheck="false"
						/>
						{#if editing.kind === 'openai-compatible'}
							<p class="hint">
								Any OpenAI-compatible server, local or remote, e.g. http://localhost:11434/v1 or
								http://192.168.1.10:8000/v1. The API key may stay empty for local servers.
							</p>
						{/if}
					</SettingRow>
					<div class="action-buttons">
						<button class="action-btn danger" onclick={() => removeProfile(editing.id)}>
							<Trash2 size={14} />Remove
						</button>
					</div>
				</SettingSection>
			{/if}

			<SettingSection title="Web search">
				<SettingRow label="Service" labelFor="ai-search">
					<select
						id="ai-search"
						class="select-input"
						value={searchSettings.service}
						onchange={(event) => setSearch({ service: event.currentTarget.value as SearchService })}
					>
						{#each services as service (service)}
							<option value={service}>{SEARCH_LABELS[service]}</option>
						{/each}
					</select>
				</SettingRow>

				{#if searchSettings.service === 'deepseek'}
					<SettingRow label="Uses the key of" labelFor="ai-search-deepseek">
						{#if deepseekProfiles.length === 0}
							<p class="hint">Add a DeepSeek provider above first; search reuses its API key.</p>
						{:else}
							<select
								id="ai-search-deepseek"
								class="select-input"
								value={searchSettings.deepseekProfileId ?? deepseekProfiles[0].id}
								onchange={(event) => setSearch({ deepseekProfileId: event.currentTarget.value })}
							>
								{#each deepseekProfiles as profile (profile.id)}
									<option value={profile.id}>{profile.name}</option>
								{/each}
							</select>
							<p class="hint">$0.75 per 1,000 searches, billed to your DeepSeek balance.</p>
						{/if}
					</SettingRow>
				{:else if searchSettings.service === 'searxng'}
					<SettingRow label="Server URL" labelFor="ai-searxng">
						<input
							id="ai-searxng"
							class="text-input"
							type="text"
							spellcheck="false"
							value={searchSettings.searxngUrl}
							oninput={(event) => setSearch({ searxngUrl: event.currentTarget.value })}
						/>
						<p class="hint">Your own instance, with "json" enabled in search.formats.</p>
					</SettingRow>
				{:else if searchSettings.service !== 'off'}
					{@const keyId = searchKeyId(searchSettings.service)}
					<SettingRow
						label="{SEARCH_LABELS[searchSettings.service]} API key"
						labelFor="ai-search-key"
					>
						<SecretInput
							id="ai-search-key"
							saved={hasKey(keyId)}
							onchange={(key) => {
								pendingKeys[keyId] = key;
								testResult = '';
							}}
						/>
						<p class="hint">
							{#if searchSettings.service === 'tavily'}
								Free key at app.tavily.com, 1,000 searches a month.
							{:else if searchSettings.service === 'brave'}
								Key at api-dashboard.search.brave.com, with free monthly credit.
							{:else}
								Key at dashboard.exa.ai, with free monthly credit.
							{/if}
						</p>
					</SettingRow>
				{/if}

				{#if searchSettings.service !== 'off'}
					<div class="action-buttons">
						<button class="action-btn" disabled={testing} onclick={testSearch}>
							{testing ? 'Testing…' : 'Save and test'}
						</button>
					</div>
					{#if testResult}<pre class="test-result">{testResult}</pre>{/if}
				{/if}
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType="aichat"
				bind:appearance={localConfig.appearance}
				defaults={WIDGET_TYPE_APPEARANCE_DEFAULTS.aichat ?? {}}
			/>
		{/if}
		{#if saveError}<p class="error">{saveError}</p>{/if}
	</div>
</SettingsModalShell>

<style>
	.instructions {
		min-height: calc(7 * var(--modal-font-size));
	}

	.hint {
		margin: 4px 0 0;
		color: var(--modal-muted, rgba(255, 255, 255, 0.55));
		font-size: calc(0.8571 * var(--modal-font-size));
	}

	.profile-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}

	.profile-chip {
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid var(--modal-input-border, rgba(255, 255, 255, 0.2));
		background: transparent;
		color: var(--modal-text, white);
		font-size: calc(0.9286 * var(--modal-font-size));
		cursor: pointer;
	}

	.profile-chip.active {
		background: var(--modal-accent, rgba(120, 160, 200, 0.85));
		color: var(--modal-accent-text, white);
		border-color: transparent;
	}

	.add-select {
		width: auto;
		padding-top: 4px;
		padding-bottom: 4px;
	}

	.error {
		margin: 0;
		color: #fca5a5;
	}

	.test-result {
		margin: 4px 0 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: calc(0.8571 * var(--modal-font-size));
		color: var(--modal-muted, rgba(255, 255, 255, 0.7));
	}
</style>
