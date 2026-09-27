<script lang="ts">
	import {
		type WidgetAppearanceConfig,
		type WidgetBorderStyle,
		type WidgetAppearanceField
	} from '$lib/widgets/types';
	import { colorToHexInputValue, getWidgetAppearance } from '$lib/widgets/appearance';
	import { applyAppearanceToAllItems } from '$lib/bulk-appearance';
	import {
		SHARED_APPEARANCE_VARIABLES,
		WIDGET_CSS_API,
		type CssApiItemType
	} from '$lib/widgets/custom-css';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import './settings/modal-form.css';

	interface Props {
		appearance?: WidgetAppearanceConfig;
		defaults?: Partial<WidgetAppearanceConfig>;
		title?: string;
		hideFields?: WidgetAppearanceField[];
		/** Item type, used to show the "What can I style?" reference. */
		widgetType?: CssApiItemType;
		/** Label for the overall opacity field (widgets vs. canvas icons). */
		opacityLabel?: string;
		/** Hide the per-icon custom CSS controls. */
		hideCustomCss?: boolean;
		/** Show the bulk "Apply to all" button. */
		applyToAll?: boolean;
	}

	let {
		appearance = $bindable<WidgetAppearanceConfig | undefined>(),
		defaults = {},
		title = 'Appearance',
		hideFields = [],
		widgetType,
		opacityLabel = 'Widget Opacity',
		hideCustomCss = false,
		// Off by default: bulk apply is a global action, shown only in the
		// canvas settings' "Icon Appearance" tab.
		applyToAll = false
	}: Props = $props();

	const borderStyleOptions: { value: WidgetBorderStyle; label: string }[] = [
		{ value: 'solid', label: 'Solid' },
		{ value: 'dashed', label: 'Dashed' },
		{ value: 'dotted', label: 'Dotted' },
		{ value: 'double', label: 'Double' },
		{ value: 'none', label: 'None' }
	];

	// Same resolution as rendering (getWidgetAppearance), so the editor
	// previews exactly what shows.
	const resolvedAppearance = $derived(getWidgetAppearance({ appearance }, defaults));

	const customCssApi = $derived(widgetType ? WIDGET_CSS_API[widgetType] : null);

	// Width and color only matter when a border style is actually applied.
	const showBorderDetails = $derived(resolvedAppearance.borderStyle !== 'none');

	function updateAppearance(nextValue: Partial<WidgetAppearanceConfig>) {
		appearance = {
			...appearance,
			...nextValue
		};
	}

	// Bulk mode only: the checked properties form the patch the "apply to all"
	// button pushes, so unchecked ones keep each icon's own value.
	let bulkFields = $state<Set<WidgetAppearanceField>>(new Set());

	function toggleBulkField(field: WidgetAppearanceField, checked: boolean) {
		const next = new Set(bulkFields);
		if (checked) next.add(field);
		else next.delete(field);
		bulkFields = next;
	}

	function bulkSelect(field: WidgetAppearanceField, name: string) {
		if (!applyToAll) return undefined;
		return {
			checked: bulkFields.has(field),
			label: `Apply ${name} to all icons`,
			onchange: (checked: boolean) => toggleBulkField(field, checked)
		};
	}

	function handleApplyToAll() {
		const resolved = getWidgetAppearance({ appearance }, defaults);
		const patch = Object.fromEntries(
			[...bulkFields].map((field) => [field, resolved[field]])
		) as WidgetAppearanceConfig;
		applyAppearanceToAllItems(patch);
	}

	const applyToAllText = $derived(
		bulkFields.size === 0
			? 'Apply to all'
			: `Apply ${bulkFields.size} ${bulkFields.size === 1 ? 'property' : 'properties'} to all`
	);
</script>

<SettingSection {title}>
	{#if !hideCustomCss}
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
	{/if}

	{#if !hideCustomCss && resolvedAppearance.customCssEnabled}
		<!-- The advanced editor is collapsed by default so the built-in controls
		     stay the primary editing surface. -->
		<details class="advanced-css" open>
			<summary>Advanced: Custom CSS</summary>
			<div class="advanced-css-body">
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
							{#each customCssApi.classes as cssClass (cssClass)}
								<code>{cssClass}</code>
							{/each}
						</div>
						<p>Shared variables, set on the widget root:</p>
						<div class="css-ref-classes">
							{#each SHARED_APPEARANCE_VARIABLES as variable (variable)}
								<code>{variable}</code>
							{/each}
						</div>
						{#if customCssApi.note}
							<p class="css-ref-note">{customCssApi.note}</p>
						{/if}
						<pre>{customCssApi.example}</pre>
					</details>
				{/if}
			</div>
		</details>
	{/if}

	<div class="appearance-fields" class:disabled={resolvedAppearance.customCssEnabled}>
		{#if resolvedAppearance.customCssEnabled}
			<p class="css-disabled-hint">
				Custom CSS overrides these settings. Turn off "Enable Custom CSS" to edit them.
			</p>
		{/if}

		<!-- Fields are grouped by what they affect (fill → text → border →
		     shape → overall) rather than one flat stack. -->
		{#if !hideFields.includes('backgroundColor') || !hideFields.includes('backgroundOpacity')}
			<div class="appearance-group">
				<p class="appearance-group-label">Fill</p>

				{#if !hideFields.includes('backgroundColor')}
					<SettingRow
						label="Background Color"
						labelFor="widget-background-color"
						select={bulkSelect('backgroundColor', 'Background Color')}
					>
						<div class="color-control">
							<input
								id="widget-background-color"
								type="color"
								value={colorToHexInputValue(resolvedAppearance.backgroundColor, '#000000')}
								oninput={(event) =>
									updateAppearance({ backgroundColor: event.currentTarget.value })}
							/>
							<input
								type="text"
								value={resolvedAppearance.backgroundColor}
								placeholder="#000000"
								oninput={(event) =>
									updateAppearance({ backgroundColor: event.currentTarget.value })}
							/>
						</div>
					</SettingRow>
				{/if}

				{#if !hideFields.includes('backgroundOpacity')}
					<SettingRow
						label="Background Opacity: {Math.round(resolvedAppearance.backgroundOpacity * 100)}%"
						labelFor="widget-background-opacity"
						select={bulkSelect('backgroundOpacity', 'Background Opacity')}
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
			</div>
		{/if}

		{#if !hideFields.includes('textColor') || !hideFields.includes('fontSize') || !hideFields.includes('fontFamily')}
			<div class="appearance-group">
				<p class="appearance-group-label">Text</p>

				{#if !hideFields.includes('fontSize')}
					<SettingRow
						label="Font Size: {resolvedAppearance.fontSize}px"
						labelFor="widget-font-size"
						select={bulkSelect('fontSize', 'Font Size')}
					>
						<input
							id="widget-font-size"
							class="range-input"
							type="range"
							min="6"
							max="96"
							step="1"
							value={resolvedAppearance.fontSize}
							oninput={(event) => updateAppearance({ fontSize: Number(event.currentTarget.value) })}
						/>
					</SettingRow>
				{/if}

				{#if !hideFields.includes('fontFamily')}
					<SettingRow
						label="Font Family"
						labelFor="widget-font-family"
						select={bulkSelect('fontFamily', 'Font Family')}
					>
						<input
							id="widget-font-family"
							class="text-input"
							type="text"
							value={resolvedAppearance.fontFamily}
							placeholder="e.g., Georgia, serif"
							oninput={(event) => updateAppearance({ fontFamily: event.currentTarget.value })}
						/>
					</SettingRow>
				{/if}

				{#if !hideFields.includes('textColor')}
					<SettingRow
						label="Text Color"
						labelFor="widget-text-color"
						select={bulkSelect('textColor', 'Text Color')}
					>
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
			</div>
		{/if}

		{#if !hideFields.includes('borderStyle') || !hideFields.includes('borderWidth') || !hideFields.includes('borderColor')}
			<div class="appearance-group">
				<p class="appearance-group-label">Border</p>

				{#if !hideFields.includes('borderStyle')}
					<SettingRow
						label="Border Style"
						labelFor="widget-border-style"
						select={bulkSelect('borderStyle', 'Border Style')}
					>
						<select
							id="widget-border-style"
							class="select-input"
							value={resolvedAppearance.borderStyle}
							onchange={(event) =>
								updateAppearance({
									borderStyle: event.currentTarget.value as WidgetBorderStyle
								})}
						>
							{#each borderStyleOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</SettingRow>
				{/if}

				{#if showBorderDetails}
					{#if !hideFields.includes('borderWidth')}
						<SettingRow
							label="Border Width: {resolvedAppearance.borderWidth}px"
							labelFor="widget-border-width"
							select={bulkSelect('borderWidth', 'Border Width')}
						>
							<input
								id="widget-border-width"
								class="range-input"
								type="range"
								min="0"
								max="10"
								step="1"
								value={resolvedAppearance.borderWidth}
								oninput={(event) =>
									updateAppearance({ borderWidth: Number(event.currentTarget.value) })}
							/>
						</SettingRow>
					{/if}

					{#if !hideFields.includes('borderColor')}
						<SettingRow
							label="Border Color"
							labelFor="widget-border-color"
							select={bulkSelect('borderColor', 'Border Color')}
						>
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
				{/if}
			</div>
		{/if}

		{#if !hideFields.includes('borderRadius') || !hideFields.includes('padding')}
			<div class="appearance-group">
				<p class="appearance-group-label">Shape &amp; Spacing</p>

				{#if !hideFields.includes('borderRadius')}
					<SettingRow
						label="Corner Radius: {resolvedAppearance.borderRadius}px"
						labelFor="widget-border-radius"
						select={bulkSelect('borderRadius', 'Corner Radius')}
					>
						<input
							id="widget-border-radius"
							class="range-input"
							type="range"
							min="0"
							max="50"
							step="1"
							value={resolvedAppearance.borderRadius}
							oninput={(event) =>
								updateAppearance({ borderRadius: Number(event.currentTarget.value) })}
						/>
					</SettingRow>
				{/if}

				{#if !hideFields.includes('padding')}
					<SettingRow
						label="Padding: {resolvedAppearance.padding}px"
						labelFor="widget-padding"
						select={bulkSelect('padding', 'Padding')}
					>
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
			</div>
		{/if}

		{#if !hideFields.includes('opacity')}
			<div class="appearance-group">
				<p class="appearance-group-label">Overall</p>

				<SettingRow
					label="{opacityLabel}: {Math.round(resolvedAppearance.opacity * 100)}%"
					labelFor="widget-opacity"
					select={bulkSelect('opacity', opacityLabel)}
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
			</div>
		{/if}
	</div>

	{#if applyToAll}
		<div class="apply-to-all-row">
			<p class="apply-to-all-hint">
				Checked properties are applied to every icon; unchecked ones keep each icon's own style.
			</p>
			<button
				type="button"
				class="apply-to-all-btn"
				disabled={bulkFields.size === 0}
				onclick={handleApplyToAll}
			>
				{applyToAllText}
			</button>
		</div>
	{/if}
</SettingSection>

<style>
	.apply-to-all-row {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: calc(0.5714 * var(--modal-font-size));
	}

	.apply-to-all-hint {
		margin: 0;
		color: var(--modal-muted, rgba(255, 255, 255, 0.55));
		font-size: calc(0.8571 * var(--modal-font-size));
		text-align: right;
	}

	.apply-to-all-btn {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.85);
		cursor: pointer;
		font-size: 0.8125rem;
		padding: 6px 12px;
		transition:
			background 0.15s ease,
			border-color 0.15s ease;
	}

	.apply-to-all-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.14);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.apply-to-all-btn:disabled {
		cursor: default;
		opacity: 0.45;
	}
</style>
