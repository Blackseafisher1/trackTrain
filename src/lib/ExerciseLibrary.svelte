<script lang="ts">
  // Exercise library per spec 2.1
  // Search + filter by muscle group.
  // List ~70 seeded + customs. Add / edit / delete customs.
  // Keep simple. All actions immediate to OPFS db.
  import { onMount } from 'svelte';
  import * as db from './db/client';
  import type { Exercise } from './db/types';

  let exercises = $state<Exercise[]>([]);
  let search = $state('');
  let filter = $state('');
  let loading = $state(false);

  // add form state
  let showAdd = $state(false);
  let newName = $state('');
  let newGroups = $state('chest');
  let newDesc = $state('');

  const muscleOptions = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'triceps', 'biceps', 'glutes', 'hamstrings', 'quads', 'calves'];

  async function load() {
    loading = true;
    exercises = await db.getExercises(search, filter);
    loading = false;
  }

  onMount(load);

  // reactive on changes - manual reload via events is primary, effect for safety
  $effect(() => {
    // touch search + filter to rerun
    void search; void filter; load();
  });

  async function addCustom() {
    if (!newName.trim()) return;
    const groups = newGroups.split(',').map(s => s.trim()).filter(Boolean);
    await db.addCustomExercise(newName.trim(), groups, newDesc.trim());
    newName = ''; newGroups = 'chest'; newDesc = ''; showAdd = false;
    await load();
  }

  async function del(ex: Exercise) {
    if (!confirm('Delete custom exercise?')) return;
    await db.deleteExercise(ex.id);
    await load();
  }

  async function edit(ex: Exercise) {
    const name = prompt('Name', ex.name);
    if (!name) return;
    const mgStr = prompt('Muscle groups (comma)', JSON.parse(ex.muscle_groups || '[]').join(','));
    if (!mgStr) return;
    const groups = mgStr.split(',').map((s:string)=>s.trim()).filter(Boolean);
    const desc = prompt('Desc (optional)', ex.description || '') || '';
    await db.updateExercise(ex.id, name.trim(), groups, desc);
    await load();
  }

  function toggleAdd() {
    showAdd = !showAdd;
  }
</script>

<div class="lib">
  <div class="head">
    <h2>Exercise Library</h2>
    <button class="btn primary" onclick={toggleAdd}>{showAdd ? 'Cancel' : '+ Add Custom'}</button>
  </div>

  <div class="controls">
    <input class="input" placeholder="Search name..." bind:value={search} oninput={load} />
    <select class="input" bind:value={filter} onchange={load}>
      <option value="">All muscles</option>
      {#each muscleOptions as m}
        <option value={m}>{m}</option>
      {/each}
    </select>
  </div>

  {#if showAdd}
    <div class="addform">
      <input class="input" placeholder="Exercise name" bind:value={newName} />
      <input class="input" placeholder="muscle1,muscle2" bind:value={newGroups} />
      <input class="input" placeholder="optional desc" bind:value={newDesc} />
      <button class="btn primary" onclick={addCustom}>Save Custom</button>
    </div>
  {/if}

  {#if loading}
    <p>Loading...</p>
  {:else}
    <div class="list">
      {#each exercises as ex (ex.id)}
        <div class="row">
          <div class="info">
            <strong>{ex.name}</strong>
            <span class="tags">{JSON.parse(ex.muscle_groups || '[]').join(', ')}</span>
            {#if ex.is_custom}<span class="custom">custom</span>{/if}
            {#if ex.description}<small>{ex.description}</small>{/if}
          </div>
          {#if ex.is_custom}
            <div class="actions">
              <button class="btn" onclick={() => edit(ex)}>edit</button>
              <button class="btn danger" onclick={() => del(ex)}>del</button>
            </div>
          {/if}
        </div>
      {/each}
      {#if exercises.length === 0}<p class="muted">No matches.</p>{/if}
    </div>
  {/if}
</div>

<style>
  /* Scoped. Follows css_guides: layout + visuals here. Uses global tokens + base .btn .input */
  .lib { display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; }
  .controls .input { flex: 1; min-width: 140px; }

  .addform { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; }
  .addform .input { min-width: 0; }

  .list { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 12px; border-bottom: 1px solid var(--border);
    gap: 8px;
  }
  .row:last-child { border-bottom: none; }
  .info { display: flex; flex-direction: column; gap: 2px; }
  .tags { font-size: 12px; color: var(--text); opacity: 0.8; }
  .custom { font-size: 10px; padding: 1px 4px; background: var(--accent-bg); border-radius: 3px; align-self: start; }
  .actions { display: flex; gap: 6px; }

  .muted { opacity: 0.6; padding: 12px; }

  @media (max-width: 520px) {
    .addform { grid-template-columns: 1fr; }
    .row { flex-direction: column; align-items: start; }
  }
</style>
