# AI chat: developer notes

How the AI Chat widget is built, and the rules to keep when changing it. User-facing setup is in the README.

## Overview

```
AiChatWidgetLazy ── loads ──▶ AiChatWidget (tabs, input, rendering)
                                  │ one ChatSession per tab
                                  ▼
                            chat.svelte.ts  ── streamText (AI SDK) ──▶ provider.ts ──▶ http.ts
                                  │                                                     │ invoke
                                  │ tools.ts / skills.ts                                ▼
                                  ▼                                              ai_http.rs (Rust)
                     config.ts, layout-bridge.ts, presets.ts, web.ts            adds the key, sends,
                                  │                                             streams the body back
                                  ▼
                       IconGrid (owns icons) + settingsStore
```

## Files

| File                                                     | Role                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/lib/widgets/AiChatWidgetLazy.svelte`, `Lazy.svelte` | Load the chat code on first use, so the main bundle stays small.              |
| `src/lib/widgets/AiChatWidget.svelte`                    | Tabs, message list, input, image attach, permission and revert cards.         |
| `src/lib/widgets/ChatTabBar.svelte`                      | Tab bar, styled like the task list's.                                         |
| `src/lib/ai/chat.svelte.ts`                              | One chat session: system prompt, history, agent loop, permissions, reverts.   |
| `src/lib/ai/tools.ts`                                    | Every tool the model can call.                                                |
| `src/lib/ai/skills.ts`                                   | Skills: instructions plus tools unlocked by `load_skill`.                     |
| `src/lib/ai/config.ts`                                   | The model's view of the config, patch validation, sensitive-change detection. |
| `src/lib/ai/layout-bridge.ts`                            | Reads and writes the live layout through IconGrid; per-change revert.         |
| `src/lib/ai/presets.ts`, `preset-switcher.ts`            | Preset tools; App.svelte registers the animated switch.                       |
| `src/lib/ai/provider.ts`                                 | Builds the AI SDK model per provider kind; provider SDKs load lazily.         |
| `src/lib/ai/http.ts`                                     | `fetch` replacement that runs requests in Rust.                               |
| `src/lib/ai/web.ts`                                      | Search services and page fetching.                                            |
| `src/lib/ai/chatgpt.ts`                                  | Sign in with ChatGPT commands and the plan's model list.                      |
| `src/lib/ai/settings.svelte.ts`                          | Provider profiles and search settings (no keys).                              |
| `src/lib/ai/chat-store.ts`                               | Saves conversations through Rust.                                             |
| `src/lib/ai/docs.ts`                                     | Reference docs for the model, built from `examples/`.                         |
| `src/lib/ai/images.ts`, `screenshot.ts`                  | Image attachments and canvas screenshots.                                     |
| `src-tauri/src/commands/ai_http.rs`                      | Request bridge with key injection and origin binding.                         |
| `src-tauri/src/commands/ai_settings.rs`                  | `ai.json`, `ai-secrets.json`, `ai-chats/`, redaction.                         |
| `src-tauri/src/commands/chatgpt_auth.rs`                 | Sign in with ChatGPT: loopback OAuth, ID token checks, refresh, sign-out.     |
| `src-tauri/src/commands/ai_snapshot.rs`                  | Canvas screenshot on Linux, Windows and macOS.                                |

## A message, step by step

1. `send()` adds the user message (text and images) to the history.
2. `streamText` runs with the base prompt, the trimmed history and the active tools. The base prompt is general-purpose; Odeko only appears as a skill.
3. Each step, `prepareStep` recomputes the prompt and active tools (skills loaded mid-reply take effect on the next step) and injects queued screenshots as user messages, because tool results cannot carry images on every provider.
4. Stream parts update the UI message: text, reasoning, tool calls and results.
5. Afterwards the response messages, with injected screenshots put back in order, become the new history, and the chat is saved. Actions queued with `afterReply` (preset switches) run last.

## Skills

The base prompt lists skills by one-line description. `load_skill` returns the skill's instructions and adds its tools to the active set for the rest of the conversation; the instructions are also added to later system prompts. `odeko-config` asks the user for config access first (once per chat, or always).

To add a skill: add it to `SKILLS` in `skills.ts` with its tool names, write its instructions in `skillInstructions`, and implement the tools in `tools.ts`.

## Config editing

- `buildView` turns the layout into `{ settings, icons }` with icons keyed by id. It hides network permissions, unknown legacy settings, runtime data (`history`, `canvasState`, `chat`) and large `data:` strings (shown as `<<hidden:…>>` markers).
- `applyConfigPatch` applies an RFC 6902 patch to the view, puts hidden values back, validates icons, runs the app's own `normalizeSettings`, and returns the effective changes, values the app adjusted, and sensitive changes.
- Rejections and adjustments are returned to the model as text, so it can fix its own mistakes.
- `applyLayout` writes through IconGrid and returns a revert that applies the inverse diff to the current state, so reverting an older change keeps later ones. A revert only runs on the preset it came from.
- In edit mode, AI settings changes are recorded in the edit session, so Ctrl+Z and Cancel roll them back too.

## Safety rules

Keep these when changing anything here:

1. **Keys never reach the webview.** They live in `ai-secrets.json`; JS only sees which ids have a key. Never add a command that returns a secret.
2. **A key only goes to its own origin.** `ai_http.rs` refuses to send a profile's key anywhere but that profile's base URL origin, and a search key anywhere but its service. Keyed requests do not follow redirects.
3. **Redact.** Error bodies and saved chats are scrubbed of every stored key in Rust, and of key-like strings in JS.
4. **Network permissions are user-only.** `patch_config` rejects any change to `network_grants` and `allow_local_network`.
5. **Sensitive changes ask first:** launch paths and arguments, non-web links, global and app shortcuts, disabling power confirmations, renaming or deleting presets.
6. **Page text is untrusted.** The prompt says so, and `ai_fetch_page` refuses private and local addresses.
7. **Nothing private goes into presets.** Conversations live in `ai-chats/`; export and import strip any old `chat` field.

## Providers

`createModelSetup` returns the model and, for OpenAI, ChatGPT plan, Anthropic and Gemini, the provider's own search tool. SDKs receive a placeholder key; Rust replaces it.

To add a provider kind: add it to `AiProviderKind`, `PROVIDER_LABELS` and optionally `PROVIDER_PRESETS`; build it in `createModelSetup`; add its default origin and auth header to `profile_target` in `ai_http.rs`.

### Sign in with ChatGPT

Follows OpenAI's flow for open-source desktop clients ([docs](https://developers.openai.com/siwc/token-sharing-open-source)):

- A stable host id (`urn:uuid:…`) is kept in `chatgpt-host-id` in the config folder.
- First sign-in uses `client_id=dynamic_agent_client` with `agent_name_hint=Odeko`; the issued `oaiapp_…` client id is saved and reused, with `id_token_hint`/`login_hint` on later sign-ins.
- A loopback listener on `127.0.0.1:<random port>/auth/callback` receives the code; PKCE S256, state and nonce are fresh per attempt.
- The ID token's RS256 signature is checked against OpenAI's JWKS, plus issuer, audience, expiry and nonce.
- Credentials are stored under `chatgpt:<profile id>` in `ai-secrets.json`. `access_token()` refreshes one hour tokens before they expire, serialized because refresh tokens rotate; terminal refresh errors clear the tokens and ask for a new sign-in.
- Requests use the Responses API with `store: false` and `stream: true`; fields the plan route rejects are stripped in `provider.ts`.
- Sign-out revokes the refresh token and keeps the client registration.

## Web search

`web_search` runs the service chosen in settings: DeepSeek (reuses a DeepSeek profile's key), Tavily, Brave, Exa or SearXNG. "Built-in" replaces `web_search` with the provider's own search tool when the chat provider has one. `fetch_page` uses DeepSeek Fetch, Tavily Extract or Exa contents when one of them is selected, otherwise a direct public fetch.

To add a search service: add it to `SearchService`, `SEARCH_LABELS` and, if it uses a key, `SEARCH_KEY_SERVICES`; implement it in `SEARCHERS` in `web.ts`; add its fixed origin and header to `search_target` in `ai_http.rs`.

## Storage

| Path (config folder)                    | Contents                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `ai.json`                               | Provider profiles, default profile, search settings, config-access mode. |
| `ai-secrets.json` (0600)                | API keys, search keys, ChatGPT credentials.                              |
| `ai-chats/<widget id>[--<tab id>].json` | One conversation per tab; the first tab keeps the pre-tab name.          |
| `chatgpt-host-id`                       | Host id for Sign in with ChatGPT.                                        |

The tab list (name, color, active tab) is part of the widget config, like the task list's tabs.

## Screenshots

`screenshot_canvas` crops to `.canvas-panel` and passes the viewport width so Rust can map CSS pixels to device pixels. Linux uses WebKitGTK `snapshot` with cairo; Windows uses WebView2 `CapturePreview`; macOS uses `WKWebView takeSnapshot`, then crops with the `image` crate. Windows and macOS were type-checked but not run.

## Tests

- `src/lib/ai/*.test.ts`: the agent loop with `MockLanguageModelV4` (skills, permissions, patches, reverts, presets, screenshots, search, images), config views and patches, the request bridge, provider request shapes.
- `src/lib/widgets/AiChatWidget.test.ts`: tabs.
- Rust: key origin binding, secret migration and redaction, chat file names, PKCE, OAuth callback parsing, ID token claims, preset export stripping.
