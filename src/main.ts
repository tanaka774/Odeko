import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

// The WebdriverIO frontend plugin enables the E2E suite (window state checks,
// mocking, log forwarding). Only loaded when the app is built for E2E
// (VITE_E2E=1), so production builds never include it.
if (import.meta.env.VITE_E2E === '1') {
	void import('@wdio/tauri-plugin');
}

const app = mount(App, {
	target: document.getElementById('app')!
});

export default app;
