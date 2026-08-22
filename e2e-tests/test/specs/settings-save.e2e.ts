import { $, expect } from '@wdio/globals';
import { openSettingsModal, setColorInput } from '../helpers';

describe('settings save', () => {
	it('saves a background color change and reflects it on reopen', async () => {
		await (await $('.icon-grid')).waitForExist({ timeout: 15000 });
		await openSettingsModal();

		await setColorInput('#ff8800');

		const saveButton = await $('button=Save Changes');
		await saveButton.click();

		// Reopen the modal: the saved value must be shown again.
		await openSettingsModal();
		const valueAfterSave = await (await $('.color-picker')).getValue();
		expect(valueAfterSave).toBe('#ff8800');
	});
});
