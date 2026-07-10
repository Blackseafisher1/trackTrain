<script lang="ts">
  // Workouts tab: create 1-day workout templates.
  // Select exercises from library (premade + customs). Toggle group by primary muscle group for easy browsing.
  // For each exercise: #sets + default weight (same across sets for this workout) + default reps.
  // Manual order with ↑↓ . "Start" opens the tracking view (weights, sets, pause time per exercise) inline here.
  // Keep simple + one-handed friendly controls. Follows css_guides (scoped).

  import { onMount } from 'svelte';
  import * as db from './db/client';
  import type { Plan, PlanExercise, Exercise } from './db/types';
  import WorkoutLogger from './WorkoutLogger.svelte';

  // Simple cross-tab trigger (keep simple, no full store)
  import { setPendingWorkout, clearPendingWorkout } from './pendingWorkout';

  // Props to support loading active workout session from parent (for start flow)
  let { loadWorkoutId = $bindable(null), onLoaded = () => {} } = $props();

  let plans = $state<Plan[]>([]);
  let loading = $state(false);

  // Editor state
  let editing = $state(false);
  let editPlanId = $state<number | null>(null);
  let editName = $state('');
  let editNotes = $state('');
  let planExercises = $state<any[]>([]); // {exercise, sets_count, default_weight_kg, default_reps, tempId?}

  let exSearch = $state('');
  let availableEx = $state<Exercise[]>([]);
  let groupByMuscle = $state(false); // toggle to group by primary muscle (optional view helper)

  // Active workout session shown inline when started (replaces separate log tab)
  let activeWorkoutId = $state<number | null>(null);

  // Prevent double-starts (race on rapid clicks before first insert resolves)
  let startingPlanId = $state<number | null>(null);
  const inFlightStarts = new Set<number>(); // logic guard (plain set) independent of reactivity timing

  async function loadPlans() {
    loading = true;
    plans = await db.getPlans();
    loading = false;
  }

  async function loadAvailable(search = '') {
    availableEx = await db.getExercises(search);
  }

  // Group by primary muscle group (first in array) when toggle is on.
  // In the plan itself, order is always manual (add order + up/down).
  function getDisplayExercises() {
    const list = [...availableEx];
    if (!groupByMuscle) return list;

    const groups: Record<string, Exercise[]> = {};
    for (const ex of list) {
      const muscles = JSON.parse(ex.muscle_groups || '[]') as string[];
      const primary = (muscles[0] || 'other').toLowerCase();
      if (!groups[primary]) groups[primary] = [];
      groups[primary].push(ex);
    }
    // return flattened but we'll render grouped in template
    return list; // template will handle grouping
  }

  function getGrouped() {
    const groups: Record<string, Exercise[]> = {};
    for (const ex of availableEx) {
      const muscles = JSON.parse(ex.muscle_groups || '[]') as string[];
      const primary = (muscles[0] || 'other').toLowerCase();
      if (!groups[primary]) groups[primary] = [];
      groups[primary].push(ex);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }

  onMount(() => {
    loadPlans();
    loadAvailable();
  });

  $effect(() => {
    loadAvailable(exSearch);
  });

  // Consume pending load from start button to show logger
  $effect(() => {
    if (loadWorkoutId && !activeWorkoutId) {
      activeWorkoutId = loadWorkoutId;
      loadWorkoutId = null;
      clearPendingWorkout();
      onLoaded();
    }
  });

  function startCreate() {
    editing = true;
    editPlanId = null;
    editName = 'New Workout';
    editNotes = '';
    planExercises = [];
    exSearch = '';
  }

  async function startEdit(p: Plan) {
    const detail = await db.getPlanDetail(p.id);
    if (!detail) return;

    editing = true;
    editPlanId = p.id;
    editName = p.name;
    editNotes = p.notes || '';
    planExercises = detail.exercises.map((pe: any) => ({
      id: pe.id,
      exercise: { id: pe.exercise_id, name: pe.name, muscle_groups: pe.muscle_groups },
      sets_count: pe.sets_count || 3,
      default_weight_kg: pe.default_weight_kg,
      default_reps: pe.default_reps,
    }));
  }

  function addExerciseToPlan(ex: Exercise) {
    // avoid dup
    if (planExercises.some((pe: any) => pe.exercise.id === ex.id)) return;
    planExercises = [
      ...planExercises,
      {
        exercise: ex,
        sets_count: 3,
        default_weight_kg: 20,
        default_reps: 8,
      },
    ];
  }

  function removeFromPlan(idx: number) {
    planExercises = planExercises.filter((_, i) => i !== idx);
  }

  function moveExercise(idx: number, dir: number) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= planExercises.length) return;
    const copy = [...planExercises];
    const [item] = copy.splice(idx, 1);
    copy.splice(newIdx, 0, item);
    planExercises = copy;
  }

  function updatePlanEx(idx: number, field: string, val: any) {
    const copy = [...planExercises];
    (copy[idx] as any)[field] = val;
    planExercises = copy;
  }

  function changeSets(idx: number, delta: number) {
    const cur = planExercises[idx].sets_count || 3;
    updatePlanEx(idx, 'sets_count', Math.max(1, Math.min(12, cur + delta)));
  }

  function changeDefWeight(idx: number, delta: number) {
    const cur = planExercises[idx].default_weight_kg ?? 20;
    updatePlanEx(idx, 'default_weight_kg', Math.max(0, Math.round((cur + delta) * 2) / 2));
  }

  function changeDefReps(idx: number, delta: number) {
    const cur = planExercises[idx].default_reps ?? 8;
    updatePlanEx(idx, 'default_reps', Math.max(1, cur + delta));
  }

  async function savePlan() {
    if (!editName.trim() || planExercises.length === 0) {
      alert('Give the plan a name and add at least one exercise.');
      return;
    }

    let planId: number;
    if (editPlanId) {
      // simple: delete old plan_ex and recreate (keeps simple)
      await db.deletePlan(editPlanId);
      planId = await db.createPlan(editName.trim(), editNotes.trim());
    } else {
      planId = await db.createPlan(editName.trim(), editNotes.trim());
    }

    let order = 1;
    for (const pe of planExercises) {
      await db.addPlanExercise(
        planId,
        pe.exercise.id,
        order++,
        pe.sets_count,
        pe.default_weight_kg,
        pe.default_reps
      );
    }

    editing = false;
    await loadPlans();
  }

  function cancelEdit() {
    editing = false;
  }

  async function doStart(p: Plan) {
    if (startingPlanId || inFlightStarts.has(p.id)) return;
    inFlightStarts.add(p.id);
    startingPlanId = p.id;
    // defensively clear any pending cross signals to avoid double activation
    loadWorkoutId = null;
    clearPendingWorkout();
    try {
      const workoutId = await db.startWorkoutFromPlan(p.id);
      // Directly activate the tracking view inside this component
      // (show the UI to track weight, reps, sets, pause time per exercise)
      activeWorkoutId = workoutId;
      // no alert, view switches immediately via state
    } catch (e) {
      alert('Failed to start workout: ' + e);
    } finally {
      inFlightStarts.delete(p.id);
      startingPlanId = null;
    }
  }

  async function doDelete(p: Plan) {
    if (!confirm(`Delete workout "${p.name}"?`)) return;
    await db.deletePlan(p.id);
    await loadPlans();
  }

  function endActiveSession() {
    loadWorkoutId = null;  // clear prop first so the effect doesn't re-activate when we null active
    activeWorkoutId = null;
    clearPendingWorkout();  // prevent the consume effect from re-activating the logger
    onLoaded();
  }
</script>

<div class="plans">
  {#if activeWorkoutId}
    <!-- Active tracking session (old flow restored: track weights, sets, pause per exercise) -->
    <div class="active-header">
      <h2>Active Workout</h2>
      <button class="btn" onclick={endActiveSession}>← Back to Workouts</button>
    </div>
    <WorkoutLogger loadWorkoutId={activeWorkoutId} onLoaded={() => {}} />
  {:else}
  <div class="head">
    <h2>Workouts</h2>
    {#if !editing}
      <button class="btn primary" onclick={startCreate}>+ New Workout</button>
    {/if}
  </div>

  {#if editing}
    <!-- Editor -->
    <div class="editor">
      <div class="row">
        <input class="input" placeholder="Workout name e.g. Push A" bind:value={editName} />
        <input class="input" placeholder="notes (optional)" bind:value={editNotes} />
      </div>

      <div class="add-ex">
        <div class="add-header">
          <input
            class="input"
            placeholder="Search exercises to add..."
            bind:value={exSearch}
          />
          <label class="group-toggle">
            <input type="checkbox" bind:checked={groupByMuscle} />
            Group by muscle
          </label>
        </div>

        {#if !groupByMuscle}
          <div class="ex-list">
            {#each availableEx as ex (ex.id)}
              {#if !planExercises.some((p: any) => p.exercise.id === ex.id)}
                <button class="ex-chip" onclick={() => addExerciseToPlan(ex)}>
                  {ex.name}
                  <small>{JSON.parse(ex.muscle_groups || '[]').slice(0,2).join('/')}</small>
                </button>
              {/if}
            {/each}
            {#if availableEx.length === 0}<span class="muted">No matches</span>{/if}
          </div>
        {:else}
          <!-- Grouped view: toggle only affects discovery / adding. Plan order remains fully manual. -->
          <div class="grouped">
            {#each getGrouped() as [muscle, exs]}
              <div class="group">
                <div class="group-title">{muscle}</div>
                <div class="ex-list">
                  {#each exs as ex (ex.id)}
                    {#if !planExercises.some((p: any) => p.exercise.id === ex.id)}
                      <button class="ex-chip" onclick={() => addExerciseToPlan(ex)}>
                        {ex.name}
                      </button>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <h3>Exercises in this workout ({planExercises.length})</h3>

      {#if planExercises.length === 0}
        <p class="muted">Add exercises from the search above.</p>
      {/if}

      <div class="plan-ex-list">
        {#each planExercises as pe, i (i)}
          <div class="plan-ex">
            <div class="ex-name">
              <strong>{pe.exercise.name}</strong>
              <div class="order-btns">
                <button class="tiny" disabled={i===0} onclick={() => moveExercise(i, -1)}>↑</button>
                <button class="tiny" disabled={i===planExercises.length-1} onclick={() => moveExercise(i, 1)}>↓</button>
                <button class="btn danger small" onclick={() => removeFromPlan(i)}>remove</button>
              </div>
            </div>

            <div class="config">
              <!-- sets -->
              <div class="cfg">
                <span>Sets</span>
                <button class="tiny" onclick={() => changeSets(i, -1)}>-</button>
                <span class="num">{pe.sets_count}</span>
                <button class="tiny" onclick={() => changeSets(i, 1)}>+</button>
              </div>

              <!-- default weight -->
              <div class="cfg weight">
                <span>Weight (default for all sets)</span>
                <div class="w-controls">
                  <button class="tiny" onclick={() => changeDefWeight(i, -5)}>-5</button>
                  <button class="tiny" onclick={() => changeDefWeight(i, -2.5)}>-2.5</button>
                  <input type="number" class="num" value={pe.default_weight_kg ?? 20}
                         oninput={(e:any) => updatePlanEx(i, 'default_weight_kg', parseFloat(e.target.value)||0)} />
                  <button class="tiny" onclick={() => changeDefWeight(i, 2.5)}>+2.5</button>
                  <button class="tiny" onclick={() => changeDefWeight(i, 5)}>+5</button>
                  <span>kg</span>
                </div>
              </div>

              <!-- default reps -->
              <div class="cfg">
                <span>Reps (default)</span>
                <button class="tiny" onclick={() => changeDefReps(i, -1)}>-</button>
                <input type="number" class="num" value={pe.default_reps ?? 8}
                       oninput={(e:any) => updatePlanEx(i, 'default_reps', parseInt(e.target.value)||0)} />
                <button class="tiny" onclick={() => changeDefReps(i, 1)}>+</button>
                <button class="tiny" onclick={() => changeDefReps(i, 2)}>+2</button>
              </div>
            </div>
          </div>
        {/each}
      </div>

      <div class="actions">
        <button class="btn" onclick={cancelEdit}>Cancel</button>
        <button class="btn primary" onclick={savePlan}>Save Plan</button>
      </div>
    </div>
  {:else}
    <!-- List -->
    {#if loading}<p>Loading plans...</p>{/if}

    <div class="list">
      {#each plans as p (p.id)}
        <div class="plan-card">
          <div class="phead">
            <strong>{p.name}</strong>
            {#if p.notes}<small>{p.notes}</small>{/if}
            <small class="count">{p.exercise_count || 0} exercises</small>
          </div>
          <div class="pactions">
            <button class="btn primary" disabled={startingPlanId === p.id || inFlightStarts.has(p.id)} onclick={() => doStart(p)}>
              {startingPlanId === p.id ? 'Starting…' : 'Start'}
            </button>
            <button class="btn" onclick={() => startEdit(p)}>Edit</button>
            <button class="btn danger" onclick={() => doDelete(p)}>Delete</button>
          </div>
        </div>
      {/each}
      {#if plans.length === 0 && !loading}
        <p class="muted">No workouts yet. Create one from the library, then start to track.</p>
      {/if}
    </div>

    <div class="hint">
      <strong>Flow:</strong> Pick exercises (toggle group by muscle) → set defaults (weight same for all sets of that exercise) → Save → Start. Tracking UI opens here.
    </div>
  {/if}
  {/if}
</div>

<style>
  /* Scoped styles per css_guides */
  .plans { display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .editor { border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
  .row { display: flex; gap: 8px; }
  .row .input { flex: 1 1 0; min-width: 0; width: 100%; }
  .add-ex { display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
  .add-header { display: flex; gap: 8px; align-items: center; overflow: hidden; }
  .group-toggle { display: flex; align-items: center; gap: 4px; font-size: 13px; }
  .ex-list { display: flex; flex-wrap: wrap; gap: 4px; overflow: hidden; }
  .grouped { display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
  .group-title { font-size: 12px; font-weight: 600; opacity: 0.7; margin-bottom: 2px; text-transform: capitalize; }
  .ex-chip {
    padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); font-size: 14px; cursor: pointer;
    min-height: 44px; touch-action: manipulation;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ex-chip small { opacity: 0.6; margin-left: 4px; }
  .plan-ex-list { display: flex; flex-direction: column; gap: 10px; }
  .plan-ex { border: 1px solid var(--border); padding: 8px; border-radius: 6px; overflow: hidden; }
  .ex-name { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 8px; }
  .ex-name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .order-btns { display: flex; gap: 2px; align-items: center; }
  .config { display: flex; flex-wrap: wrap; gap: 12px; }
  .cfg { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
  .cfg.weight .w-controls { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
  .cfg.weight .w-controls .tiny,
  .cfg.weight .w-controls .num { min-width: 28px; }
  .tiny { padding: 2px 6px; font-size: 12px; }
  .num { width: 52px; text-align: center; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }

  .list { display: flex; flex-direction: column; gap: 8px; }
  .plan-card { border: 1px solid var(--border); border-radius: 6px; padding: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
  .phead { display: flex; flex-direction: column; }
  .phead .count { font-size: 11px; opacity: 0.6; }
  .pactions { display: flex; gap: 6px; }

  .hint { font-size: 13px; opacity: 0.8; padding: 8px; background: var(--accent-bg); border-radius: 4px; }
  .muted { opacity: 0.6; }
  .small { font-size: 12px; padding: 2px 6px; }

  @media (max-width: 520px) {
    .config { flex-direction: column; }
    .plan-card { flex-direction: column; align-items: stretch; }
    .ex-chip, .btn, .tiny { min-height: 44px; padding: 8px 12px; font-size: 15px; }
    .row { flex-direction: column; }
    .add-header { flex-direction: column; align-items: flex-start; }
    .add-header .input { width: 100%; }
    .num { width: 42px; }
    .w-controls .tiny { padding: 1px 4px; font-size: 11px; }
  }

  .active-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
</style>
