<script lang="ts">
  // Main app. Svelte 5 runes.
  // Tabs: Library | Workouts | History | Progress | Settings
  // Workouts: manage templates + start tracking session inline (weights, sets, pauses per exercise).
  // Start button loads the active workout logger UI inside Workouts tab (old flow).
  // Data feeds History/Progress. DB init on mount. Follows full GymTrack spec MVP + css_guides + OPFS.
  // Keep simple. One-handed friendly controls. All data via sqlite OPFS worker.
  // Setting to hide brand text for more vertical space on small screens.
  import { onMount } from 'svelte';
  import * as db from './lib/db/client';
  import ExerciseLibrary from './lib/ExerciseLibrary.svelte';
  import History from './lib/History.svelte';
  import ProgressView from './lib/ProgressView.svelte';
  import Workouts from './lib/Workouts.svelte';
  import Settings from './lib/Settings.svelte';
  import { consumePendingWorkout } from './lib/pendingWorkout';
  import { settings } from './lib/settings';

  let tab = $state<'library' | 'history' | 'progress' | 'workouts' | 'settings'>('workouts');
  let pendingLoadWorkoutId = $state<number | null>(null);
  let ready = $state(false);
  let error = $state<string | null>(null);
  let deferredPrompt: any = $state(null);
  let isStandalone = $state(false);

  onMount(async () => {
    try {
      await db.initDb('/sqlite/');
      ready = true;

      // Listen for workout start from Workouts tab (simple bridge)
      // Starting opens the tracking UI inside the Workouts tab (no separate Log).
      window.addEventListener('gymtrack:start-plan', (e: any) => {
        const id = e.detail?.workoutId;
        if (id) {
          pendingLoadWorkoutId = id;
          tab = 'workouts';
        }
      });

      // PWA install prompt
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
      });

      isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                     (navigator as any).standalone === true;
    } catch (e: any) {
      error = 'DB init failed: ' + (e?.message || e);
      console.error(e);
    }
  });

  function setTab(t: typeof tab) {
    tab = t;
  }

  async function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }

  // When on workouts, consume any pending workout id (from start) to show the logger inline
  $effect(() => {
    if (tab === 'workouts' && !pendingLoadWorkoutId) {
      const p = consumePendingWorkout();
      if (p) pendingLoadWorkoutId = p;
    }
  });
</script>

<header class:no-brand={$settings.hideBrand}>
  {#if !$settings.hideBrand}
  <div class="brand">GymTrack</div>
  {/if}
  <nav>
    <button class:active={tab==='library'} onclick={() => setTab('library')}>Library</button>
    <button class:active={tab==='workouts'} onclick={() => setTab('workouts')}>Workouts</button>
    <button class:active={tab==='history'} onclick={() => setTab('history')}>History</button>
    <button class:active={tab==='progress'} onclick={() => setTab('progress')}>Progress</button>
    <button class:active={tab==='settings'} onclick={() => setTab('settings')}>Settings</button>
  </nav>

  {#if !isStandalone && deferredPrompt}
    <button class="install-btn" onclick={installApp}>Add to Home Screen</button>
  {/if}
</header>

<main>
  {#if !ready}
    <div class="loading">Loading local DB (OPFS)...</div>
  {:else if error}
    <div class="error-box">
      <strong>⚠️ Storage Error (OPFS)</strong>
      <p>{error}</p>
      <p><strong>Fix:</strong> Close any other tabs/windows of GymTrack, then reload.</p>
      <p><strong>Pro tip:</strong> Add this app to your home screen (browser menu → Install / Add to Home Screen). It will then feel like a real native app and avoid multi-tab conflicts.</p>
      {#if !isStandalone && deferredPrompt}
        <button class="btn primary" onclick={installApp} style="margin-top: 8px;">Add to Home Screen now</button>
      {/if}
    </div>
  {:else}
    {#if tab === 'library'}
      <ExerciseLibrary />
    {:else if tab === 'workouts'}
      <Workouts loadWorkoutId={pendingLoadWorkoutId} onLoaded={() => pendingLoadWorkoutId = null} />
    {:else if tab === 'history'}
      <History />
    {:else if tab === 'progress'}
      <ProgressView />
    {:else if tab === 'settings'}
      <Settings />
    {/if}
  {/if}
</main>

<style>
  /* Scoped layout + component styles. Per css_guides: no global layout here except tokens.
     Header + tabs live in this root component. Mobile first simple. */
  :global(body) { margin: 0; background: var(--bg); color: var(--text); }

  header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    padding-top: calc(8px + env(safe-area-inset-top, 0px));
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    gap: 4px;
  }
  header.no-brand {
    padding-top: 4px;
    padding-bottom: 4px;
  }
  header.no-brand nav {
    flex: 1;
    justify-content: center;
  }
  .brand {
    font-weight: 600;
    font-size: 18px;
    color: var(--text-h);
  }
  nav {
    display: flex;
    gap: 4px;
  }
  nav button {
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 14px;
    border-radius: 999px;
    cursor: pointer;
  }
  nav button.active {
    background: var(--accent-bg);
    color: var(--accent);
    font-weight: 500;
  }

  .install-btn {
    font-size: 12px;
    padding: 4px 10px;
    background: var(--accent-bg);
    color: var(--accent);
    border: 1px solid var(--accent-border);
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .install-btn {
      font-size: 11px;
      padding: 4px 8px;
    }
  }

  .error-box .btn {
    font-size: 13px;
    padding: 6px 14px;
  }

  main {
    padding: 12px 4px;
    max-width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  .loading, .error-box {
    padding: 40px 12px;
    text-align: center;
    color: var(--text);
  }
  .error-box {
    border: 2px solid #e11d48;
    background: rgba(225, 29, 72, 0.08);
    border-radius: 8px;
    max-width: 600px;
    margin: 20px auto;
    padding: 20px;
    text-align: left;
  }
  .error-box strong { color: #e11d48; display: block; margin-bottom: 8px; font-size: 1.1em; }
  .error-box p { margin: 8px 0; line-height: 1.4; }

  /* responsive */
  @media (max-width: 640px) {
    header { flex-direction: column; gap: 6px; align-items: stretch; }
    nav { justify-content: space-around; }
    main { padding: 8px; }
  }
</style>
