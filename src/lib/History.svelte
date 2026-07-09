<script lang="ts">
  // History list + details. Spec 2.3
  // Newest first. View full, duplicate as template, delete.
  // Simple inline details. Keep simple.
  import { onMount } from 'svelte';
  import * as db from './db/client';
  import type { Workout, WorkoutDetail } from './db/types';
  import { settings } from './settings';

  let workouts = $state<Workout[]>([]);
  let details = $state<Record<number, WorkoutDetail | null>>({});
  let loading = $state(false);

  async function load() {
    loading = true;
    workouts = await db.getWorkouts();
    loading = false;
  }

  onMount(load);

  async function toggleDetail(w: Workout) {
    if (details[w.id]) {
      details[w.id] = null;
      details = { ...details };
      return;
    }
    const d = await db.getWorkoutDetail(w.id);
    details[w.id] = d;
    details = { ...details };
  }

  async function doDuplicate(w: Workout) {
    await db.duplicateWorkout(w.id);
    await load();
    alert('Duplicated to top of history.');
  }

  async function doDelete(w: Workout) {
    if (!confirm('Delete workout?')) return;
    await db.deleteWorkout(w.id);
    delete details[w.id];
    await load();
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString() + ' ' + new Date(d).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }
</script>

<div class="hist">
  <h2>History</h2>
  <button class="btn" onclick={load}>Refresh</button>

  {#if loading}<p>loading...</p>{/if}

  <div class="list">
    {#each workouts as w (w.id)}
      <div class="wcard">
        <div class="whead" role="button" tabindex="0" onclick={() => toggleDetail(w)}>
          <div>
            <strong>{w.name || 'Workout'}</strong>
            <div class="date">{fmtDate(w.date)}</div>
          </div>
          {#if $settings.showDuplicateButton || $settings.showDeleteButton}
          <div class="wactions">
            {#if $settings.showDuplicateButton}
              <button class="btn" onclick={(e) => { e.stopPropagation(); doDuplicate(w); }}>dup</button>
            {/if}
            {#if $settings.showDeleteButton}
              <button class="btn danger" onclick={(e) => { e.stopPropagation(); doDelete(w); }}>del</button>
            {/if}
          </div>
          {/if}
        </div>

        {#if details[w.id]}
          <div class="detail">
            {#if w.notes}<p class="notes">{w.notes}</p>{/if}
            {#each details[w.id]!.exercises as ex}
              {@const completedCount = ex.sets.filter((s: any) => !!s.completed).length}
              <div class="ex">
                <div>
                  <strong>{ex.name}</strong> 
                  ({completedCount}/{ex.sets.length} sets 
                  {completedCount === ex.sets.length ? '✓ completed' : '— not fully done'})
                </div>
                {#each ex.sets as s}
                  <div class="srow" class:done={!!s.completed}>
                    {s.completed ? '✓ ' : '○ '}
                    {s.weight_kg ?? '-'}kg × {s.reps ?? '-'} 
                    {s.rpe ? `RPE${s.rpe}` : ''} {s.notes ? s.notes : ''}
                    <span class="v">{(s.weight_kg && s.reps) ? Math.round(s.weight_kg*s.reps) : ''}</span>
                  </div>
                {/each}
              </div>
            {/each}
            {#if details[w.id]!.exercises.length === 0}<em>empty</em>{/if}
          </div>
        {/if}
      </div>
    {/each}
    {#if workouts.length === 0 && !loading} <p>No workouts yet.</p> {/if}
  </div>
</div>

<style>
  /* Scoped component styles */
  .hist { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: none; }
  .list { width: 100%; max-width: none; }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .wcard { border: 1px solid var(--border); border-radius: 6px; width: 100%; box-sizing: border-box; min-width: 0; }
  .whead { display: flex; justify-content: space-between; padding: 10px; cursor: pointer; width: 100%; }
  .whead > div:first-child { flex: 1; min-width: 0; } /* allow text area to grow, pushing buttons right */
  .date { font-size: 12px; opacity: 0.7; }
  .wactions { display: flex; gap: 4px; margin-left: 12px; }
  .detail { padding: 0 10px 10px; border-top: 1px solid var(--border); font-size: 14px; }
  .ex { margin: 8px 0; }
  .srow { padding-left: 12px; font-size: 13px; display: flex; gap: 6px; }
  .srow.done { opacity: 0.6; }
  .v { margin-left: auto; font-size: 12px; opacity: .7; }
  .notes { font-style: italic; opacity: .8; }
</style>
