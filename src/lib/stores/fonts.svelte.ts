import { convertFileSrc, invoke } from '@tauri-apps/api/core';

export interface UserFont {
	family: string;
	path: string;
	weight: number;
	italic: boolean;
}

const GENERIC_FAMILIES = ['system-ui', 'sans-serif', 'serif', 'monospace', 'cursive'];

function createFontStore() {
	let system = $state<string[]>([]);
	let user = $state<UserFont[]>([]);
	let systemLoaded = false;
	const registered = new Map<string, FontFace>();

	function register(fonts: UserFont[]) {
		const keep = new Set(fonts.map((font) => font.path + font.weight + font.italic));
		for (const [key, face] of registered) {
			if (!keep.has(key)) {
				document.fonts.delete(face);
				registered.delete(key);
			}
		}
		for (const font of fonts) {
			const key = font.path + font.weight + font.italic;
			if (registered.has(key)) continue;
			const face = new FontFace(font.family, `url("${convertFileSrc(font.path)}")`, {
				weight: String(font.weight),
				style: font.italic ? 'italic' : 'normal'
			});
			registered.set(key, face);
			document.fonts.add(face);
			face.load().catch(() => {});
		}
	}

	async function loadUser() {
		try {
			user = await invoke<UserFont[]>('list_user_fonts');
			register(user);
		} catch {
			user = [];
		}
	}

	async function loadSystem() {
		if (systemLoaded) return;
		systemLoaded = true;
		try {
			system = await invoke<string[]>('list_system_fonts');
		} catch {
			systemLoaded = false;
		}
	}

	async function importFile(path: string): Promise<string | null> {
		const added = await invoke<UserFont[]>('import_font', { path });
		await loadUser();
		return added[0]?.family ?? null;
	}

	async function remove(family: string) {
		const files = new Set(user.filter((font) => font.family === family).map((font) => font.path));
		for (const path of files) await invoke('remove_font', { path });
		await loadUser();
	}

	return {
		get system() {
			return system;
		},
		get userFamilies() {
			return [...new Set(user.map((font) => font.family))];
		},
		generic: GENERIC_FAMILIES,
		loadUser,
		loadSystem,
		importFile,
		remove
	};
}

export const fontStore = createFontStore();

/** The first family of a CSS font-family list, unquoted. */
export function primaryFamily(value: string): string {
	return (value.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/** A font-family value for `family`, quoted when it needs to be, with a fallback. */
export function fontFamilyValue(family: string): string {
	if (GENERIC_FAMILIES.includes(family)) return family;
	const quoted = /^[A-Za-z][\w-]*$/.test(family) ? family : `'${family.replace(/'/g, '')}'`;
	return `${quoted}, system-ui`;
}
