// Maps every widget type to its component. Adding a widget means adding one
// entry here (the metadata lives in types.ts `WIDGET_REGISTRY`); WidgetContainer
// and the picker both read from these registries instead of hard-coding a
// per-widget branch.
import type { Component } from 'svelte';
import type { WidgetType } from './types';

import ClockWidget from './ClockWidget.svelte';
import SystemWidget from './SystemWidget.svelte';
import WeatherWidget from './WeatherWidget.svelte';
import TerminalWidget from './TerminalWidget.svelte';
import TaskListWidget from './TaskListWidget.svelte';
import MusicPlayerWidget from './MusicPlayerWidget.svelte';
import TextBoxWidget from './TextBoxWidget.svelte';
import MemoWidget from './MemoWidget.svelte';
import DrawingWidget from './DrawingWidget.svelte';
import SlideshowWidget from './SlideshowWidget.svelte';
import SleepWidget from './SleepWidget.svelte';
import RestartWidget from './RestartWidget.svelte';
import ShutdownWidget from './ShutdownWidget.svelte';
import ClipboardWidget from './ClipboardWidget.svelte';
import CustomWidget from './CustomWidget.svelte';

export const WIDGET_COMPONENTS: Record<WidgetType, Component> = {
	clock: ClockWidget,
	system: SystemWidget,
	weather: WeatherWidget,
	terminal: TerminalWidget,
	tasklist: TaskListWidget,
	music: MusicPlayerWidget,
	textbox: TextBoxWidget,
	memo: MemoWidget,
	drawing: DrawingWidget,
	slideshow: SlideshowWidget,
	sleep: SleepWidget,
	restart: RestartWidget,
	shutdown: ShutdownWidget,
	clipboard: ClipboardWidget,
	custom: CustomWidget
};
