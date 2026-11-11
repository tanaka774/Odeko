<script lang="ts">
	import type { Component } from 'svelte';
	import type { AiChatWidgetConfig } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: AiChatWidgetConfig;
		onSave: (config: AiChatWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config, onSave }: Props = $props();

	let Modal = $state<Component<Props, object, 'isOpen'> | null>(null);

	$effect(() => {
		if (isOpen && !Modal) {
			void import('./AiChatSettingsModal.svelte').then((module) => (Modal = module.default));
		}
	});
</script>

{#if Modal}
	<Modal bind:isOpen {config} {onSave} />
{/if}
