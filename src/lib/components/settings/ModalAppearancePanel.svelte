<script lang="ts">
	import { colorToHexInputValue } from '$lib/widgets/appearance';
	import {
		overlayModalAppearance,
		MODAL_CSS_CLASSES,
		MODAL_CSS_EXAMPLE,
		type ModalAppearanceConfig
	} from './modal-appearance';
	import SettingSection from './SettingSection.svelte';
	import SettingRow from './SettingRow.svelte';
	import './modal-form.css';

	interface Props {
		appearance?: Partial<ModalAppearanceConfig>;
		/** Call-site defaults (e.g. a wider dialog) shown when a field is unset. */
		base?: Partial<ModalAppearanceConfig>;
		title?: string;
		/** Clears this editor's fields back to the layer below. */
		onReset?: () => void;
	}

	let {
		appearance = $bindable({}),
		base = {},
		title = 'Modal Appearance',
		onReset
	}: Props = $props();

	const resolved = $derived(overlayModalAppearance(base, appearance));

	function update(patch: Partial<ModalAppearanceConfig>) {
		appearance = { ...resolved, ...patch };
	}

	function percent(value: number): string {
		return `${Math.round(value * 100)}%`;
	}

	const colorFields: {
		key: keyof ModalAppearanceConfig;
		label: string;
		fallback: string;
	}[] = [
		{ key: 'overlayColor', label: 'Backdrop Color', fallback: '#000000' },
		{ key: 'surfaceColor', label: 'Background Color', fallback: '#1e1e28' },
		{ key: 'borderColor', label: 'Border Color', fallback: '#ffffff' },
		{ key: 'shadowColor', label: 'Shadow Color', fallback: '#000000' },
		{ key: 'accentColor', label: 'Accent Color', fallback: '#78a0c8' },
		{ key: 'accentTextColor', label: 'Accent Text Color', fallback: '#ffffff' },
		{ key: 'headerBackground', label: 'Header Background', fallback: '#000000' },
		{ key: 'titleColor', label: 'Title Color', fallback: '#ffffff' },
		{ key: 'dividerColor', label: 'Divider Color', fallback: '#ffffff' },
		{ key: 'footerBackground', label: 'Footer Background', fallback: '#000000' },
		{ key: 'textColor', label: 'Text Color', fallback: '#ffffff' },
		{ key: 'mutedColor', label: 'Muted Text Color', fallback: '#ffffff' },
		{ key: 'inputBackground', label: 'Input Background', fallback: '#000000' },
		{ key: 'inputBorderColor', label: 'Input Border Color', fallback: '#ffffff' }
	];

	interface RangeField {
		key: keyof ModalAppearanceConfig;
		label: string;
		min: number;
		max: number;
		step: number;
		unit?: string;
		percent?: boolean;
	}

	interface AppearanceGroup {
		title: string;
		colors: (keyof ModalAppearanceConfig)[];
		ranges: RangeField[];
	}

	const groups: AppearanceGroup[] = [
		{
			title: 'Backdrop',
			colors: ['overlayColor'],
			ranges: [
				{ key: 'overlayOpacity' as const, label: 'Backdrop Opacity', min: 0, max: 1, step: 0.05 },
				{
					key: 'overlayBlur' as const,
					label: 'Backdrop Blur',
					min: 0,
					max: 40,
					step: 1,
					unit: 'px'
				}
			]
		},
		{
			title: 'Surface',
			colors: ['surfaceColor', 'borderColor', 'shadowColor'],
			ranges: [
				{ key: 'surfaceOpacity' as const, label: 'Background Opacity', min: 0, max: 1, step: 0.05 },
				{
					key: 'surfaceBlur' as const,
					label: 'Background Blur',
					min: 0,
					max: 60,
					step: 1,
					unit: 'px'
				},
				{ key: 'borderWidth' as const, label: 'Border Width', min: 0, max: 8, step: 1, unit: 'px' },
				{ key: 'radius' as const, label: 'Corner Radius', min: 0, max: 48, step: 1, unit: 'px' },
				{
					key: 'shadowStrength' as const,
					label: 'Shadow',
					min: 0,
					max: 1,
					step: 0.05,
					percent: true
				}
			]
		},
		{
			title: 'Size',
			colors: [],
			ranges: [
				{ key: 'width' as const, label: 'Width', min: 280, max: 1200, step: 10, unit: 'px' },
				{ key: 'height' as const, label: 'Max Height', min: 240, max: 1400, step: 10, unit: 'px' }
			]
		},
		{
			title: 'Accent',
			colors: ['accentColor', 'accentTextColor'],
			ranges: []
		},
		{
			title: 'Header & Footer',
			colors: ['headerBackground', 'titleColor', 'dividerColor', 'footerBackground'],
			ranges: [
				{ key: 'titleSize' as const, label: 'Title Size', min: 12, max: 40, step: 1, unit: 'px' }
			]
		},
		{
			title: 'Text',
			colors: ['textColor', 'mutedColor'],
			ranges: [
				{ key: 'fontSize' as const, label: 'Text Size', min: 12, max: 22, step: 1, unit: 'px' }
			]
		},
		{
			title: 'Controls',
			colors: ['inputBackground', 'inputBorderColor'],
			ranges: [
				{
					key: 'controlRadius' as const,
					label: 'Control Radius',
					min: 0,
					max: 24,
					step: 1,
					unit: 'px'
				}
			]
		}
	];
</script>

<SettingSection {title}>
	{#if onReset}
		<div class="panel-actions">
			<button type="button" class="panel-btn" onclick={onReset}>Reset this modal</button>
		</div>
	{/if}

	{#each groups as group (group.title)}
		<div class="appearance-group">
			<p class="appearance-group-label">{group.title}</p>

			{#each group.colors as fieldKey (fieldKey)}
				{@const field = colorFields.find((entry) => entry.key === fieldKey)}
				{#if field}
					<SettingRow label={field.label} labelFor="modal-{field.key}">
						<div class="color-control">
							<input
								id="modal-{field.key}"
								type="color"
								value={colorToHexInputValue(resolved[field.key] as string, field.fallback)}
								oninput={(event) =>
									update({
										[field.key]: event.currentTarget.value
									} as Partial<ModalAppearanceConfig>)}
							/>
							<input
								type="text"
								value={resolved[field.key] as string}
								placeholder={field.fallback}
								oninput={(event) =>
									update({
										[field.key]: event.currentTarget.value
									} as Partial<ModalAppearanceConfig>)}
							/>
						</div>
					</SettingRow>
				{/if}
			{/each}

			{#if group.title === 'Text'}
				<SettingRow label="Font Family" labelFor="modal-font-family">
					<input
						id="modal-font-family"
						class="text-input"
						type="text"
						value={resolved.fontFamily}
						placeholder="e.g. Georgia, serif"
						oninput={(event) => update({ fontFamily: event.currentTarget.value })}
					/>
				</SettingRow>
			{/if}

			{#each group.ranges as range (range.key)}
				<SettingRow
					label="{range.label}: {range.percent
						? percent(Number(resolved[range.key]))
						: `${resolved[range.key]}${range.unit ?? ''}`}"
					labelFor="modal-{range.key}"
				>
					<input
						id="modal-{range.key}"
						class="range-input"
						type="range"
						min={range.min}
						max={range.max}
						step={range.step}
						value={resolved[range.key]}
						oninput={(event) =>
							update({
								[range.key]: Number(event.currentTarget.value)
							} as Partial<ModalAppearanceConfig>)}
					/>
				</SettingRow>
			{/each}
		</div>
	{/each}

	<div class="appearance-group">
		<p class="appearance-group-label">Custom CSS</p>

		<SettingRow label="Enable Custom CSS" labelFor="modal-custom-css-enabled">
			<label class="checkbox-label">
				<input
					id="modal-custom-css-enabled"
					type="checkbox"
					checked={resolved.customCssEnabled}
					onchange={(event) => update({ customCssEnabled: event.currentTarget.checked })}
				/>
				<span>Override the look with my own CSS</span>
			</label>
		</SettingRow>

		{#if resolved.customCssEnabled}
			<textarea
				id="modal-custom-css"
				class="css-input"
				value={resolved.customCss}
				oninput={(event) => update({ customCss: event.currentTarget.value })}
				placeholder={MODAL_CSS_EXAMPLE}
				spellcheck="false"
			></textarea>

			<details class="css-ref">
				<summary>What can I style?</summary>
				<p>Your CSS is scoped to this modal only — override any property on these classes:</p>
				<div class="css-ref-classes">
					{#each MODAL_CSS_CLASSES as cssClass (cssClass)}
						<code>{cssClass}</code>
					{/each}
				</div>
				<p>Custom properties set on the modal root:</p>
				<div class="css-ref-classes">
					<code>--modal-accent</code>
					<code>--modal-surface-bg</code>
					<code>--modal-text</code>
					<code>--modal-muted</code>
					<code>--modal-radius</code>
					<code>--modal-font-family</code>
				</div>
				<pre>{MODAL_CSS_EXAMPLE}</pre>
			</details>
		{/if}
	</div>
</SettingSection>

<style>
	.panel-actions {
		display: flex;
		justify-content: flex-end;
	}

	.panel-btn {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		color: var(--modal-text);
		cursor: pointer;
		font-size: calc(0.9286 * var(--modal-font-size));
		padding: calc(0.4286 * var(--modal-font-size)) calc(0.8571 * var(--modal-font-size));
	}

	.panel-btn:hover {
		background: rgba(255, 255, 255, 0.14);
	}
</style>
