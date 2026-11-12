/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module 'virtual:odeko-examples' {
	/** Every text file under examples/, keyed by its path inside examples/. */
	const files: Record<string, string>;
	export default files;
}
