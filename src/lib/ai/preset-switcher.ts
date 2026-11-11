type Switcher = (name: string) => Promise<void>;

let switcher: Switcher | null = null;

/** App.svelte registers its animated preset switch. */
export function setPresetSwitcher(next: Switcher | null): void {
	switcher = next;
}

export function presetSwitcher(): Switcher | null {
	return switcher;
}
