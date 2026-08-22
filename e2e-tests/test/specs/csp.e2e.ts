import { $, browser } from '@wdio/globals';

describe('csp effect probe', () => {
	it('checks inline script/style enforcement in parent', async () => {
		await browser.waitUntil(async () => (await browser.getTitle()) === 'Odeko', {
			timeout: 15000
		});
		const result = await browser.execute(() => {
			return new Promise((resolve) => {
				const violations: string[] = [];
				const listener = (e: SecurityPolicyViolationEvent) => {
					violations.push(e.violatedDirective + ' | ' + (e.blockedURI || 'inline'));
				};
				document.addEventListener('securitypolicyviolation', listener);

				const out: Record<string, unknown> = { violations };

				// 1) inline script
				const script = document.createElement('script');
				script.textContent = 'window.__probeScript = true;';
				document.head.appendChild(script);

				// 2) dynamically injected <style>
				const style = document.createElement('style');
				style.textContent = '.probe-target { background-color: rgb(1, 2, 3) !important; }';
				document.head.appendChild(style);
				const target = document.createElement('div');
				target.className = 'probe-target';
				target.style.cssText = 'position:fixed; top:0; left:0; width:10px; height:10px;';
				document.body.appendChild(target);

				setTimeout(() => {
					out.scriptRan = (window as unknown as { __probeScript?: boolean }).__probeScript === true;
					out.inlineStyleAttrApplied = getComputedStyle(target).position === 'fixed';
					out.styleElementApplied = getComputedStyle(target).backgroundColor === 'rgb(1, 2, 3)';
					document.removeEventListener('securitypolicyviolation', listener);
					target.remove();
					style.remove();
					resolve(out);
				}, 400);
			});
		});
		console.log('CSPEFFECT:', JSON.stringify(result));
	});
});
