<script lang="ts">
	import Lazy from './Lazy.svelte';
	import type { AiChatWidgetConfig, WidgetComponentProps } from './types';

	let props: WidgetComponentProps<AiChatWidgetConfig> = $props();
</script>

<Lazy load={() => import('./AiChatWidget.svelte')} {...props} />
