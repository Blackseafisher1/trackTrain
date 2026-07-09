<script lang="ts">
  // Main app. Svelte 5 runes.
  // Tabs: Library | Workouts | History | Progress | Settings
  // Workouts: manage templates + start tracking session inline (weights, sets, pauses per exercise).
  // Start button loads the active workout logger UI inside Workouts tab (old flow).
  // Data feeds History/Progress. DB init on mount. Follows full GymTrack spec MVP + css_guides + OPFS.
  // Keep simple. One-handed friendly controls. All data via sqlite OPFS worker.
  import { onMount } from 'svelte';
  import * as db from './lib/db/client';
  import ExerciseLibrary from './lib/ExerciseLibrary.svelte';
  import History from './lib/History.svelte';
  import ProgressView from './lib/ProgressView.svelte';
  import Workouts from './lib/Workouts.svelte';
  import Settings from './lib/Settings.svelte';
  import { consumePendingWorkout } from './lib/pendingWorkout';

  let tab = $state<'library' | 'history' | 'progress' | 'workouts' | 'settings'>('workouts');
  let pendingLoadWorkoutId = $state<number | null>(null);
  let ready = $state(false);
  let error = $state<string | null>(null);

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
    } catch (e: any) {
      error = 'DB init failed: ' + (e?.message || e);
      console.error(e);
    }
  });

  function setTab(t: typeof tab) {
    tab = t;
  }

  // When on workouts, consume any pending workout id (from start) to show the logger inline
  $effect(() => {
    if (tab === 'workouts' && !pendingLoadWorkoutId) {
      const p = consumePendingWorkout();
      if (p) pendingLoadWorkoutId = p;
    }
  });
</script>

<header>
  <div class="brand">GymTrack</div>
  <nav>
    <button class:active={tab==='library'} onclick={() => setTab('library')}>Library</button>
    <button class:active={tab==='workouts'} onclick={() => setTab('workouts')}>Workouts</button>
    <button class:active={tab==='history'} onclick={() => setTab('history')}>History</button>
    <button class:active={tab==='progress'} onclick={() => setTab('progress')}>Progress</button>
    <button class:active={tab==='settings'} onclick={() => setTab('settings')}>Settings</button>
  </nav>
</header>

<main>
  {#if !ready}
    <div class="loading">Loading local DB (OPFS)...</div>
  {:else if error}
    <div class="error">{error}</div>
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
    background: var(--bg);
    border-bottom: 1px solid var(--border);
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

  main {
    padding: 12px 4px;
    max-width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  .loading, .error {
    padding: 40px 12px;
    text-align: center;
    color: var(--text);
  }
  .error { color: #e11d48; }

  /* responsive */
  @media (max-width: 640px) {
    header { flex-direction: column; gap: 6px; align-items: stretch; }
    nav { justify-content: space-around; }
    main { padding: 8px; }
  }
</style>
