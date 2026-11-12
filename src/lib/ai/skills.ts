import { WIDGET_REGISTRY } from '$lib/widgets/types';
import { overview } from './config';
import { layoutBridge } from './layout-bridge';

export interface Skill {
	description: string;
	tools: readonly string[];
}

export const SKILLS: Record<string, Skill> = {
	'odeko-config': {
		description:
			"Change this app's canvas (look, widgets, layout, presets). Only when the user asks to see or change it.",
		tools: [
			'get_config',
			'screenshot_canvas',
			'patch_config',
			'get_docs',
			'list_examples',
			'check_shader',
			'list_presets',
			'switch_preset',
			'save_preset_as',
			'rename_preset',
			'delete_preset'
		]
	}
};

function canvasSize(): string {
	const grid = document.querySelector('.icon-grid');
	if (!grid) return 'unknown (canvas hidden)';
	const rect = grid.getBoundingClientRect();
	return `${Math.round(rect.width)}x${Math.round(rect.height)} px (screen ${window.innerWidth}x${window.innerHeight})`;
}

function configSkill(): string {
	let snapshot: string;
	try {
		snapshot = overview(layoutBridge().read());
	} catch {
		snapshot = '(canvas not loaded)';
	}
	const widgets = WIDGET_REGISTRY.map(
		(meta) => `${meta.type} (${meta.description}, ${meta.defaultWidth}x${meta.defaultHeight})`
	).join('; ');
	return `odeko-config skill loaded. Config tools are now available.

How to work:
- Only act on the canvas when the user asks. In replies about other topics, do not offer or suggest canvas changes.
- Change things with patch_config. Changes apply instantly and the user can revert each one, so act instead of asking for confirmation, then briefly say what you changed.
- Use get_config for exact current values when the overview below is not enough.
- Before writing custom CSS, shaders or HTML, read get_docs (topics: css, shader, html-widget, html-background, settings, widgets). Use only the stable class names listed there.
- Prefer the built-in widget types over building a Custom HTML widget for the same thing.
- If a result says Rejected or reports shader errors, fix it and try again. If the user denied a change, do not retry it.
- Keep text readable: enough contrast between text and backgrounds.
- After a visual change you are unsure about, check it with screenshot_canvas (if you can see images).
- Presets are whole saved canvases. Your config edits apply to the active one. switch_preset happens after your reply, so end your turn after calling it.
- Network permissions are user-only. A widget that needs the network will ask the user to allow the host.

Canvas area: ${canvasSize()}. Icon x/y are px from the canvas top-left; keep items inside it.
Built-in widget types: ${widgets}

Current config overview (icon ids are the keys under /icons):
${snapshot}`;
}

export function skillInstructions(name: string): string {
	if (name === 'odeko-config') return configSkill();
	return '';
}
