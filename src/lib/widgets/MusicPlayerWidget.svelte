<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import {
		colorWithOpacity,
		getAppearanceBackground,
		getAppearanceBorder,
		getWidgetAppearance
	} from './appearance';
	import type { MusicWidgetConfig, WidgetComponentProps } from './types';

	type Props = WidgetComponentProps<MusicWidgetConfig>;

	interface MediaInfo {
		title: string;
		artist: string;
		album: string;
		duration: number;
		position: number;
		is_playing: boolean;
		art_url: string | null;
		has_player: boolean;
		player_name: string;
		player_identity: string;
	}

	interface PlayerInfo {
		name: string;
		identity: string;
		is_playing: boolean;
		last_activity: number;
	}

	let { config = {}, borderRadius = 12 }: Props = $props();

	// Config values
	const showAlbumArt = $derived(config.showAlbumArt ?? true);
	const showProgressBar = $derived(config.showProgressBar ?? true);
	const themeColor = $derived(config.themeColor ?? '#86efac');
	const appearance = $derived(
		getWidgetAppearance(config, {
			backgroundColor: 'rgba(0, 0, 0, 0.3)',
			backgroundOpacity: 0.3,
			borderRadius,
			padding: 16
		})
	);
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));
	const textColor70 = $derived(colorWithOpacity(appearance.textColor, 0.7));
	const textColor60 = $derived(colorWithOpacity(appearance.textColor, 0.6));
	const textColor50 = $derived(colorWithOpacity(appearance.textColor, 0.5));

	// Generate gradient from theme color
	function generateGradient(color: string): string {
		// Convert hex to rgb for creating a slightly darker variant
		const hex = color.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);

		// Create a slightly darker version (80% brightness)
		const darkerR = Math.floor(r * 0.8);
		const darkerG = Math.floor(g * 0.8);
		const darkerB = Math.floor(b * 0.8);

		return `linear-gradient(90deg, ${color}, rgb(${darkerR}, ${darkerG}, ${darkerB}))`;
	}

	// Media state
	let mediaInfo: MediaInfo = $state({
		title: '',
		artist: '',
		album: '',
		duration: 0,
		position: 0,
		is_playing: false,
		art_url: null,
		has_player: false,
		player_name: '',
		player_identity: ''
	});

	let activePlayers: PlayerInfo[] = $state([]);
	let selectedPlayer: string | null = $state(null);
	let userSelectedPlayer: string | null = $state(null);
	let showPlayerDropdown = $state(false);
	let isRefreshing = false;

	// Computed values
	let progress = $derived(
		mediaInfo.duration > 0 ? (mediaInfo.position / mediaInfo.duration) * 100 : 0
	);

	let autoSelectedPlayer = $derived.by(() => {
		// Find the most recently active playing player
		const playingPlayers = activePlayers.filter((p) => p.is_playing);
		if (playingPlayers.length > 0) {
			// Sort by last_activity (most recent first)
			const sorted = [...playingPlayers].sort((a, b) => b.last_activity - a.last_activity);
			return sorted[0]?.identity || null;
		}
		// If no one is playing, return the most recent one
		if (activePlayers.length > 0) {
			const sorted = [...activePlayers].sort((a, b) => b.last_activity - a.last_activity);
			return sorted[0]?.identity || null;
		}
		return null;
	});

	// Poll for media info every second
	$effect(() => {
		const interval = setInterval(async () => {
			await refreshData();
		}, 1000);

		return () => {
			clearInterval(interval);
		};
	});

	onMount(async () => {
		await refreshData();
	});

	async function refreshData() {
		if (isRefreshing) return;

		isRefreshing = true;

		try {
			// Get list of active players
			activePlayers = await invoke('get_active_players');

			if (activePlayers.length === 0) {
				selectedPlayer = null;
				userSelectedPlayer = null;
				mediaInfo = emptyMediaInfo();
				return;
			}

			if (userSelectedPlayer && !activePlayers.some((p) => p.identity === userSelectedPlayer)) {
				userSelectedPlayer = null;
			}

			const preferredPlayer = userSelectedPlayer;
			let info: MediaInfo = await invoke('get_media_info', { preferredPlayer });

			if (!info.has_player && preferredPlayer) {
				userSelectedPlayer = null;
				info = await invoke('get_media_info', { preferredPlayer: null });
			}

			mediaInfo = info;
			selectedPlayer = findPlayerIdentity(info) ?? preferredPlayer ?? autoSelectedPlayer;
		} catch (error) {
			console.error('Failed to refresh media data:', error);
		} finally {
			isRefreshing = false;
		}
	}

	async function selectPlayer(playerIdentity: string) {
		selectedPlayer = playerIdentity;
		userSelectedPlayer = playerIdentity;
		showPlayerDropdown = false;
		await refreshData();
	}

	function emptyMediaInfo(): MediaInfo {
		return {
			title: '',
			artist: '',
			album: '',
			duration: 0,
			position: 0,
			is_playing: false,
			art_url: null,
			has_player: false,
			player_name: '',
			player_identity: ''
		};
	}

	function findPlayerIdentity(info: MediaInfo): string | null {
		if (info.player_identity) {
			return info.player_identity;
		}

		const detectedPlayer = activePlayers.find(
			(player) => player.identity === info.player_name || player.name === info.player_name
		);

		return detectedPlayer?.identity ?? null;
	}

	async function togglePlay() {
		try {
			await invoke('media_play_pause', { playerIdentity: selectedPlayer });
			await refreshData();
		} catch (error) {
			console.error('Failed to toggle play:', error);
		}
	}

	async function nextTrack() {
		try {
			await invoke('media_next', { playerIdentity: selectedPlayer });
			await refreshData();
		} catch (error) {
			console.error('Failed to go to next track:', error);
		}
	}

	async function previousTrack() {
		try {
			await invoke('media_previous', { playerIdentity: selectedPlayer });
			await refreshData();
		} catch (error) {
			console.error('Failed to go to previous track:', error);
		}
	}

	async function setPosition(event: MouseEvent) {
		const target = event.currentTarget as HTMLDivElement;
		const rect = target.getBoundingClientRect();
		const clickX = event.clientX - rect.left;
		const percentage = clickX / rect.width;
		const newPosition = percentage * mediaInfo.duration;

		try {
			await invoke('media_set_position', {
				positionSecs: newPosition,
				playerIdentity: selectedPlayer
			});
			await refreshData();
		} catch (error) {
			console.error('Failed to set position:', error);
		}
	}

	function formatTime(seconds: number): string {
		if (!seconds || isNaN(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
</script>

<div
	class="music-widget"
	style:--appearance-background={widgetBackground}
	style:--appearance-border={widgetBorder}
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-text-color={appearance.textColor}
	style:--widget-text-color-70={textColor70}
	style:--widget-text-color-60={textColor60}
	style:--widget-text-color-50={textColor50}
	style:--appearance-padding="{appearance.padding}px"
	style:--appearance-opacity={appearance.opacity}
>
	<!-- Album Art -->
	{#if showAlbumArt}
		<div
			class="album-art"
			style="background: linear-gradient(135deg, {themeColor}33, {themeColor}1a)"
		>
			{#if mediaInfo.art_url}
				<img src={mediaInfo.art_url} alt="" class="album-image" />
			{:else}
				<div class="placeholder-art" style="color: {themeColor}">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="64"
						height="64"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path d="M9 18V5l12-2v13"></path>
						<circle cx="6" cy="18" r="3"></circle>
						<circle cx="18" cy="16" r="3"></circle>
					</svg>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Song Info -->
	<div class="song-info">
		{#if mediaInfo.has_player}
			<div class="song-title" title={mediaInfo.title || 'Unknown Title'}>
				{mediaInfo.title || 'Unknown Title'}
			</div>
			<div class="song-artist" title={mediaInfo.artist || 'Unknown Artist'}>
				{mediaInfo.artist || 'Unknown Artist'}
			</div>
		{:else}
			<div class="song-title">No Media Player</div>
			<div class="song-artist">Open Spotify, VLC, Firefox, etc.</div>
		{/if}
	</div>

	<!-- Progress Bar -->
	{#if showProgressBar}
		<div class="progress-section">
			<div class="progress-bar" onclick={setPosition}>
				<div
					class="progress-fill"
					style="width: {progress}%; background: {generateGradient(themeColor)}"
				></div>
			</div>
			<div class="time-display">
				<span>{formatTime(mediaInfo.position)}</span>
				<span>{formatTime(mediaInfo.duration)}</span>
			</div>
		</div>
	{/if}

	<!-- Controls -->
	<div class="controls" class:disabled={!mediaInfo.has_player}>
		<div class="main-controls">
			<button
				class="control-btn"
				onclick={previousTrack}
				aria-label="Previous track"
				disabled={!mediaInfo.has_player}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="currentColor"
				>
					<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"></path>
				</svg>
			</button>

			<button
				class="control-btn play-btn"
				onclick={togglePlay}
				aria-label={mediaInfo.is_playing ? 'Pause' : 'Play'}
				disabled={!mediaInfo.has_player}
				style="background: {themeColor}cc"
			>
				{#if mediaInfo.is_playing}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path>
					</svg>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path d="M8 5v14l11-7z"></path>
					</svg>
				{/if}
			</button>

			<button
				class="control-btn"
				onclick={nextTrack}
				aria-label="Next track"
				disabled={!mediaInfo.has_player}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="currentColor"
				>
					<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"></path>
				</svg>
			</button>
		</div>

		<!-- Player Selector Dropdown -->
		{#if activePlayers.length > 0}
			<div class="player-selector">
				<button
					class="player-dropdown-btn"
					onclick={() => (showPlayerDropdown = !showPlayerDropdown)}
					title="Select media source ({activePlayers.length} active)"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="4" y1="6" x2="20" y2="6"></line>
						<line x1="4" y1="12" x2="20" y2="12"></line>
						<line x1="4" y1="18" x2="20" y2="18"></line>
					</svg>
				</button>

				{#if showPlayerDropdown}
					<div class="player-dropdown-menu">
						{#each activePlayers as player}
							<button
								class="player-option"
								class:selected={selectedPlayer === player.identity}
								onclick={() => selectPlayer(player.identity)}
								style={selectedPlayer === player.identity ? `background: ${themeColor}4d;` : ''}
							>
								<span class="option-name">{player.name}</span>
								{#if player.is_playing}
									<span class="option-playing" style="color: {themeColor}">▶ Playing</span>
								{:else}
									<span class="option-paused">⏸ Paused</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.music-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		box-sizing: border-box;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		gap: 12px;
		position: relative;
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		color: var(--appearance-text-color);
		padding: var(--appearance-padding);
		opacity: var(--appearance-opacity);
	}

	/* Player Selector */
	.player-selector {
		position: relative;
		z-index: 10;
		margin-left: auto;
	}

	.player-dropdown-btn {
		width: 36px;
		height: 36px;
		padding: 0;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 50%;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.player-dropdown-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.1);
	}

	.player-dropdown-menu {
		position: absolute;
		bottom: 100%;
		right: 0;
		margin-bottom: 8px;
		min-width: 180px;
		background: rgba(30, 30, 30, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		max-height: 150px;
		overflow-y: auto;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.player-option {
		width: 100%;
		padding: 8px 12px;
		background: transparent;
		border: none;
		color: inherit;
		display: flex;
		align-items: center;
		justify-content: space-between;
		cursor: pointer;
		font-size: 0.8rem;
		text-align: left;
		transition: background 0.2s ease;
	}

	.player-option:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.option-name {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.option-playing {
		font-size: 0.7rem;
		margin-left: 8px;
	}

	.option-paused {
		font-size: 0.7rem;
		color: var(--widget-text-color-50);
		margin-left: 8px;
	}

	.album-art {
		width: 70%;
		min-width: 60px;
		max-width: 100%;
		aspect-ratio: 1;
		flex-shrink: 0;
		border-radius: 8px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.album-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.placeholder-art {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.song-info {
		text-align: center;
		width: 100%;
		overflow: hidden;
	}

	.song-title {
		font-size: 1.1rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-bottom: 4px;
	}

	.song-artist {
		font-size: 0.85rem;
		color: var(--widget-text-color-70);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.progress-section {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.progress-bar {
		width: 100%;
		height: 4px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px;
		cursor: pointer;
		position: relative;
		overflow: hidden;
	}

	.progress-bar:hover {
		height: 6px;
		border-radius: 3px;
	}

	.progress-fill {
		height: 100%;
		border-radius: inherit;
		transition: width 0.3s ease;
	}

	.time-display {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--widget-text-color-60);
		font-variant-numeric: tabular-nums;
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0;
		width: 100%;
		position: relative;
	}

	.main-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		flex: 1;
	}

	.controls.disabled {
		opacity: 0.5;
	}

	.control-btn {
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 8px;
		transition: all 0.2s ease;
	}

	.control-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.1);
	}

	.control-btn:active:not(:disabled) {
		transform: scale(0.95);
	}

	.control-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.play-btn {
		width: 48px;
		height: 48px;
	}
</style>
