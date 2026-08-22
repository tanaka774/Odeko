import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';

export type PowerActionType = 'sleep' | 'restart' | 'shutdown';

const POWER_ACTIONS: Record<
	PowerActionType,
	{ commandName: string; confirmTitle: string; confirmMessage: string }
> = {
	sleep: {
		commandName: 'execute_sleep',
		confirmTitle: 'Confirm Sleep',
		confirmMessage: 'Are you sure you want to put the computer to sleep?'
	},
	restart: {
		commandName: 'execute_restart',
		confirmTitle: 'Confirm Restart',
		confirmMessage: 'Are you sure you want to restart the computer? Unsaved work will be lost.'
	},
	shutdown: {
		commandName: 'execute_shutdown',
		confirmTitle: 'Confirm Shutdown',
		confirmMessage: 'Are you sure you want to shut down the computer? Unsaved work will be lost.'
	}
};

export function isPowerActionType(value: unknown): value is PowerActionType {
	return value === 'sleep' || value === 'restart' || value === 'shutdown';
}

export async function executePowerAction(actionType: PowerActionType, requireConfirmation = true) {
	const action = POWER_ACTIONS[actionType];

	if (requireConfirmation) {
		const confirmed = await ask(action.confirmMessage, {
			title: action.confirmTitle,
			kind: 'warning'
		});
		if (!confirmed) return;
	}

	try {
		const result = await invoke<{ success: boolean; message: string }>(action.commandName);

		if (!result.success) {
			await ask(result.message, {
				title: 'Error',
				kind: 'error'
			});
		}
	} catch (error) {
		console.error(`Failed to execute ${actionType}:`, error);
		await ask(`An unexpected error occurred: ${error}`, {
			title: 'Error',
			kind: 'error'
		});
	}
}
