<script lang="ts">
	import {
		DEFAULT_WIDGET_APPEARANCE,
		type WidgetAppearanceConfig,
		type WidgetBorderStyle,
		type WidgetAppearanceField,
		type WidgetType
	} from '$lib/widgets/types';
	import { colorToHexInputValue } from '$lib/widgets/appearance';
	import { SHARED_APPEARANCE_VARIABLES, WIDGET_CSS_API } from '$lib/widgets/custom-css';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import './settings/modal-form.css';

	interface Props {
		appearance?: WidgetAppearanceConfig;
		defaults?: Partial<WidgetAppearanceConfig>;
		title?: string;
		hideFields?: WidgetAppearanceField[];
		/** Widget type, used to show the "What can I style?" reference. */
		widgetType?: WidgetType;
	}

	let {
		appearance = $bindable<WidgetAppearanceConfig | undefined>(),
		defaults = {},
		title = 'Appearance',
		hideFields = [],
		widgetType
	}: Props = $props();

	const borderStyleOptions: { value: WidgetBorderStyle; label: string }[] = [
		{ value: 'solid', label: 'Solid' },
		{ value: 'dashed', label: 'Dashed' },
		{ value: 'dotted', label: 'Dotted' },
		{ value: 'double', label: 'Double' },
		{ value: 'none', label: 'None' }
	];

	const resolvedAppearance = $derived({
		...DEFAULT_WIDGET_APPEARANCE,
		...defaults,
		...appearance
	});

	const customCssApi = $derived(widgetType ? WIDGET_CSS_API[widgetType] : null);

	function updateAppearance(nextValue: Partial<WidgetAppearanceConfig>) {
		appearance = {
			...appearance,
			...nextValue
		};
	}
</script>

<SettingSection {title}>
	<SettingRow label="Enable Custom CSS" labelFor="widget-custom-css-enabled">
		<label class="checkbox-label">
			<input
				id="widget-custom-css-enabled"
				type="checkbox"
				checked={resolvedAppearance.customCssEnabled}
				onchange={(event) => updateAppearance({ customCssEnabled: event.currentTarget.checked })}
			/>
			<span>Override the look with my own CSS</span>
		</label>
	</SettingRow>

	{#if resolvedAppearance.customCssEnabled}
		<SettingRow label="Custom CSS" labelFor="widget-custom-css">
			<textarea
				id="widget-custom-css"
				class="css-input"
				value={resolvedAppearance.customCss}
				oninput={(event) => updateAppearance({ customCss: event.currentTarget.value })}
				placeholder={'.clock-widget { background: ...; }'}
				spellcheck="false"
			></textarea>
		</SettingRow>

		{#if customCssApi}
			<details class="css-ref">
				<summary>What can I style?</summary>
				<p>Your CSS is scoped to this widget only — override any property on these classes:</p>
				<div class="css-ref-classes">
					{#each customCssApi.classes as cssClass}
						<code>{cssClass}</code>
					{/each}
				</div>
				<p>Shared variables, set on the widget root:</p>
				<div class="css-ref-classes">
					{#each SHARED_APPEARANCE_VARIABLES as variable}
						<code>{variable}</code>
					{/each}
				</div>
				{#if customCssApi.note}
					<p class="css-ref-note">{customCssApi.note}</p>
				{/if}
				<pre>{customCssApi.example}</pre>
			</details>
		{/if}
	{/if}

	<div class="appearance-fields" class:disabled={resolvedAppearance.customCssEnabled}>
		{#if resolvedAppearance.customCssEnabled}
			<p class="css-disabled-hint">
				Custom CSS overrides these settings. Turn off "Enable Custom CSS" to edit them.
			</p>
		{/if}

		{#if !hideFields.includes('backgroundColor')}
			<SettingRow label="Background Color" labelFor="widget-background-color">
			<div class="color-control">
				<input
					id="widget-background-color"
					type="color"
					value={colorToHexInputValue(resolvedAppearance.backgroundColor, '#000000')}
					oninput={(event) => updateAppearance({ backgroundColor: event.currentTarget.value })}
				/>
				<input
					type="text"
					value={resolvedAppearance.backgroundColor}
					placeholder="#000000"
					oninput={(event) => updateAppearance({ backgroundColor: event.currentTarget.value })}
				/>
			</div>
		</SettingRow>
	{/if}

	{#if !hideFields.includes('backgroundOpacity')}
		<SettingRow
			label="Background Opacity: {Math.round(resolvedAppearance.backgroundOpacity * 100)}%"
			labelFor="widget-background-opacity"
		>
			<input
				id="widget-background-opacity"
				class="range-input"
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={resolvedAppearance.backgroundOpacity}
				oninput={(event) =>
					updateAppearance({ backgroundOpacity: Number(event.currentTarget.value) })}
			/>
		</SettingRow>
	{/if}

	{#if !hideFields.includes('textColor')}
		<SettingRow label="Text Color" labelFor="widget-text-color">
			<div class="color-control">
				<input
					id="widget-text-color"
					type="color"
					value={colorToHexInputValue(resolvedAppearance.textColor, '#ffffff')}
					oninput={(event) => updateAppearance({ textColor: event.currentTarget.value })}
				/>
				<input
					type="text"
					value={resolvedAppearance.textColor}
					placeholder="#ffffff"
					oninput={(event) => updateAppearance({ textColor: event.currentTarget.value })}
				/>
			</div>
		</SettingRow>
	{/if}

	<div class="field-grid">
		{#if !hideFields.includes('borderWidth')}
			<SettingRow
				label="Border Width: {resolvedAppearance.borderWidth}px"
				labelFor="widget-border-width"
			>
				<input
					id="widget-border-width"
					class="range-input"
					type="range"
					min="0"
					max="10"
					step="1"
					value={resolvedAppearance.borderWidth}
					oninput={(event) => updateAppearance({ borderWidth: Number(event.currentTarget.value) })}
				/>
			</SettingRow>
		{/if}

		{#if !hideFields.includes('borderRadius')}
			<SettingRow
				label="Corner Radius: {resolvedAppearance.borderRadius}px"
				labelFor="widget-border-radius"
			>
				<input
					id="widget-border-radius"
					class="range-input"
					type="range"
					min="0"
					max="50"
					step="1"
					value={resolvedAppearance.borderRadius}
					oninput={(event) => updateAppearance({ borderRadius: Number(event.currentTarget.value) })}
				/>
			</SettingRow>
		{/if}
	</div>

	{#if !hideFields.includes('borderColor')}
		<SettingRow label="Border Color" labelFor="widget-border-color">
			<div class="color-control">
				<input
					id="widget-border-color"
					type="color"
					value={colorToHexInputValue(resolvedAppearance.borderColor, '#ffffff')}
					oninput={(event) => updateAppearance({ borderColor: event.currentTarget.value })}
				/>
				<input
					type="text"
					value={resolvedAppearance.borderColor}
					placeholder="rgba(255, 255, 255, 0.2)"
					oninput={(event) => updateAppearance({ borderColor: event.currentTarget.value })}
				/>
			</div>
		</SettingRow>
	{/if}

	{#if !hideFields.includes('borderStyle')}
		<SettingRow label="Border Style" labelFor="widget-border-style">
			<select
				id="widget-border-style"
				class="select-input"
				value={resolvedAppearance.borderStyle}
				onchange={(event) =>
					updateAppearance({ borderStyle: event.currentTarget.value as WidgetBorderStyle })}
			>
				{#each borderStyleOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</SettingRow>
	{/if}

	<div class="field-grid">
		{#if !hideFields.includes('padding')}
			<SettingRow label="Padding: {resolvedAppearance.padding}px" labelFor="widget-padding">
				<input
					id="widget-padding"
					class="range-input"
					type="range"
					min="0"
					max="40"
					step="1"
					value={resolvedAppearance.padding}
					oninput={(event) => updateAppearance({ padding: Number(event.currentTarget.value) })}
				/>
			</SettingRow>
		{/if}

		{#if !hideFields.includes('opacity')}
			<SettingRow
				label="Widget Opacity: {Math.round(resolvedAppearance.opacity * 100)}%"
				labelFor="widget-opacity"
			>
				<input
					id="widget-opacity"
					class="range-input"
					type="range"
					min="0.1"
					max="1"
					step="0.05"
					value={resolvedAppearance.opacity}
					oninput={(event) => updateAppearance({ opacity: Number(event.currentTarget.value) })}
				/>
			</SettingRow>
		{/if}
		</div>
	</div>
</SettingSection>
