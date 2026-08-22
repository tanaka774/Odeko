<script lang="ts">
	import { getAppearanceBackground, getWidgetAppearance } from '$lib/widgets/appearance';
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import type { TextBoxWidgetConfig } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: TextBoxWidgetConfig;
		onSave: (config: TextBoxWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');

	let localConfig = $state<TextBoxWidgetConfig>({
		content: '',
		fontSize: 16,
		fontFamily: 'system-ui',
		textAlign: 'left',
		showBorderTop: true,
		showBorderRight: true,
		showBorderBottom: true,
		showBorderLeft: true,
		...config
	});

	let useCustomFont = $state(false);
	let customFontValue = $state('');

	const fontOptions = [
		{ value: 'system-ui', label: 'System UI (Default)' },
		{ value: 'Arial, sans-serif', label: 'Arial' },
		{ value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
		{ value: 'Georgia, serif', label: 'Georgia' },
		{ value: 'Times New Roman, serif', label: 'Times New Roman' },
		{ value: 'Courier New, monospace', label: 'Courier New' },
		{ value: 'Verdana, sans-serif', label: 'Verdana' },
		{ value: 'Tahoma, sans-serif', label: 'Tahoma' },
		{ value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
		{ value: 'Palatino, serif', label: 'Palatino' },
		{ value: 'Garamond, serif', label: 'Garamond' },
		{ value: 'Bookman, serif', label: 'Bookman' },
		{ value: 'Comic Sans MS, cursive', label: 'Comic Sans MS' },
		{ value: 'Impact, sans-serif', label: 'Impact' },
		{ value: 'Lucida Console, monospace', label: 'Lucida Console' },
		{ value: 'Consolas, monospace', label: 'Consolas' },
		{ value: 'Monaco, monospace', label: 'Monaco' },
		{ value: 'Fira Code, monospace', label: 'Fira Code' },
		{ value: 'JetBrains Mono, monospace', label: 'JetBrains Mono' },
		{ value: 'Segoe UI, sans-serif', label: 'Segoe UI' },
		{ value: 'Roboto, sans-serif', label: 'Roboto' },
		{ value: 'Open Sans, sans-serif', label: 'Open Sans' },
		{ value: 'Lato, sans-serif', label: 'Lato' },
		{ value: 'Montserrat, sans-serif', label: 'Montserrat' },
		{ value: 'Poppins, sans-serif', label: 'Poppins' },
		{ value: 'Inter, sans-serif', label: 'Inter' },
		{ value: 'custom', label: 'Custom Font...' }
	];

	const textAlignOptions = [
		{ value: 'left', label: 'Left', icon: '\u2b05\ufe0f' },
		{ value: 'center', label: 'Center', icon: '\u2b06\ufe0f' },
		{ value: 'right', label: 'Right', icon: '\u27a1\ufe0f' },
		{ value: 'justify', label: 'Justify', icon: '\u2194\ufe0f' }
	];

	const previewAppearance = $derived(getWidgetAppearance(localConfig));
	const previewBackground = $derived(getAppearanceBackground(previewAppearance));

	$effect(() => {
		if (isOpen) {
			localConfig = {
				content: '',
				fontSize: 16,
				fontFamily: 'system-ui',
				textAlign: 'left',
				showBorderTop: true,
				showBorderRight: true,
				showBorderBottom: true,
				showBorderLeft: true,
				...config
			};

			activeTab = 'settings';

			const isCustom = !fontOptions.some((opt) => opt.value === config.fontFamily);
			useCustomFont = isCustom || config.fontFamily === 'custom';
			customFontValue = isCustom ? config.fontFamily || '' : '';
		}
	});

	function handleSave() {
		const finalConfig = {
			...localConfig,
			fontFamily: useCustomFont ? customFontValue : localConfig.fontFamily
		};
		onSave(finalConfig);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}

	function handleFontChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		if (target.value === 'custom') {
			useCustomFont = true;
			localConfig.fontFamily = customFontValue || 'Arial';
		} else {
			useCustomFont = false;
			localConfig.fontFamily = target.value;
		}
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
				<SettingRow label="Font Size">
					<div class="range-with-value">
						<input
							class="range-input"
							type="range"
							min="10"
							max="72"
							bind:value={localConfig.fontSize}
						/>
						<span class="range-value">{localConfig.fontSize}px</span>
					</div>
				</SettingRow>

				<SettingRow label="Font Family">
					<select
						class="select-input"
						value={useCustomFont ? 'custom' : localConfig.fontFamily}
						onchange={handleFontChange}
					>
						{#each fontOptions as opt}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
					{#if useCustomFont}
						<input
							type="text"
							class="text-input custom-font-input"
							placeholder="Enter font name (e.g., 'Fira Code')"
							bind:value={customFontValue}
						/>
					{/if}
				</SettingRow>

				<SettingRow label="Text Align">
					<div class="align-buttons">
						{#each textAlignOptions as opt}
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
			<WidgetAppearanceSettings widgetType="textbox" bind:appearance={localConfig.appearance} />
		{/if}

		<SettingSection title="Preview">
			<div
				class="preview-box"
				style="
					font-size: {localConfig.fontSize}px;
					font-family: {useCustomFont ? customFontValue : localConfig.fontFamily};
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
	.range-with-value {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.range-with-value input[type='range'] {
		flex: 1;
	}

	.range-value {
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.9rem;
		min-width: 50px;
		text-align: right;
	}

	.custom-font-input {
		margin-top: 8px;
	}

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
