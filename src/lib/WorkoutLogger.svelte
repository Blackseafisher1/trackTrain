<script lang="ts">
  // Core workout logging.
  // Supports free-form + planned sessions (from Workouts tab).
  // Cleaner default: only show 1 weight per exercise (neat controls). Per-set weight hidden behind toggle.
  // Reps always editable per set. Settings page controls default visibility of per-set weights.
  // Mark done, rest timers per card, pause tracking.
  // All changes persist. Progress/history use the logged actual values + completed.
  // Keep simple. One hand friendly.
  import { onMount } from 'svelte';
  import * as db from './db/client';
  import type { Exercise, Set } from './db/types';
  import { calcVolume } from './db/client';
  import { settings } from './settings';

  // Props for planned sessions: parent (App) can pass a workout id created from a Plan
  // to pre-load the structure with defaults. onLoaded lets parent clear the pending id.
  let { loadWorkoutId = $bindable(null), onLoaded = () => {} }: { 
    loadWorkoutId?: number | null; 
    onLoaded?: () => void;
  } = $props();

  let currentWorkoutId = $state<number | null>(null);
  let workoutName = $state('');
  let workoutNotes = $state('');
  let items = $state<any[]>([]); // {weId, exercise, sets: Set[] }
  let allExercises = $state<Exercise[]>([]);
  let selectedExId = $state<number | 0>(0);
  let quickAddName = $state('');

  // rest timer (global but controls duplicated per ex card for touch)
  let timerSec = $state(0);
  let timerInterval: any = null;
  let timerPreset = $state(60);
  const restPresets = [60, 90, 120, 180, 260]; // more options for in-between sets

  // Pause tracking: locally for current session
  // When mark set done, record time since prev done set for that exercise
  let pauseTimes = $state<Record<number, number[]>>({}); // weId -> pauses in sec
  let lastDoneTime = $state<Record<number, number>>({}); // weId -> last done timestamp ms

  // Per-exercise override for showing per-set weight editing (cleaner default: hide)
  let perExShowWeights = $state<Record<number, boolean>>({});
  let showPerSetFromSettings = $derived($settings.showPerSetWeights);

  let summary = $state<any>(null);

  onMount(async () => {
    allExercises = await db.getExercises('', '');
  });

  // Load a pre-created workout (from Plan). Keeps the planned defaults as starting point.
  async function loadExistingWorkout(wid: number) {
    const detail = await db.getWorkoutDetail(wid);
    if (!detail) return;

    currentWorkoutId = wid;
    workoutName = detail.name || '';
    workoutNotes = detail.notes || '';
    summary = null;
    timerSec = 0;

    // Build items from existing workout_ex + sets (which may have planned values)
    items = (detail.exercises || []).map((ex: any) => ({
      weId: ex.id,
      exercise: {
        id: ex.exercise_id,
        name: ex.name,
        muscle_groups: ex.muscle_groups,
      },
      sets: (ex.sets || []).map((s: any) => ({ ...s })), // copy
    }));

    clearPauses(); // fresh tracking for this session

    // consume the prop so parent knows we handled it
    if (loadWorkoutId === wid) {
      loadWorkoutId = null;
      onLoaded();
    }
  }

  // React to prop changes (when Plans starts a new plan)
  $effect(() => {
    if (loadWorkoutId && loadWorkoutId !== currentWorkoutId) {
      loadExistingWorkout(loadWorkoutId);
    }
  });

  async function startWorkout() {
    if (currentWorkoutId) return;
    const id = await db.createWorkout(workoutName || undefined, workoutNotes || undefined);
    currentWorkoutId = id;
    items = [];
    summary = null;
    timerSec = 0;
    clearPauses();
  }

  async function addExerciseFromLib() {
    if (!currentWorkoutId || !selectedExId) return;
    const ex = allExercises.find(e => e.id === selectedExId);
    if (!ex) return;
    const order = items.length + 1;
    const weId = await db.addWorkoutExercise(currentWorkoutId, ex.id, order);
    items = [...items, { weId, exercise: ex, sets: [] }];
    selectedExId = 0;
  }

  async function addQuickExercise() {
    if (!currentWorkoutId || !quickAddName.trim()) return;
    // add ad-hoc as temp custom? For simplicity treat as new custom each time or reuse name.
    // Better: find or create simple. For MVP create custom each quick? Or just use name.
    // To keep schema happy: insert as custom if not exist, but simple: allow name only for display.
    // For now: create a temp exercise record? To follow data model, create custom.
    const name = quickAddName.trim();
    let ex = allExercises.find(e => e.name.toLowerCase() === name.toLowerCase());
    if (!ex) {
      const newId = await db.addCustomExercise(name, ['custom']);
      ex = { id: newId, name, muscle_groups: '["custom"]', category: 'strength', is_custom: 1 } as any;
      allExercises = [...allExercises, ex];
    }
    const order = items.length + 1;
    const weId = await db.addWorkoutExercise(currentWorkoutId, ex.id, order);
    items = [...items, { weId, exercise: ex, sets: [] }];
    quickAddName = '';
  }

  async function addSet(weIdx: number, weight = 20, reps = 8) {
    const it = items[weIdx];
    if (!it) return;
    const order = it.sets.length + 1;
    await db.addSet(it.weId, order, weight, reps);
    // reload sets for this item
    const fresh = await reloadItemSets(it.weId);
    items[weIdx] = { ...it, sets: fresh };
    items = [...items]; // trigger
  }

  async function reloadItemSets(weId: number) {
    // simple: fetch last from global? For keep simple, we maintain in memory.
    // Since add immediate, we can push locally and avoid full reload each time.
    // But for update/delete we need real. Here simulate by re-query minimal.
    // For ultra simple: after add we push fake to local.
    return []; // replaced by local push below
  }

  // Better local-first fast: keep sets in items local, sync writes.
  function addSetLocal(weIdx: number, weight: number, reps: number, rpe?: number) {
    const it = items[weIdx];
    if (!it || !currentWorkoutId) return;
    const order = (it.sets?.length || 0) + 1;
    const fakeSet = { id: Date.now(), workout_exercise_id: it.weId, set_order: order, weight_kg: weight, reps, rpe: rpe || null, notes: null, completed: 0 } as any;
    it.sets = [...(it.sets || []), fakeSet];
    items = [...items];
    // fire and forget persist
    db.addSet(it.weId, order, weight, reps, rpe).catch(console.error);
  }

  function updateSetLocal(weIdx: number, setIdx: number, field: 'weight_kg'|'reps'|'rpe' | 'completed', val: any) {
    const s = items[weIdx]?.sets?.[setIdx];
    if (!s) return;
    (s as any)[field] = val;
    items = [...items];
    // persist (for completed we have dedicated, but reuse update for simplicity on other fields)
    if (field === 'completed') {
      db.markSetCompleted(s.id, !!val).catch(console.error);
    } else {
      db.updateSet(s.id, s.weight_kg, s.reps, s.rpe, s.notes || undefined).catch(console.error);
    }
  }

  function toggleSetDone(weIdx: number, setIdx: number) {
    const s = items[weIdx]?.sets?.[setIdx];
    if (!s) return;
    const it = items[weIdx];
    const weId = it.weId;
    const newDone = !s.completed;
    updateSetLocal(weIdx, setIdx, 'completed', newDone ? 1 : 0);

    // Track pause time locally when completing a set
    if (newDone) {
      const now = Date.now();
      if (lastDoneTime[weId] != null) {
        const pauseSec = Math.round((now - lastDoneTime[weId]) / 1000);
        if (!pauseTimes[weId]) pauseTimes[weId] = [];
        pauseTimes[weId] = [...pauseTimes[weId], pauseSec];
      }
      lastDoneTime[weId] = now;
    }
  }

  function delSetLocal(weIdx: number, setIdx: number) {
    const it = items[weIdx];
    const s = it.sets[setIdx];
    if (!s) return;
    it.sets.splice(setIdx, 1);
    items = [...items];
    db.deleteSet(s.id).catch(console.error);
  }

  function changeWeight(weIdx: number, setIdx: number, delta: number) {
    const s = items[weIdx].sets[setIdx];
    const cur = s.weight_kg || 0;
    updateSetLocal(weIdx, setIdx, 'weight_kg', Math.max(0, Math.round((cur + delta) * 2) / 2)); // 0.5 steps
  }

  function changeReps(weIdx: number, setIdx: number, delta: number) {
    const s = items[weIdx].sets[setIdx];
    const cur = s.reps || 0;
    updateSetLocal(weIdx, setIdx, 'reps', Math.max(0, cur + delta));
  }

  // Per-exercise default weight: lets you set one weight for the whole exercise (as requested).
  // You can still manually override any individual set.
  function applyDefaultWeight(weIdx: number, weight: number) {
    const it = items[weIdx];
    if (!it) return;
    for (let si = 0; si < it.sets.length; si++) {
      updateSetLocal(weIdx, si, 'weight_kg', weight);
    }
  }

  function getDefaultWeight(weIdx: number): number {
    const sets = items[weIdx]?.sets || [];
    if (!sets.length) return 20;
    // use first non-null as current default suggestion
    return sets.find((s: any) => s.weight_kg != null)?.weight_kg ?? 20;
  }

  function clearPauses() {
    pauseTimes = {};
    lastDoneTime = {};
  }

  function allSetsDone(it: any): boolean {
    return it.sets.length > 0 && it.sets.every((s: any) => !!s.completed);
  }

  function getAvgPause(weIdx: number): number {
    const weId = items[weIdx]?.weId;
    const times = (weId != null ? pauseTimes[weId] : []) || [];
    if (times.length === 0) return 0;
    const sum = times.reduce((a, b) => a + b, 0);
    return Math.round(sum / times.length);
  }

  function shouldShowPerSet(weIdx: number): boolean {
    const weId = items[weIdx]?.weId;
    if (weId != null && perExShowWeights[weId] !== undefined) {
      return perExShowWeights[weId];
    }
    return showPerSetFromSettings;
  }

  function togglePerSetWeights(weIdx: number) {
    const weId = items[weIdx].weId;
    perExShowWeights[weId] = !perExShowWeights[weId];
    perExShowWeights = { ...perExShowWeights };
  }

  function markExerciseDone(weIdx: number) {
    const it = items[weIdx];
    if (!it) return;
    it.sets.forEach((s: any, si: number) => {
      if (!s.completed) {
        updateSetLocal(weIdx, si, 'completed', 1);
      }
    });
  }

  function totalVolume(): number {
    let v = 0;
    for (const it of items) {
      for (const s of it.sets || []) v += calcVolume(s.weight_kg, s.reps);
    }
    return Math.round(v);
  }

  function startTimer() {
    stopTimer();
    timerSec = timerPreset;
    timerInterval = setInterval(() => {
      timerSec--;
      if (timerSec <= 0) stopTimer();
    }, 1000);
  }
  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  async function endWorkout() {
    if (!currentWorkoutId) return;
    stopTimer();
    // compute simple duration? skip for simple
    const vol = totalVolume();
    summary = {
      id: currentWorkoutId,
      name: workoutName || 'Workout',
      sets: items.reduce((a, i) => a + (i.sets?.length || 0), 0),
      volume: vol,
      items: [...items]
    };
    // leave data in db. reset ui state
    currentWorkoutId = null;
    items = [];
    workoutName = '';
    workoutNotes = '';
  }

  function resetAll() {
    stopTimer();
    currentWorkoutId = null;
    items = [];
    summary = null;
    clearPauses();
  }

  // presets
  const weightPresets = [2.5, 5, 10];
  const repPresets = [1, 5];
</script>

<div class="logger">
  <h2>Workout Logging</h2>

  {#if summary}
    <div class="summary">
      <h3>Session ended</h3>
      <p><strong>{summary.name}</strong> — {summary.sets} sets, {summary.volume} kg vol</p>
      <button class="btn" onclick={resetAll}>Start New</button>
    </div>
  {:else if !currentWorkoutId}
    <div class="start">
      <input class="input" placeholder="Workout name (e.g. Push)" bind:value={workoutName} />
      <input class="input" placeholder="notes" bind:value={workoutNotes} />
      <button class="btn primary" onclick={startWorkout}>START TRAINING</button>
    </div>
  {:else}
    <!-- active session -->
    <div class="active-head">
      <input class="input" placeholder="Name" bind:value={workoutName} />
      <button class="btn danger" onclick={endWorkout}>END WORKOUT</button>
    </div>

    <!-- add exercise -->
    <div class="add-ex">
      <select class="input" bind:value={selectedExId}>
        <option value={0}>-- choose exercise --</option>
        {#each allExercises as ex}
          <option value={ex.id}>{ex.name}</option>
        {/each}
      </select>
      <button class="btn" onclick={addExerciseFromLib}>Add</button>

      <span>or quick</span>
      <input class="input" placeholder="new ex name" bind:value={quickAddName} onkeydown={(e) => e.key==='Enter' && addQuickExercise()} />
      <button class="btn" onclick={addQuickExercise}>Add Quick</button>
    </div>

    <!-- exercises + sets -->
    {#each items as it, i (it.weId)}
      <div class="ex-block">
        <div class="ex-head"><strong>{it.exercise.name}</strong></div>

        <!-- Rest timer per exercise card (touch friendly, above sets).
             Use for in-between sets. New presets include 180s, 260s. -->
        <div class="timer">
          <span>Rest:</span>
          {#each restPresets as sec}
            <button class="btn" onclick={() => { timerPreset = sec; startTimer(); }}>{sec}s</button>
          {/each}
          <strong>{timerSec}s</strong>
          <button class="btn" onclick={stopTimer}>stop</button>
        </div>

        <!-- Weight controls: buttons + value all in one compact line -->
        <div class="ex-defaults weight-row">
          <span class="label">Weight</span>
          <div class="wgroup">
            <button class="bigbtn" onclick={() => applyDefaultWeight(i, getDefaultWeight(i) - 5)}>-5</button>
            <button class="bigbtn" onclick={() => applyDefaultWeight(i, getDefaultWeight(i) - 2.5)}>-2.5</button>
            <input type="number" class="num" value={getDefaultWeight(i)} 
                   oninput={(e:any) => applyDefaultWeight(i, parseFloat(e.target.value) || 0)} />
            <span class="unit">kg</span>
            <button class="bigbtn" onclick={() => applyDefaultWeight(i, getDefaultWeight(i) + 2.5)}>+2.5</button>
            <button class="bigbtn" onclick={() => applyDefaultWeight(i, getDefaultWeight(i) + 5)}>+5</button>
          </div>
          <button class="btn small" onclick={() => togglePerSetWeights(i)}>
            {shouldShowPerSet(i) ? 'Hide per set' : 'Per set'}
          </button>
        </div>

        <button class="btn small" onclick={() => markExerciseDone(i)}>Mark whole exercise done</button>

        <div class="sets">
          {#each it.sets as s, si}
            <div class="set-row" class:done={!!s.completed}>
              {#if shouldShowPerSet(i)}
                <!-- weight big controls (per set override) - hidden by default for cleaner view -->
                <div class="weight">
                  <button class="bigbtn" onclick={() => changeWeight(i, si, -5)}>-5</button>
                  <button class="bigbtn" onclick={() => changeWeight(i, si, -2.5)}>-2.5</button>
                  <input type="number" class="num" value={s.weight_kg ?? ''} 
                         oninput={(e: any) => updateSetLocal(i, si, 'weight_kg', parseFloat(e.target.value)||0)} />
                  <span>kg</span>
                  <button class="bigbtn" onclick={() => changeWeight(i, si, 2.5)}>+2.5</button>
                  <button class="bigbtn" onclick={() => changeWeight(i, si, 5)}>+5</button>
                </div>
              {/if}

              <!-- reps per set (always shown, the main variable per set) -->
              <div class="reps">
                <button class="bigbtn" onclick={() => changeReps(i, si, -1)}>-1</button>
                <input type="number" class="num" value={s.reps ?? ''} 
                       oninput={(e:any)=>updateSetLocal(i, si, 'reps', parseInt(e.target.value)||0)} />
                <span>reps</span>
                <button class="bigbtn" onclick={() => changeReps(i, si, 1)}>+1</button>
                <button class="bigbtn" onclick={() => changeReps(i, si, 5)}>+5</button>
              </div>

              <input class="input rpe" placeholder="RPE" type="number" value={s.rpe ?? ''} 
                     oninput={(e:any) => updateSetLocal(i, si, 'rpe', parseFloat(e.target.value)||null)} />

              <button class="btn danger" onclick={() => delSetLocal(i, si)}>x</button>

              <!-- Mark as done (easy toggle for the flow) -->
              <button class="btn" class:done-btn={!!s.completed} onclick={() => toggleSetDone(i, si)}>
                {s.completed ? '✓' : '○'}
              </button>

              <span class="vol">{calcVolume(s.weight_kg ?? getDefaultWeight(i), s.reps)}kg</span>
            </div>
          {/each}
        </div>

        <!-- Show average pause time after all sets of this exercise are done (tracked locally between done sets) -->
        {#if allSetsDone(it)}
          <div class="pause-info">
            Avg pause: <strong>{getAvgPause(i)}s</strong>
          </div>
        {/if}

        <div class="addset">
          {#each weightPresets as d}
            <button class="btn" onclick={() => addSetLocal(i, getDefaultWeight(i) || 20, 8)}>+{d} @8</button>
          {/each}
          <button class="btn primary" onclick={() => addSetLocal(i, getDefaultWeight(i) || 20, 10)}>Add set</button>
        </div>
      </div>
    {/each}

    <div class="total">Total volume: <strong>{totalVolume()}</strong> kg</div>

    <!-- End button at the bottom for convenience after scrolling through all exercises/sets -->
    <button class="btn danger large-end" onclick={endWorkout}>END WORKOUT</button>
  {/if}
</div>

<style>
  /* Fully scoped per css_guides. Made more touch-friendly + mobile friendly:
     - min 44px tap targets for fingers
     - larger padding / fonts on controls
     - rest timer controls now inside EVERY exercise card box, above the sets
     - pause times tracked locally between "done" sets
     - avg pause shown after all sets of an exercise completed
     - more presets: 180s, 260s added
  */
  .logger { display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
  .start, .active-head { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; overflow: hidden; }
  .add-ex { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; overflow: hidden; }
  .start .input,
  .active-head .input { flex: 1 1 0; min-width: 0; width: 100%; }
  .timer { 
    display: flex; gap: 4px; align-items: center; 
    font-variant-numeric: tabular-nums; 
    margin-bottom: 8px; 
    flex-wrap: wrap;
  }

  .ex-block {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    overflow: hidden; /* prevent inner elements from sticking out on narrow screens */
  }
  .ex-head { margin-bottom: 4px; font-size: 15px; font-weight: 600; }

  .ex-defaults {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    flex-wrap: wrap;
    overflow: hidden;
  }
  .ex-defaults.weight-row {
    flex-wrap: nowrap; /* weight label + buttons + value + unit all in one line */
    align-items: center;
  }
  .ex-defaults .label { font-size: 12px; opacity: 0.7; }
  .ex-defaults .wgroup { display: flex; align-items: center; gap: 2px; flex-wrap: nowrap; }
  .ex-defaults .wgroup .bigbtn,
  .ex-defaults .wgroup .num { flex-shrink: 1; min-width: 36px; }
  .ex-defaults .unit { font-size: 11px; opacity: 0.6; margin: 0 2px; }
  .ex-defaults .btn.small { font-size: 12px; padding: 4px 8px; min-height: 32px; }

  .set-row {
    display: flex; gap: 4px; align-items: center; margin: 4px 0; flex-wrap: wrap;
    padding: 4px 0;
  }
  .set-row.done {
    opacity: 0.55;
    text-decoration: line-through;
  }
  .done-btn {
    background: var(--accent-bg);
    border-color: var(--accent);
    min-width: 44px;
  }

  .weight, .reps { display: flex; align-items: center; gap: 2px; flex-wrap: nowrap; }
  .weight .bigbtn, .weight .num { min-width: 32px; }
  .bigbtn {
    padding: 8px 12px; font-size: 16px; border: 1px solid var(--border); background: var(--bg);
    border-radius: 6px; min-width: 48px; min-height: 44px; cursor: pointer;
    touch-action: manipulation;
  }
  .bigbtn:active { background: var(--accent-bg); }
  .num {
    width: 68px; text-align: center; padding: 6px 4px; border: 1px solid var(--border); border-radius: 6px;
    min-height: 40px; font-size: 15px;
  }
  .rpe { width: 52px; min-height: 40px; }
  .vol { font-size: 12px; min-width: 48px; color: var(--text); }

  .addset { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }

  .pause-info {
    margin-top: 8px;
    font-size: 13px;
    padding: 6px 10px;
    background: var(--accent-bg);
    border-radius: 4px;
    display: inline-block;
  }

  .total { font-size: 18px; padding: 8px 0; font-weight: 500; }

  .summary { padding: 16px; border: 2px solid var(--accent); border-radius: 8px; }

  .large-end {
    padding: 12px 20px;
    font-size: 16px;
    font-weight: 600;
    margin-top: 8px;
    width: 100%;
    max-width: 300px;
    align-self: center;
  }

  /* More mobile friendly + touch friendly */
  @media (max-width: 520px) {
    .set-row { flex-direction: column; align-items: stretch; gap: 6px; }
    .num { width: 100%; }
    .bigbtn { min-width: 52px; min-height: 48px; font-size: 17px; }
    .timer { gap: 6px; }
    .timer button { min-height: 40px; padding: 6px 10px; }
    .ex-block { padding: 10px; }
    .ex-defaults .wgroup { flex-wrap: wrap; }
    .ex-defaults .wgroup .bigbtn,
    .ex-defaults .wgroup .num { min-width: 32px; padding: 4px 6px; }
  }

  /* Universal touch improvements */
  .btn, .bigbtn, .tiny { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
</style>
