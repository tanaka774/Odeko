<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';
</script>

<!--
	Canvas toast stack. Rendered inside the canvas window, above the icon grid,
	so a failed launch is visible even though the window has no chrome.
-->
{#if toastStore.toasts.length > 0}
	<div
		class="pointer-events-none absolute inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4"
		data-testid="toast-stack"
	>
		{#each toastStore.toasts as toast (toast.id)}
			<div
				role="alert"
				data-testid="toast"
				class="pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--popover)] px-4 py-3 text-sm text-[var(--popover-foreground)] shadow-lg backdrop-blur-sm"
			>
				<span class="mt-0.5 shrink-0 text-[var(--destructive)]" aria-hidden="true">●</span>
				<div class="min-w-0 flex-1">
					<p class="font-medium break-words">{toast.message}</p>
					{#if toast.detail}
						<p class="mt-1 text-xs break-all text-[var(--muted-foreground)]">{toast.detail}</p>
					{/if}
				</div>
				<button
					type="button"
					class="shrink-0 rounded px-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--popover-foreground)]"
					aria-label="Dismiss"
					onclick={() => toastStore.dismiss(toast.id)}
				>
					×
				</button>
			</div>
		{/each}
	</div>
{/if}
