import { colorWithOpacity } from './appearance';
import type { TextBoxWidgetConfig } from './types';

export function getTextEffectShadow(config: TextBoxWidgetConfig): string {
	const color = colorWithOpacity(config.textEffectColor || '#000000', 1);
	switch (config.textEffect) {
		case 'shadow':
			return `0 2px 4px ${colorWithOpacity(config.textEffectColor || '#000000', 0.7)}`;
		case 'glow':
			return `0 0 6px ${color}, 0 0 14px ${color}`;
		case 'outline':
			return [
				`-1px -1px 0 ${color}`,
				`1px -1px 0 ${color}`,
				`-1px 1px 0 ${color}`,
				`1px 1px 0 ${color}`,
				`0 -1px 0 ${color}`,
				`0 1px 0 ${color}`,
				`-1px 0 0 ${color}`,
				`1px 0 0 ${color}`
			].join(', ');
		default:
			return 'none';
	}
}

export function getVerticalJustify(config: TextBoxWidgetConfig): string {
	if (config.verticalAlign === 'middle') return 'center';
	if (config.verticalAlign === 'bottom') return 'flex-end';
	return 'flex-start';
}
