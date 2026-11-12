import { invoke } from '@tauri-apps/api/core';
import { aiFetch } from './http';

export interface ChatGptAccount {
	email: string | null;
	plan_enabled: boolean;
}

export const USAGE_URL = 'https://chatgpt.com/settings/usage';

export function signIn(profileId: string): Promise<ChatGptAccount> {
	return invoke<ChatGptAccount>('chatgpt_sign_in', { profileId });
}

export function account(profileId: string): Promise<ChatGptAccount | null> {
	return invoke<ChatGptAccount | null>('chatgpt_account', { profileId });
}

/** True when OpenAI confirmed the session was revoked. */
export function signOut(profileId: string): Promise<boolean> {
	return invoke<boolean>('chatgpt_sign_out', { profileId });
}

export interface PlanModel {
	slug: string;
	display_name: string;
}

/** Models the signed-in ChatGPT account may use, in OpenAI's order. */
export async function listModels(profileId: string): Promise<PlanModel[]> {
	const response = await aiFetch('https://api.openai.com/v1/models', {}, profileId);
	const text = await response.text();
	if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
	const data = JSON.parse(text) as {
		models?: { slug: string; display_name?: string; visibility?: string }[];
	};
	return (data.models ?? [])
		.filter((m) => m.visibility === 'list')
		.map((m) => ({ slug: m.slug, display_name: m.display_name ?? m.slug }));
}
