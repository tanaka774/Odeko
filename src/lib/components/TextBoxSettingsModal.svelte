<script lang="ts">
	import { getAppearanceBackground, getWidgetAppearance } from '$lib/widgets/appearance';
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import type { TextBoxWidgetConfig } from '$lib/widgets/types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: TextBoxWidgetConfig;
		onSave: (config: TextBoxWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');

	let localConfig = $state<TextBoxWidgetConfig>({
		content: '',
		textAlign: 'left',
		showBorderTop: true,
		showBorderRight: true,
		showBorderBottom: true,
		showBorderLeft: true,
		...config
	});

	const textAlignOptions = [
		{ value: 'left', label: 'Left', icon: '\u2b05\ufe0f' },
		{ value: 'center', label: 'Center', icon: '\u2b06\ufe0f' },
		{ value: 'right', label: 'Right', icon: '\u27a1\ufe0f' },
		{ value: 'justify', label: 'Justify', icon: '\u2194\ufe0f' }
	];

	const previewAppearance = $derived(
		getWidgetAppearance(localConfig, WIDGET_TYPE_APPEARANCE_DEFAULTS.textbox)
	);
	const previewBackground = $derived(getAppearanceBackground(previewAppearance));

	$effect(() => {
		if (isOpen) {
			localConfig = {
				content: '',
				textAlign: 'left',
				showBorderTop: true,
				showBorderRight: true,
				showBorderBottom: true,
				showBorderLeft: true,
				...config
			};
			activeTab = 'settings';
		}
	});

	function handleSave() {
		onSave({ ...localConfig });
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}
</script>

<SettingsModalShell
	bind:isOpen
	title="Text Box Settings"
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
			<SettingSection title="Text Appearance">
				<SettingRow label="Text Align">
					<div class="align-buttons">
						{#each textAlignOptions as opt (opt.value)}
							<button
								class="align-btn"
								class:active={localConfig.textAlign === opt.value}
								onclick={() =>
									(localConfig.textAlign = opt.value as 'left' | 'center' | 'right' | 'justify')}
								title={opt.label}
								type="button"
							>
								{opt.icon}
							</button>
						{/each}
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection title="Border Edges">
				<SettingRow label="Visible Edges">
					<div class="edge-checkboxes">
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.showBorderTop} />
							<span>Top</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.showBorderRight} />
							<span>Right</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.showBorderBottom} />
							<span>Bottom</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.showBorderLeft} />
							<span>Left</span>
						</label>
					</div>
				</SettingRow>
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType="textbox"
				bind:appearance={localConfig.appearance}
				defaults={WIDGET_TYPE_APPEARANCE_DEFAULTS.textbox ?? {}}
			/>
		{/if}

		<SettingSection title="Preview">
			<div
				class="preview-box"
				style="
					font-size: {previewAppearance.fontSize}px;
					font-family: {previewAppearance.fontFamily};
					color: {previewAppearance.textColor};
					background: {previewBackground};
					text-align: {localConfig.textAlign};
					border-top: {previewAppearance.borderWidth === 0 ||
				previewAppearance.borderStyle === 'none' ||
				!localConfig.showBorderTop
					? 'none'
					: `${previewAppearance.borderWidth}px ${previewAppearance.borderStyle} ${previewAppearance.borderColor}`};
					border-right: {previewAppearance.borderWidth === 0 ||
				previewAppearance.borderStyle === 'none' ||
				!localConfig.showBorderRight
					? 'none'
					: `${previewAppearance.borderWidth}px ${previewAppearance.borderStyle} ${previewAppearance.borderColor}`};
					border-bottom: {previewAppearance.borderWidth === 0 ||
				previewAppearance.borderStyle === 'none' ||
				!localConfig.showBorderBottom
					? 'none'
					: `${previewAppearance.borderWidth}px ${previewAppearance.borderStyle} ${previewAppearance.borderColor}`};
					border-left: {previewAppearance.borderWidth === 0 ||
				previewAppearance.borderStyle === 'none' ||
				!localConfig.showBorderLeft
					? 'none'
					: `${previewAppearance.borderWidth}px ${previewAppearance.borderStyle} ${previewAppearance.borderColor}`};
					border-radius: {previewAppearance.borderRadius}px;
					padding: {previewAppearance.padding}px;
					opacity: {previewAppearance.opacity};
				"
			>
				Sample text preview
			</div>
		</SettingSection>
	</div>
</SettingsModalShell>

<style>
	.align-buttons {
		display: flex;
		gap: 8px;
	}

	.align-btn {
		flex: 1;
		padding: 10px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		cursor: pointer;
		font-size: 1.2rem;
		transition: all 0.2s ease;
		color: white;
	}

	.align-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.align-btn.active {
		background: rgba(120, 160, 200, 0.3);
		border-color: rgba(120, 160, 200, 0.6);
	}

	.edge-checkboxes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.preview-box {
		padding: 16px;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		min-height: 80px;
		color: white;
		line-height: 1.5;
		transition: all 0.2s ease;
	}
</style>
