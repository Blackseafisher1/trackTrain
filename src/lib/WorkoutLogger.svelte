<script lang="ts">
  // Core workout logging.
  // Supports free-form + planned sessions (from Workouts tab).
  // Cleaner default: only show 1 weight per exercise (neat controls). Per-set weight hidden behind toggle.
  // Reps always editable per set. Settings page controls default visibility of per-set weights.
  // Mark done, rest timers per card, pause tracking.
  // All changes persist. Progress/history use the logged actual values + completed.
  // Keep simple. One hand friendly.
  import { onMount, onDestroy } from 'svelte';
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

  // rest timer for auto (starts on mark done for supersets etc.)
  // NOTE: In background (app minimized/switched away, not fully terminated):
  // - Main thread intervals are throttled by browser.
  // - We use a Web Worker + end timestamp for better chance the completion fires.
  // - Notification can be shown while in background (if browser allows the worker to run).
  // - No full second-by-second guarantee, but the "done" should trigger.
  let timerSec = $state(0);
  let timerInterval: any = null;
  let timerPreset = $state(180);
  let timerWorker: Worker | null = null;

  // Silent audio hack to keep PWA "alive" in background so timers and notifications work
  let audioContext: AudioContext | null = null;
  let silenceSource: AudioBufferSourceNode | null = null;

  // Pause tracking: locally for current session
  // When mark set done, record time since prev done set for that exercise
  let pauseTimes = $state<Record<number, number[]>>({}); // weId -> pauses in sec
  let lastDoneTime = $state<Record<number, number>>({}); // weId -> last done timestamp ms

  // Per-exercise override for showing per-set weight editing (cleaner default: hide)
  let perExShowWeights = $state<Record<number, boolean>>({});
  let showPerSetFromSettings = $derived($settings.showPerSetWeights);

  let summary = $state<any>(null);

  // Simple toast for auto rest timer (item 3+4)
  let toasts = $state<any[]>([]); // { id, msg, secs?, done }
  let toastId = 1;
  let currentAutoToastId = $state<number | null>(null);

  const REST_TIMER_END_KEY = 'gymtrack_rest_end';

  function showToast(msg: string, secs?: number) {
    if (!$settings.pauseTrackingEnabled) return;
    const id = toastId++;
    const t = { id, msg, secs, done: false };
    toasts = [...toasts, t];
    if (secs != null && secs > 0) {
      // will be updated by timer
    }
    return id;
  }

  function updateToast(id: number, secs: number) {
    toasts = toasts.map(t => t.id === id ? { ...t, secs: Math.max(0, Math.round(secs)) } : t);
  }

  function finishToast(id: number) {
    toasts = toasts.map(t => t.id === id ? { ...t, done: true, secs: 0, msg: 'Rest complete' } : t);
    localStorage.removeItem('gymtrack_rest_end'); // ensure we don't re-notify on reopen

    // notifications if enabled
    if ($settings.enableTimerNotifications && typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        // Always try to notify on completion (especially useful for missed timers on reopen)
        new Notification('Rest done', { body: 'Time for next set', tag: 'gymtrack-rest' });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
    // auto remove after short time
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
    }, 1800);
  }

  function dismissToast(id: number) {
    toasts = toasts.filter(t => t.id !== id);
  }

  onMount(async () => {
    allExercises = await db.getExercises('', '');
    checkMissedRestTimer();

    // Check for missed timers when app comes back to foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkMissedRestTimer();
      }
    });
  });

  onDestroy(() => {
    stopTimer();
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
    toasts = [];

    // Build items from existing workout_ex + sets (which may have planned values)
    items = (detail.exercises || []).map((ex: any) => ({
      weId: ex.id,
      exercise: {
        id: ex.exercise_id,
        name: ex.name,
        muscle_groups: ex.muscle_groups,
      },
      sets: (ex.sets || []).map((s: any) => ({ ...s })), // copy
      restSeconds: ex.rest_seconds,
      supersetGroup: ex.superset_group ?? null,
    }));

    clearPauses(); // fresh tracking for this session

    // Check for any timer that expired while we were away
    checkMissedRestTimer();

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
    toasts = [];
    clearPauses();
  }

  async function addExerciseFromLib() {
    if (!currentWorkoutId || !selectedExId) return;
    const ex = allExercises.find(e => e.id === selectedExId);
    if (!ex) return;
    const order = items.length + 1;
    const rest = $settings.perExerciseRestTimes ? $settings.defaultRestSeconds : undefined;
    const weId = await db.addWorkoutExercise(currentWorkoutId, ex.id, order, rest ?? 180, null);
    items = [...items, { weId, exercise: ex, sets: [], restSeconds: rest }];
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
    const rest = $settings.perExerciseRestTimes ? $settings.defaultRestSeconds : undefined;
    const weId = await db.addWorkoutExercise(currentWorkoutId, ex.id, order, rest ?? 180, null);
    items = [...items, { weId, exercise: ex, sets: [], restSeconds: rest }];
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

    if (newDone) {
      afterSetMarkedDone(weIdx);

      // Supersets: if you mark a set done on the 1st exercise of the pair,
      // also mark the first (next) undone set on the 2nd exercise done.
      if (it.supersetGroup != null) {
        const pairIdx = items.findIndex((x, j) => j !== weIdx && x.supersetGroup === it.supersetGroup);
        if (pairIdx !== -1 && weIdx < pairIdx) {
          const pairIt = items[pairIdx];
          const firstUndoneIdx = pairIt.sets.findIndex((s: any) => !s.completed);
          if (firstUndoneIdx !== -1) {
            updateSetLocal(pairIdx, firstUndoneIdx, 'completed', 1);
            afterSetMarkedDone(pairIdx);
          }
        }
      }
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
    if (!$settings.pauseTrackingEnabled) return 0;
    const weId = items[weIdx]?.weId;
    const times = (weId != null ? pauseTimes[weId] : []) || [];
    if (times.length === 0) return 0;
    const sum = times.reduce((a, b) => a + b, 0);
    return Math.round(sum / times.length);
  }

  function getRestSeconds(weIdx: number): number {
    if (!$settings.pauseTrackingEnabled) return 0;
    const it = items[weIdx];
    if ($settings.perExerciseRestTimes && it && it.restSeconds != null) {
      return it.restSeconds;
    }
    return $settings.defaultRestSeconds || 180;
  }

  function changeRest(weIdx: number, delta: number) {
    const it = items[weIdx];
    if (!it) return;
    const cur = it.restSeconds ?? getRestSeconds(weIdx);
    const val = Math.max(30, Math.min(600, cur + delta));
    it.restSeconds = val;
    if (it.supersetGroup != null) {
      items.forEach(x => { if (x.supersetGroup === it.supersetGroup) x.restSeconds = val; });
    }
    items = [...items];
  }

  function afterSetMarkedDone(weIdx: number) {
    const it = items[weIdx];
    if (!it) return;
    const weId = it.weId;
    const now = Date.now();
    if ($settings.pauseTrackingEnabled) {
      if (lastDoneTime[weId] != null) {
        const pauseSec = Math.round((now - lastDoneTime[weId]) / 1000);
        if (!pauseTimes[weId]) pauseTimes[weId] = [];
        pauseTimes[weId] = [...pauseTimes[weId], pauseSec];
      }
      lastDoneTime[weId] = now;

      // superset: only trigger shared pause after both in the pair (exactly 2) have done their set
      let trigger = true;
      if (it.supersetGroup != null) {
        const g = it.supersetGroup;
        const gis = items.filter(x => x.supersetGroup === g);
        if (gis.length > 2) {
          trigger = false;
        } else {
          const myDone = it.sets.filter((s:any) => s.completed).length;
          if (!gis.every(x => x.sets.filter((s:any) => s.completed).length >= myDone)) trigger = false;
        }
      }
      if (trigger) {
        const rest = getRestSeconds(weIdx);
        timerPreset = rest;
        if (currentAutoToastId) finishToast(currentAutoToastId);
        const tid = showToast('Rest', rest);
        currentAutoToastId = tid;
        if ($settings.enableTimerNotifications && typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }
        startTimer(tid);
      }
    }
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

  function clearRestTimerEnd() {
    localStorage.removeItem(REST_TIMER_END_KEY);
  }

  function checkMissedRestTimer() {
    const endStr = localStorage.getItem(REST_TIMER_END_KEY);
    if (!endStr) return;
    const end = parseInt(endStr, 10);
    if (isNaN(end)) {
      clearRestTimerEnd();
      return;
    }

    if (Date.now() >= end) {
      // Timer expired while app was closed / backgrounded
      if ($settings.enableTimerNotifications && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Rest done', { body: 'Time for next set', tag: 'gymtrack-rest' });
      }
      // If we have a visible toast for it, finish it
      if (currentAutoToastId) {
        finishToast(currentAutoToastId);
        currentAutoToastId = null;
      }
      stopSilentAudio();
      clearRestTimerEnd();
    } else {
      // Still pending — resync the display and restart accurate worker timer + silent audio
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      timerSec = remaining;
      timerPreset = remaining;
      if (currentAutoToastId) {
        updateToast(currentAutoToastId, timerSec);
      }
      // Restart the worker for the remaining time
      if (timerWorker) {
        timerWorker.terminate();
        timerWorker = null;
      }
      const workerCode = `
        let t;
        self.onmessage = (e) => {
          if (t) clearTimeout(t);
          const delay = Math.max(0, e.data.end - Date.now());
          t = setTimeout(() => {
            self.postMessage('done');
          }, delay);
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      timerWorker = new Worker(URL.createObjectURL(blob));
      timerWorker.onmessage = () => {
        if (currentAutoToastId) {
          finishToast(currentAutoToastId);
          currentAutoToastId = null;
        }
        clearRestTimerEnd();
        stopTimer();
      };
      timerWorker.postMessage({ end });

      // Restart silent audio for remaining duration to keep alive
      startSilentAudio(remaining);
    }
  }

  function startSilentAudio(durationSec: number) {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Use a silent oscillator (gain=0) - very cheap, works for long durations
      // This keeps the audio context "active" in background on many browsers/PWAs
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      gain.gain.value = 0; // silent

      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();

      // Schedule stop after duration +1s
      const stopTime = audioContext.currentTime + durationSec + 1;
      osc.stop(stopTime);

      // Stop previous if any
      if (silenceSource) {
        try { silenceSource.stop(); } catch (_) {}
      }
      silenceSource = osc;
    } catch (e) {
      // AudioContext may fail (e.g. no audio permission/context), ignore
    }
  }

  function stopSilentAudio() {
    if (silenceSource) {
      try { silenceSource.stop(); } catch (_) {}
      silenceSource = null;
    }
  }

  function startTimer(autoToastId?: number) {
    stopTimer();
    const rest = timerPreset;
    const end = Date.now() + rest * 1000;
    localStorage.setItem(REST_TIMER_END_KEY, String(end));

    timerSec = rest;
    if (autoToastId) currentAutoToastId = autoToastId;

    // Start silent audio to keep the PWA process alive in background
    startSilentAudio(rest);

    // UI refresh interval (smooth countdown while page is foreground/visible)
    timerInterval = setInterval(() => {
      const stored = localStorage.getItem(REST_TIMER_END_KEY);
      if (!stored) {
        stopTimer();
        return;
      }
      const e = parseInt(stored, 10);
      const rem = Math.max(0, Math.ceil((e - Date.now()) / 1000));
      timerSec = rem;
      if (currentAutoToastId) {
        updateToast(currentAutoToastId, rem);
      }
    }, 500);

    // Dedicated Web Worker for the completion timer.
    // Workers have a better chance to execute in background than main thread.
    const workerCode = `
      let t;
      self.onmessage = (e) => {
        if (t) clearTimeout(t);
        const delay = Math.max(0, e.data.end - Date.now());
        t = setTimeout(() => {
          self.postMessage('done');
        }, delay);
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    timerWorker = new Worker(URL.createObjectURL(blob));
    timerWorker.onmessage = () => {
      if (currentAutoToastId) {
        finishToast(currentAutoToastId);
        currentAutoToastId = null;
      }
      clearRestTimerEnd();
      stopTimer();
    };
    timerWorker.postMessage({ end });
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    if (timerWorker) {
      timerWorker.terminate();
      timerWorker = null;
    }
    stopSilentAudio();
    clearRestTimerEnd();
    if (currentAutoToastId) {
      currentAutoToastId = null;
    }
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
    toasts = [];
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

    <!-- Simple toasts for auto rest (position tunable via settings) -->
    {#if toasts.length}
      <div class="toasts" style="top: {$settings.toastOffsetTop}px">
        {#each toasts as t (t.id)}
          <div class="toast" class:done={t.done}>
            <span>{t.msg}{t.secs != null ? ` — ${t.secs}s` : ''}</span>
            <button class="tiny" onclick={() => dismissToast(t.id)}>×</button>
          </div>
        {/each}
      </div>
    {/if}

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
        <div class="ex-head">
          <strong>{it.exercise.name}</strong>
          {#if it.supersetGroup != null}<span class="ss">superset</span>{/if}
          {#if $settings.pauseTrackingEnabled && $settings.perExerciseRestTimes}
            <span class="rest-edit">
              rest
              <button class="tiny" onclick={() => changeRest(i, -15)}>-15</button>
              <input type="number" class="num small" value={it.restSeconds ?? getRestSeconds(i)} oninput={(e:any) => { const v = parseInt(e.target.value)||180; const itm=items[i]; if(itm){ itm.restSeconds = Math.max(30,Math.min(600,v)); if(itm.supersetGroup!=null) items.forEach(x=>{if(x.supersetGroup===itm.supersetGroup) x.restSeconds=itm.restSeconds;}); items=[...items]; } }} />
              <button class="tiny" onclick={() => changeRest(i, 15)}>+15</button>
              s
            </span>
          {/if}
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
        {#if $settings.pauseTrackingEnabled && allSetsDone(it)}
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
  }

  .toasts {
    position: fixed;
    left: 12px;
    right: 12px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    background: var(--bg);
    border: 1px solid var(--accent);
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .toast.done { border-color: var(--accent); background: var(--accent-bg); }
  .toast .tiny { padding: 2px 8px; min-height: 28px; font-size: 14px; }

  .ex-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ss { font-size: 10px; background: var(--accent-bg); padding: 1px 4px; border-radius: 3px; display: inline-block; }
  .rest-edit { font-size: 12px; display: flex; align-items: center; gap: 2px; opacity: 0.8; }
  .num.small { width: 48px; font-size: 12px; padding: 2px 4px; min-height: 28px; }

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
