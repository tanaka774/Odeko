import { invoke } from '@tauri-apps/api/core';
import { aiFetch } from './http';
import { searchKeyId, type AiProfile, type SearchSettings } from './settings.svelte';

const MAX_PAGE_CHARS = 24000;
const DEEPSEEK = 'https://api.deepseek.com';

export class WebToolError extends Error {}

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	date?: string;
}

export interface SearchContext {
	settings: SearchSettings;
	/** The DeepSeek profile whose key DeepSeek search reuses. */
	deepseekProfile: AiProfile | null;
	hasKey(id: string): boolean;
}

async function postJson<T>(url: string, body: unknown, auth?: string): Promise<T> {
	const response = await aiFetch(
		url,
		{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
		auth
	);
	return readJson<T>(response);
}

async function readJson<T>(response: Response): Promise<T> {
	const text = await response.text();
	if (!response.ok) throw new WebToolError(`HTTP ${response.status}: ${text.slice(0, 300)}`);
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new WebToolError(`Unexpected response: ${text.slice(0, 200)}`);
	}
}

function requireKey(ctx: SearchContext, service: string) {
	if (!ctx.hasKey(searchKeyId(service))) {
		throw new WebToolError(
			`No ${service} API key saved. Add it in the AI Chat settings (Providers tab → Web search).`
		);
	}
}

function deepseekAuth(ctx: SearchContext): string {
	const profile = ctx.deepseekProfile;
	if (!profile)
		throw new WebToolError('Pick a DeepSeek provider profile for web search in the settings.');
	if (!ctx.hasKey(profile.id))
		throw new WebToolError(`The DeepSeek profile "${profile.name}" has no API key.`);
	return profile.id;
}

type Searcher = (ctx: SearchContext, query: string, count: number) => Promise<SearchResult[]>;

const SEARCHERS: Record<Exclude<SearchSettings['service'], 'off' | 'native'>, Searcher> = {
	async deepseek(ctx, query, count) {
		const data = await postJson<{
			results: {
				title: string;
				url: string;
				summary: string;
				snippet: string;
				date: string | null;
			}[];
		}>(`${DEEPSEEK}/v1/tools/search`, { query: query.slice(0, 128), count }, deepseekAuth(ctx));
		return data.results.map((r) => ({
			title: r.title,
			url: r.url,
			snippet: r.summary || r.snippet,
			date: r.date ?? undefined
		}));
	},
	async tavily(ctx, query, count) {
		requireKey(ctx, 'tavily');
		const data = await postJson<{
			results: { title: string; url: string; content: string; published_date?: string }[];
		}>(
			'https://api.tavily.com/search',
			{ query, max_results: count, search_depth: 'basic' },
			searchKeyId('tavily')
		);
		return data.results.map((r) => ({
			title: r.title,
			url: r.url,
			snippet: r.content,
			date: r.published_date
		}));
	},
	async brave(ctx, query, count) {
		requireKey(ctx, 'brave');
		const url = `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({
			q: query,
			count: String(count),
			extra_snippets: 'true'
		})}`;
		const data = await readJson<{
			web?: {
				results: {
					title: string;
					url: string;
					description: string;
					extra_snippets?: string[];
					age?: string;
				}[];
			};
		}>(await aiFetch(url, { headers: { Accept: 'application/json' } }, searchKeyId('brave')));
		return (data.web?.results ?? []).map((r) => ({
			title: r.title,
			url: r.url,
			snippet: [r.description, ...(r.extra_snippets ?? [])].join(' … '),
			date: r.age
		}));
	},
	async exa(ctx, query, count) {
		requireKey(ctx, 'exa');
		const data = await postJson<{
			results: {
				title: string | null;
				url: string;
				highlights?: string[];
				publishedDate?: string;
			}[];
		}>(
			'https://api.exa.ai/search',
			{ query, numResults: count, contents: { highlights: true } },
			searchKeyId('exa')
		);
		return data.results.map((r) => ({
			title: r.title ?? r.url,
			url: r.url,
			snippet: (r.highlights ?? []).join(' … '),
			date: r.publishedDate
		}));
	},
	async searxng(ctx, query, count) {
		const base = ctx.settings.searxngUrl.trim().replace(/\/+$/, '');
		if (!/^https?:\/\//i.test(base)) {
			throw new WebToolError('Set the SearXNG server URL in the AI Chat settings.');
		}
		const url = `${base}/search?${new URLSearchParams({ q: query, format: 'json' })}`;
		const response = await aiFetch(url, { headers: { Accept: 'application/json' } });
		if (response.status === 403) {
			throw new WebToolError(
				'SearXNG refused JSON output: enable "json" under search.formats in its settings.yml.'
			);
		}
		const data = await readJson<{
			results: { title: string; url: string; content?: string; publishedDate?: string }[];
		}>(response);
		return data.results.slice(0, count).map((r) => ({
			title: r.title,
			url: r.url,
			snippet: r.content ?? '',
			date: r.publishedDate
		}));
	}
};

export async function search(
	ctx: SearchContext,
	query: string,
	count = 5
): Promise<SearchResult[]> {
	const service = ctx.settings.service;
	if (service === 'off') {
		throw new WebToolError(
			'Web search is off. The user can pick a search service in the AI Chat settings.'
		);
	}
	if (service === 'native') {
		throw new WebToolError(
			"The model's built-in search is selected, but this provider has none. Pick another search service in the AI Chat settings."
		);
	}
	return SEARCHERS[service](ctx, query, Math.min(10, Math.max(1, count)));
}

export function formatResults(results: SearchResult[]): string {
	if (results.length === 0) return 'No results.';
	return results
		.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}${r.date ? ` (${r.date})` : ''}\n${r.snippet}`)
		.join('\n\n');
}

function clip(text: string): string {
	return text.length > MAX_PAGE_CHARS
		? `${text.slice(0, MAX_PAGE_CHARS)}\n…(cut at ${MAX_PAGE_CHARS} of ${text.length} chars)`
		: text;
}

export function htmlToText(html: string): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	doc
		.querySelectorAll('script, style, noscript, svg, iframe, template, nav')
		.forEach((el) => el.remove());
	const root = doc.querySelector('main, article') ?? doc.body;
	doc.querySelectorAll('a[href]').forEach((a) => {
		const href = a.getAttribute('href') ?? '';
		if (/^https?:/i.test(href) && a.textContent?.trim()) a.append(` (${href})`);
	});
	doc
		.querySelectorAll('br, p, div, li, h1, h2, h3, h4, h5, h6, tr, section, article')
		.forEach((el) => el.append('\n'));
	const title = doc.title ? `${doc.title.trim()}\n\n` : '';
	const text = (root?.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n');
	return `${title}${text.trim()}`;
}

async function directFetch(url: string): Promise<string> {
	const result = await invoke<{ status: number; body: string; content_type: string | null }>(
		'ai_fetch_page',
		{ url }
	);
	if (result.status >= 400) throw new WebToolError(`HTTP ${result.status}`);
	const type = result.content_type ?? '';
	return type.includes('html') || /^\s*</.test(result.body) ? htmlToText(result.body) : result.body;
}

/** Page text through the chosen search service's reader when it has one, else a direct public fetch. */
export async function fetchPage(ctx: SearchContext, url: string): Promise<string> {
	if (!/^https?:\/\//i.test(url)) throw new WebToolError('Only http(s) URLs can be fetched');
	const service = ctx.settings.service;
	try {
		if (service === 'deepseek' && ctx.deepseekProfile && ctx.hasKey(ctx.deepseekProfile.id)) {
			const page = await postJson<{ title: string; content: string }>(
				`${DEEPSEEK}/v1/tools/fetch`,
				{ url },
				ctx.deepseekProfile.id
			);
			if (page.content) return clip(`${page.title ? `${page.title}\n\n` : ''}${page.content}`);
		}
		if (service === 'tavily' && ctx.hasKey(searchKeyId('tavily'))) {
			const data = await postJson<{ results: { raw_content: string }[] }>(
				'https://api.tavily.com/extract',
				{ urls: [url], format: 'markdown' },
				searchKeyId('tavily')
			);
			if (data.results[0]?.raw_content) return clip(data.results[0].raw_content);
		}
		if (service === 'exa' && ctx.hasKey(searchKeyId('exa'))) {
			const data = await postJson<{ results: { title?: string; text?: string }[] }>(
				'https://api.exa.ai/contents',
				{ urls: [url], text: true },
				searchKeyId('exa')
			);
			if (data.results[0]?.text) return clip(data.results[0].text);
		}
	} catch {
		// fall back to fetching the page directly
	}
	return clip(await directFetch(url));
}
