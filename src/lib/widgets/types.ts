// Widget type definitions

export type WidgetType =
	| 'clock'
	| 'system'
	| 'weather'
	| 'terminal'
	| 'tasklist'
	| 'music'
	| 'textbox'
	| 'memo'
	| 'drawing'
	| 'slideshow'
	| 'sleep'
	| 'restart'
	| 'shutdown'
	| 'clipboard'
	| 'custom';

export type WidgetBorderStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'none';

export type WidgetAppearanceField =
	| 'backgroundColor'
	| 'backgroundOpacity'
	| 'textColor'
	| 'borderColor'
	| 'borderWidth'
	| 'borderStyle'
	| 'borderRadius'
	| 'padding'
	| 'opacity';

export interface WidgetAppearanceConfig {
	backgroundColor?: string;
	backgroundOpacity?: number;
	textColor?: string;
	borderColor?: string;
	borderWidth?: number;
	borderStyle?: WidgetBorderStyle;
	borderRadius?: number;
	padding?: number;
	opacity?: number;
	/** Master switch: when true the built-in appearance controls are ignored
	 *  in favor of the user's customCss. */
	customCssEnabled?: boolean;
	/** User-authored CSS, scoped to this widget instance by the app. */
	customCss?: string;
}

export const DEFAULT_WIDGET_APPEARANCE: Required<WidgetAppearanceConfig> = {
	backgroundColor: 'rgba(0, 0, 0, 0.3)',
	backgroundOpacity: 0.3,
	textColor: '#ffffff',
	borderColor: 'rgba(255, 255, 255, 0.12)',
	borderWidth: 0,
	borderStyle: 'solid',
	borderRadius: 12,
	padding: 12,
	opacity: 1,
	customCssEnabled: false,
	customCss: ''
};

export function createDefaultWidgetAppearance(
	overrides: Partial<WidgetAppearanceConfig> = {}
): WidgetAppearanceConfig {
	return {
		...DEFAULT_WIDGET_APPEARANCE,
		...overrides
	};
}

/**
 * Per-widget-type appearance defaults, merged BELOW each item's own
 * appearance overrides. They define how a widget type looks "out of the box"
 * without freezing that look onto the item's saved config.
 *
 * Widget components merge this table in as their fallback layer, and settings
 * modals pass it as `defaults` so editors preview exactly what renders.
 */
export const WIDGET_TYPE_APPEARANCE_DEFAULTS: Partial<
	Record<WidgetType, Partial<WidgetAppearanceConfig>>
> = {
	weather: {
		backgroundColor: 'rgba(30, 41, 59, 0.82)',
		backgroundOpacity: 0.82,
		padding: 16
	},
	terminal: {
		backgroundColor: 'rgba(30, 30, 30, 0.95)',
		backgroundOpacity: 0.95,
		textColor: '#dcdfe4',
		padding: 0
	},
	tasklist: {
		backgroundColor: 'rgba(30, 30, 40, 0.95)',
		backgroundOpacity: 0.95,
		padding: 0
	},
	textbox: {
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
		backgroundOpacity: 0.5,
		textColor: '#ffffff',
		borderColor: 'rgba(255, 255, 255, 0.2)',
		borderWidth: 1,
		borderStyle: 'solid',
		padding: 12,
		opacity: 1
	},
	memo: {
		backgroundColor: 'rgba(30, 30, 40, 0.95)',
		backgroundOpacity: 0.95,
		textColor: '#ffffff'
	},
	drawing: {
		backgroundColor: '#ffffff',
		backgroundOpacity: 1,
		textColor: '#111111',
		padding: 0
	},
	slideshow: {
		padding: 0
	},
	clipboard: {
		backgroundColor: 'rgba(30, 30, 40, 0.95)',
		backgroundOpacity: 0.95,
		padding: 0
	},
	system: {
		backgroundColor: 'rgba(0, 8, 0, 0.85)',
		backgroundOpacity: 0.85,
		textColor: '#39ff14',
		borderRadius: 0,
		padding: 16
	}
};

// Base widget configuration
export interface WidgetConfig {
	// Common config for all widgets
	refreshInterval?: number; // in milliseconds
	appearance?: WidgetAppearanceConfig;
}

// Clock widget specific config
export interface ClockWidgetConfig extends WidgetConfig {
	displayMode?: 'digital' | 'analog';
	format?: '12h' | '24h';
	showSeconds?: boolean;
	showDate?: boolean;
	timezone?: string; // e.g., 'local', 'UTC', 'America/New_York'
	analogBackgroundColor?: string;
	analogBackgroundOpacity?: number;
	analogNumberColor?: string;
	analogTickColor?: string;
	analogHourHandColor?: string;
	analogMinuteHandColor?: string;
	analogHandColor?: string;
	analogSecondHandColor?: string;
	analogShowNumbers?: boolean;
	analogShowSecondHand?: boolean;
}

// System monitor widget config
export interface SystemWidgetConfig extends WidgetConfig {
	showCpu?: boolean;
	showMemory?: boolean;
	showDisk?: boolean;
	showPercentage?: boolean;
	showActualUsage?: boolean;
	gaugeLowColor?: string;
	gaugeMidColor?: string;
	gaugeHighColor?: string;
	gaugeTrackColor?: string;
}

// Weather widget config
export interface WeatherWidgetConfig extends WidgetConfig {
	location?: string;
	unit?: 'celsius' | 'fahrenheit';
	forecastHours?: number;
}

// Terminal widget config
export interface TerminalWidgetConfig extends WidgetConfig {
	fontSize?: number;
	fontFamily?: string;
	backgroundOpacity?: number;
	theme?: 'dark' | 'light' | 'dracula' | 'solarized-dark' | 'one-dark';
}

// Individual task structure
export interface Task {
	id: string;
	text: string;
	completed: boolean;
	createdAt: number;
	completedAt?: number;
}

// A "tab" in the task list widget: its own list of tasks plus a name and color
export interface TaskGroup {
	id: string;
	name: string;
	color: string;
	tasks: Task[];
}

// Palette used when a new tab is created (kept in sync with the tab's color picker)
export const TASK_GROUP_COLORS = [
	'#4f9cf7', // blue
	'#4ade80', // green
	'#f59e0b', // orange
	'#a78bfa', // purple
	'#f87171', // red
	'#22d3ee' // cyan
] as const;

let taskGroupIdCounter = 0;

export function createTaskGroup(
	name = '',
	color = TASK_GROUP_COLORS[0],
	tasks: Task[] = []
): TaskGroup {
	return {
		id: `group-${Date.now()}-${taskGroupIdCounter++}`,
		name,
		color,
		tasks
	};
}

// Returns the tabs of a task list config. Old configs stored a flat `tasks`
// array; those are migrated into a single "General" tab so nothing is lost.
export function normalizeTaskGroups(config: TaskListWidgetConfig): TaskGroup[] {
	if (config.groups && config.groups.length > 0) {
		return config.groups;
	}
	const legacyTasks = config.tasks ?? [];
	return [createTaskGroup('', TASK_GROUP_COLORS[0], legacyTasks)];
}

// Task list widget config
export interface TaskListWidgetConfig extends WidgetConfig {
	groups?: TaskGroup[];
	activeGroupId?: string;
	tasks?: Task[];
	autoDisappearEnabled?: boolean;
	autoDisappearHours?: number;
}

// Music player widget config
export interface MusicWidgetConfig extends WidgetConfig {
	showAlbumArt?: boolean;
	showProgressBar?: boolean;
	themeColor?: string;
}

// TextBox widget config
export interface TextBoxWidgetConfig extends WidgetConfig {
	content?: string;
	fontSize?: number;
	fontFamily?: string;
	textAlign?: 'left' | 'center' | 'right' | 'justify';
	showBorderTop?: boolean;
	showBorderRight?: boolean;
	showBorderBottom?: boolean;
	showBorderLeft?: boolean;
}

// Memo widget config
export interface MemoWidgetConfig extends WidgetConfig {
	content?: string;
	fontSize?: number;
	fontFamily?: string;
	wordWrap?: boolean;
}

// Drawing widget config
export interface DrawingWidgetConfig extends WidgetConfig {
	penColor?: string;
	brushSize?: number;
	eraserSize?: number;
	canvasBackground?: string;
	canvasState?: string; // serialized Fabric.js JSON
	penOpacity?: number;
}

// Slideshow widget config
export interface SlideshowWidgetConfig extends WidgetConfig {
	images?: string[];
	intervalMs?: number;
	shuffle?: boolean;
	loop?: boolean;
	transitionMs?: number;
}

// Base power control widget config
export interface PowerControlWidgetConfig extends WidgetConfig {
	requireConfirmation?: boolean;
	showLabel?: boolean;
	buttonText?: string;
	iconPath?: string; // Path to custom icon image
	iconType?: 'default' | 'custom';
}

// Sleep widget config
export type SleepWidgetConfig = PowerControlWidgetConfig;

// Restart widget config
export type RestartWidgetConfig = PowerControlWidgetConfig;

// Shutdown widget config
export type ShutdownWidgetConfig = PowerControlWidgetConfig;

// A single item in the clipboard history. Text entries keep the copied text;
// image entries keep a PNG data URL (downscaled so the saved layout stays small).
export interface ClipboardEntry {
	id: string;
	type: 'text' | 'image';
	text?: string;
	image?: string; // PNG data URL
	createdAt: number;
	pinned: boolean;
}

// Clipboard widget config
export interface ClipboardWidgetConfig extends WidgetConfig {
	history?: ClipboardEntry[];
	maxEntries?: number;
	showTimestamps?: boolean;
	captureImages?: boolean;
}

// Custom HTML widget config. The raw HTML lives here; it is sanitized at
// render time (see custom-html.ts), so the user's original text is kept
// intact for editing.
export interface CustomWidgetConfig extends WidgetConfig {
	content?: string;
}
// Union type for all widget configs
export type WidgetConfigType =
	| ClockWidgetConfig
	| SystemWidgetConfig
	| WeatherWidgetConfig
	| TerminalWidgetConfig
	| TaskListWidgetConfig
	| MusicWidgetConfig
	| TextBoxWidgetConfig
	| MemoWidgetConfig
	| DrawingWidgetConfig
	| SlideshowWidgetConfig
	| SleepWidgetConfig
	| RestartWidgetConfig
	| ShutdownWidgetConfig
	| ClipboardWidgetConfig
	| CustomWidgetConfig;

// Common props every widget component accepts. WidgetContainer dispatches
// through a registry and passes these uniformly, so every widget shares one
// interface — the "one widget, variants" contract.
export interface WidgetComponentProps<C extends WidgetConfigType = WidgetConfigType> {
	config?: C;
	/** Stable instance id (from the layout); used to key per-widget network grants. */
	widgetId?: string;
	isEditMode?: boolean;
	borderRadius?: number;
	onConfigChange?: (config: WidgetConfigType) => void;
}

// Widget metadata for UI
export interface WidgetMeta {
	type: WidgetType;
	name: string;
	description: string;
	icon: string;
	defaultWidth: number;
	defaultHeight: number;
	minWidth?: number;
	minHeight?: number;
}

// Registry of available widgets
export const WIDGET_REGISTRY: WidgetMeta[] = [
	{
		type: 'clock',
		name: 'Clock',
		description: 'Digital or analog clock with date display',
		icon: 'clock',
		defaultWidth: 200,
		defaultHeight: 120,
		minWidth: 120,
		minHeight: 80
	},
	{
		type: 'system',
		name: 'System Monitor',
		description: 'Monitor CPU, RAM, and system resources',
		icon: 'cpu',
		defaultWidth: 250,
		defaultHeight: 200,
		minWidth: 200,
		minHeight: 150
	},
	{
		type: 'weather',
		name: 'Weather',
		description: 'Current weather and forecast',
		icon: 'cloud-sun',
		defaultWidth: 220,
		defaultHeight: 180,
		minWidth: 180,
		minHeight: 140
	},
	{
		type: 'terminal',
		name: 'Terminal',
		description: 'Embedded terminal emulator',
		icon: 'terminal',
		defaultWidth: 400,
		defaultHeight: 300,
		minWidth: 300,
		minHeight: 200
	},
	{
		type: 'tasklist',
		name: 'Task List',
		description: 'Simple todo and task manager',
		icon: 'list-checks',
		defaultWidth: 250,
		defaultHeight: 300,
		minWidth: 200,
		minHeight: 200
	},
	{
		type: 'music',
		name: 'Music Player',
		description: 'Music player with controls',
		icon: 'music',
		defaultWidth: 300,
		defaultHeight: 180,
		minWidth: 250,
		minHeight: 150
	},
	{
		type: 'textbox',
		name: 'Text Box',
		description: 'Editable text widget with custom styling',
		icon: 'file-text',
		defaultWidth: 250,
		defaultHeight: 180,
		minWidth: 150,
		minHeight: 100
	},
	{
		type: 'memo',
		name: 'Memo',
		description: 'Simple note-taking widget',
		icon: 'sticky-note',
		defaultWidth: 280,
		defaultHeight: 220,
		minWidth: 180,
		minHeight: 120
	},
	{
		type: 'drawing',
		name: 'Drawing',
		description: 'White canvas for drawing and sketching',
		icon: 'pencil',
		defaultWidth: 400,
		defaultHeight: 350,
		minWidth: 260,
		minHeight: 200
	},
	{
		type: 'slideshow',
		name: 'Slideshow',
		description: 'Auto-cycling image slideshow from local files',
		icon: 'images',
		defaultWidth: 320,
		defaultHeight: 240,
		minWidth: 160,
		minHeight: 120
	},
	{
		type: 'sleep',
		name: 'Sleep Button',
		description: 'Put the system to sleep',
		icon: 'moon',
		defaultWidth: 140,
		defaultHeight: 160,
		minWidth: 120,
		minHeight: 140
	},
	{
		type: 'restart',
		name: 'Restart Button',
		description: 'Restart the system',
		icon: 'rotate-cw',
		defaultWidth: 140,
		defaultHeight: 160,
		minWidth: 120,
		minHeight: 140
	},
	{
		type: 'shutdown',
		name: 'Shutdown Button',
		description: 'Shut down the system',
		icon: 'power',
		defaultWidth: 140,
		defaultHeight: 160,
		minWidth: 120,
		minHeight: 140
	},
	{
		type: 'clipboard',
		name: 'Clipboard',
		description: 'Clipboard history manager',
		icon: 'clipboard',
		defaultWidth: 300,
		defaultHeight: 360,
		minWidth: 220,
		minHeight: 240
	},
	{
		type: 'custom',
		name: 'Custom HTML',
		description: 'Your own HTML, styled with custom CSS',
		icon: 'code',
		defaultWidth: 300,
		defaultHeight: 200,
		minWidth: 120,
		minHeight: 80
	}
];

// Helper to get widget metadata
export function getWidgetMeta(type: WidgetType): WidgetMeta | undefined {
	return WIDGET_REGISTRY.find((w) => w.type === type);
}

// Helper to create default config for a widget type. Appearance stays empty
// (the per-type look comes from WIDGET_TYPE_APPEARANCE_DEFAULTS at render
// time; the current default appearance is stamped on at creation in
// IconGrid). The system monitor is the exception: square CRT corners are
// structural, so they live on the item.
export function createDefaultWidgetConfig(type: WidgetType): WidgetConfigType {
	switch (type) {
		case 'clock':
			return {
				format: '24h',
				showSeconds: true,
				showDate: true,
				timezone: 'local',
				refreshInterval: 1000
			};
		case 'system':
			return {
				showCpu: true,
				showMemory: true,
				showDisk: true,
				refreshInterval: 2000,
				appearance: { borderRadius: 0 }
			};
		case 'weather':
			return {
				location: 'Tokyo',
				unit: 'celsius',
				forecastHours: 3,
				refreshInterval: 30 * 60 * 1000 // 30 minutes
			};
		case 'terminal':
			return {
				fontSize: 14,
				fontFamily: 'Consolas'
			};
		case 'tasklist': {
			const generalTab = createTaskGroup();
			return {
				groups: [generalTab],
				activeGroupId: generalTab.id,
				autoDisappearEnabled: true,
				autoDisappearHours: 24
			};
		}
		case 'music':
			return {
				showAlbumArt: true,
				showProgressBar: true,
				themeColor: '#86efac',
				refreshInterval: 1000
			};
		case 'textbox':
			return {
				content: '',
				fontSize: 16,
				fontFamily: 'system-ui',
				textAlign: 'left',
				showBorderTop: true,
				showBorderRight: true,
				showBorderBottom: true,
				showBorderLeft: true
			};
		case 'memo':
			return {
				content: '',
				fontSize: 14,
				fontFamily: 'system-ui',
				wordWrap: true
			};
		case 'drawing':
			return {
				penColor: '#000000',
				brushSize: 3,
				eraserSize: 20,
				canvasBackground: '#ffffff',
				canvasState: '',
				penOpacity: 1
			};
		case 'slideshow':
			return {
				images: [],
				intervalMs: 5000,
				shuffle: false,
				loop: true,
				transitionMs: 600
			};
		case 'sleep':
			return {
				requireConfirmation: true,
				showLabel: true,
				buttonText: 'Sleep',
				iconType: 'default',
				iconPath: ''
			};
		case 'restart':
			return {
				requireConfirmation: true,
				showLabel: true,
				buttonText: 'Restart',
				iconType: 'default',
				iconPath: ''
			};
		case 'shutdown':
			return {
				requireConfirmation: true,
				showLabel: true,
				buttonText: 'Shutdown',
				iconType: 'default',
				iconPath: ''
			};
		case 'clipboard':
			return {
				history: [],
				maxEntries: 20,
				showTimestamps: true,
				captureImages: true
			};
		case 'custom':
			return {
				content: '<h1>My widget</h1>\n<p>Edit the HTML in the widget settings.</p>'
			};
		default:
			return {};
	}
}
