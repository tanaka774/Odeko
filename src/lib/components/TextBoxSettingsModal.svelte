<script lang="ts">
	import { getAppearanceBackground, getWidgetAppearance } from '$lib/widgets/appearance';
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import type { TextBoxWidgetConfig, TextEffect } from '$lib/widgets/types';
	import { getTextEffectShadow, getVerticalJustify } from '$lib/widgets/text-style';
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
		verticalAlign: 'top',
		fontWeight: 400,
		lineHeight: 1.5,
		letterSpacing: 0,
		textEffect: 'none',
		textEffectColor: '#000000',
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

	const verticalOptions = [
		{ value: 'top', label: 'Top' },
		{ value: 'middle', label: 'Middle' },
		{ value: 'bottom', label: 'Bottom' }
	] as const;

	const weightOptions = [
		{ value: 300, label: 'Light' },
		{ value: 400, label: 'Regular' },
		{ value: 600, label: 'Semibold' },
		{ value: 700, label: 'Bold' },
		{ value: 900, label: 'Black' }
	];

	const effectOptions: { value: TextEffect; label: string }[] = [
		{ value: 'none', label: 'None' },
		{ value: 'shadow', label: 'Shadow' },
		{ value: 'glow', label: 'Glow' },
		{ value: 'outline', label: 'Outline' }
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
	modalKey="textbox"
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

			<SettingSection title="Text Style">
				<SettingRow label="Vertical Align">
					<div class="radio-group">
						{#each verticalOptions as opt (opt.value)}
							<label class="radio-label">
								<input
									type="radio"
									name="textbox-vertical"
									value={opt.value}
									bind:group={localConfig.verticalAlign}
								/>
								<span>{opt.label}</span>
							</label>
						{/each}
					</div>
				</SettingRow>

				<SettingRow label="Weight" labelFor="textbox-weight">
					<select id="textbox-weight" class="select-input" bind:value={localConfig.fontWeight}>
						{#each weightOptions as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</SettingRow>

				<SettingRow label="Line Height: {localConfig.lineHeight}" labelFor="textbox-line-height">
					<input
						id="textbox-line-height"
						class="range-input"
						type="range"
						min="0.8"
						max="3"
						step="0.1"
						bind:value={localConfig.lineHeight}
					/>
				</SettingRow>

				<SettingRow
					label="Letter Spacing: {localConfig.letterSpacing}em"
					labelFor="textbox-letter-spacing"
				>
					<input
						id="textbox-letter-spacing"
						class="range-input"
						type="range"
						min="-0.1"
						max="0.5"
						step="0.01"
						bind:value={localConfig.letterSpacing}
					/>
				</SettingRow>

				<SettingRow label="Effect" labelFor="textbox-effect">
					<select id="textbox-effect" class="select-input" bind:value={localConfig.textEffect}>
						{#each effectOptions as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</SettingRow>

				{#if localConfig.textEffect && localConfig.textEffect !== 'none'}
					<SettingRow label="Effect Color" labelFor="textbox-effect-color">
						<div class="color-control">
							<input
								type="color"
								id="textbox-effect-color"
								bind:value={localConfig.textEffectColor}
							/>
							<input
								type="text"
								aria-label="Effect color value"
								bind:value={localConfig.textEffectColor}
							/>
						</div>
					</SettingRow>
				{/if}
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
					font-weight: {localConfig.fontWeight};
					line-height: {localConfig.lineHeight};
					letter-spacing: {localConfig.letterSpacing}em;
					text-shadow: {getTextEffectShadow(localConfig)};
					justify-content: {getVerticalJustify(localConfig)};
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
		gap: calc(0.5714 * var(--modal-font-size));
	}

	.align-btn {
		flex: 1;
		padding: calc(0.7143 * var(--modal-font-size));
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		cursor: pointer;
		font-size: calc(1.3714 * var(--modal-font-size));
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
		gap: calc(0.5714 * var(--modal-font-size));
	}

	.preview-box {
		padding: calc(1.1429 * var(--modal-font-size));
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		min-height: calc(5.7143 * var(--modal-font-size));
		display: flex;
		flex-direction: column;
		color: white;
		transition: all 0.2s ease;
	}
</style>
