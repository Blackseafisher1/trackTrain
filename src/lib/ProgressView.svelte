<script lang="ts">
  // Progress tracking per spec 2.4
  // Pick exercise -> last sessions table. Max weight, volume, sets. Highlight PRs.
  // Simple SVG line for max weight trend. Keep simple no lib.
  import { onMount } from 'svelte';
  import * as db from './db/client';
  import type { Exercise } from './db/types';

  let exercises = $state<Exercise[]>([]);
  let selectedId = $state(0);
  let history = $state<any[]>([]);
  let stats = $state({ maxWeight: 0, totalVolume: 0, totalSets: 0 });

  onMount(async () => {
    exercises = await db.getExercises('', '');
    if (exercises.length) {
      selectedId = exercises[0].id;
      await loadHistory();
    }
  });

  async function loadHistory() {
    if (!selectedId) return;
    history = await db.getExerciseHistory(selectedId);
    // calc stats
    let mw = 0, tv = 0, ts = 0;
    history.forEach(h => {
      mw = Math.max(mw, h.max_weight || 0);
      tv += h.volume || 0;
      ts += h.sets || 0;
    });
    stats = { maxWeight: mw, totalVolume: Math.round(tv), totalSets: ts };
  }

  $effect(() => {
    if (selectedId) loadHistory();
  });

  function isPR(h: any, idx: number) {
    // naive: if this max_weight is highest so far in list (reverse chrono)
    const maxSoFar = Math.max(...history.slice(0, idx+1).map(x => x.max_weight || 0));
    return h.max_weight === maxSoFar;
  }

  // tiny sparkline
  function sparkPath() {
    if (!history.length) return '';
    const vals = history.map(h => h.max_weight || 0).reverse(); // oldest first
    const w = 240, h = 60;
    const maxv = Math.max(...vals, 1);
    const pts = vals.map((v, i) => {
      const x = (i / Math.max(1, vals.length-1)) * w;
      const y = h - (v / maxv) * (h - 4);
      return `${x},${y}`;
    });
    return pts.join(' ');
  }
</script>

<div class="prog">
  <h2>Progress</h2>

  <select class="input" bind:value={selectedId} onchange={loadHistory}>
    {#each exercises as ex}
      <option value={ex.id}>{ex.name}</option>
    {/each}
  </select>

  <div class="stats">
    <div>Max: <strong>{stats.maxWeight}</strong> kg</div>
    <div>Vol: <strong>{stats.totalVolume}</strong> kg</div>
    <div>Sets: <strong>{stats.totalSets}</strong></div>
  </div>

  {#if history.length}
    <svg class="spark" width="240" height="60" viewBox="0 0 240 60">
      <polyline points={sparkPath()} fill="none" stroke="var(--accent)" stroke-width="2" />
    </svg>
    <small>Max weight trend (old → new)</small>
  {/if}

  <table class="hist-table">
    <thead><tr><th>Date</th><th>Max</th><th>Vol</th><th>Sets</th></tr></thead>
    <tbody>
      {#each history as h, i}
        <tr class:pr={isPR(h, i)}>
          <td>{new Date(h.date).toLocaleDateString()}</td>
          <td>{h.max_weight ?? '-'}</td>
          <td>{Math.round(h.volume || 0)}</td>
          <td>{h.sets}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if history.length === 0}<p>No data.</p>{/if}
</div>

<style>
  /* scoped */
  .prog { display: flex; flex-direction: column; gap: 10px; }
  .stats { display: flex; gap: 16px; font-size: 14px; }
  .spark { border: 1px solid var(--border); background: #fff1; border-radius: 4px; }
  .hist-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .hist-table th, .hist-table td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; }
  .pr { background: var(--accent-bg); font-weight: 500; }
</style>
