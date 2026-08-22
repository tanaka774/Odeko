import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
const askMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args)
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
	ask: (...args: unknown[]) => askMock(...args)
}));

import { isPowerActionType, executePowerAction } from './power-control';

describe('isPowerActionType', () => {
	it('accepts all power action types', () => {
		expect(isPowerActionType('sleep')).toBe(true);
		expect(isPowerActionType('restart')).toBe(true);
		expect(isPowerActionType('shutdown')).toBe(true);
	});

	it('rejects invalid values', () => {
		expect(isPowerActionType('delete')).toBe(false);
		expect(isPowerActionType('')).toBe(false);
		expect(isPowerActionType(null)).toBe(false);
		expect(isPowerActionType(42)).toBe(false);
		expect(isPowerActionType(undefined)).toBe(false);
	});
});

describe('executePowerAction', () => {
	beforeEach(() => {
		invokeMock.mockReset();
		askMock.mockReset();
		invokeMock.mockResolvedValue({ success: true, message: '' });
		askMock.mockResolvedValue(true);
	});

	it('invokes the correct command for each action', async () => {
		await executePowerAction('sleep', false);
		expect(invokeMock).toHaveBeenCalledWith('execute_sleep');

		await executePowerAction('restart', false);
		expect(invokeMock).toHaveBeenCalledWith('execute_restart');

		await executePowerAction('shutdown', false);
		expect(invokeMock).toHaveBeenCalledWith('execute_shutdown');
	});

	it('asks for confirmation before invoking', async () => {
		await executePowerAction('shutdown');

		expect(askMock).toHaveBeenCalledWith(expect.any(String), {
			title: 'Confirm Shutdown',
			kind: 'warning'
		});
		expect(invokeMock).toHaveBeenCalled();
	});

	it('does not invoke when the user cancels confirmation', async () => {
		askMock.mockResolvedValueOnce(false);

		await executePowerAction('shutdown');

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it('shows an error dialog when the command reports failure', async () => {
		invokeMock.mockResolvedValueOnce({ success: false, message: 'Something failed' });

		await executePowerAction('restart', false);

		expect(askMock).toHaveBeenCalledWith('Something failed', {
			title: 'Error',
			kind: 'error'
		});
	});

	it('shows an error dialog when the command throws', async () => {
		invokeMock.mockRejectedValueOnce(new Error('boom'));

		await executePowerAction('sleep', false);

		expect(askMock).toHaveBeenCalledWith('An unexpected error occurred: Error: boom', {
			title: 'Error',
			kind: 'error'
		});
	});
});
