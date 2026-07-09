// DB client wrapper. Promise based messaging to worker.
// Follows OPFS_implementation.md + adapted for Svelte 5 + static.
// All heavy sqlite in worker. Main thread only talks via postMessage.
// Keep simple: one worker, id counter, Map for resolvers.

import type { Exercise, Workout, Set, WorkoutDetail, WorkoutExercise, Plan, PlanExercise } from './types';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function post(type: string, payload?: any): Promise<any> {
  if (!worker) throw new Error('DB worker not initialized');
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}

function handleMessage(e: MessageEvent) {
  const { id, result, error } = e.data;
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  if (error) p.reject(new Error(error));
  else p.resolve(result);
}

export async function initDb(baseUrl = '/sqlite/'): Promise<{ success: boolean }> {
  // ensure trailing slash so baseUrl + 'index.mjs' works
  if (!baseUrl.endsWith('/')) baseUrl += '/';
  if (worker) return { success: true };
  // Vite worker import. TS worker ok.
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = handleMessage;
  // init inside worker
  const res = await post('init', { baseUrl });
  // ensure schema + seed on first use
  await ensureSchema();
  await seedDefaultsIfEmpty();
  return res;
}

async function ensureSchema() {
  const schema = [
    `CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      muscle_groups TEXT,
      category TEXT DEFAULT 'strength',
      description TEXT,
      is_custom INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY,
      date DATETIME NOT NULL,
      name TEXT,
      notes TEXT,
      duration_minutes INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS workout_exercises (
      id INTEGER PRIMARY KEY,
      workout_id INTEGER REFERENCES workouts(id) ON DELETE CASCADE,
      exercise_id INTEGER REFERENCES exercises(id),
      exercise_order INTEGER NOT NULL,
      UNIQUE(workout_id, exercise_order)
    );`,
    `CREATE TABLE IF NOT EXISTS sets (
      id INTEGER PRIMARY KEY,
      workout_exercise_id INTEGER REFERENCES workout_exercises(id) ON DELETE CASCADE,
      set_order INTEGER NOT NULL,
      weight_kg REAL,
      reps INTEGER,
      rpe REAL,
      notes TEXT,
      completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);`,
    `CREATE INDEX IF NOT EXISTS idx_sets_workout ON sets(workout_exercise_id);`,

    // Plans support: template of exercises + defaults for sets
    `CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS plan_exercises (
      id INTEGER PRIMARY KEY,
      plan_id INTEGER REFERENCES plans(id) ON DELETE CASCADE,
      exercise_id INTEGER REFERENCES exercises(id),
      exercise_order INTEGER NOT NULL,
      sets_count INTEGER DEFAULT 3,
      default_weight_kg REAL,
      default_reps INTEGER,
      UNIQUE(plan_id, exercise_order)
    );`,
  ];
  await post('execMany', { sqls: schema });

  // Safe add completed column for older DBs (ignore error if exists)
  try {
    await post('exec', { sql: 'ALTER TABLE sets ADD COLUMN completed INTEGER DEFAULT 0' });
  } catch (_) {}
}

async function seedDefaultsIfEmpty() {
  const countRes = await post('exec', {
    sql: 'SELECT COUNT(*) as c FROM exercises WHERE is_custom = 0',
    rowMode: 'object',
  });
  const count = countRes?.rows?.[0]?.c || 0;
  if (count > 0) return;

  // seed list defined below (imported or inline)
  const seeds = getDefaultExercises();
  for (const ex of seeds) {
    await post('exec', {
      sql: `INSERT OR IGNORE INTO exercises (name, muscle_groups, category, is_custom) VALUES (?, ?, ?, 0)`,
      bind: [ex.name, JSON.stringify(ex.muscle_groups), ex.category],
    });
  }
}

function getDefaultExercises(): Array<{ name: string; muscle_groups: string[]; category: string }> {
  // ~70 common exercises. Keep simple, realistic for MVP.
  // muscle_groups as array -> stored JSON
  return [
    { name: 'Bench Press', muscle_groups: ['chest', 'triceps', 'shoulders'], category: 'strength' },
    { name: 'Incline Bench Press', muscle_groups: ['chest', 'triceps', 'shoulders'], category: 'strength' },
    { name: 'Dumbbell Bench Press', muscle_groups: ['chest', 'triceps'], category: 'strength' },
    { name: 'Overhead Press', muscle_groups: ['shoulders', 'triceps'], category: 'strength' },
    { name: 'Dumbbell Shoulder Press', muscle_groups: ['shoulders', 'triceps'], category: 'strength' },
    { name: 'Lateral Raise', muscle_groups: ['shoulders'], category: 'strength' },
    { name: 'Front Raise', muscle_groups: ['shoulders'], category: 'strength' },
    { name: 'Barbell Row', muscle_groups: ['back', 'biceps'], category: 'strength' },
    { name: 'Dumbbell Row', muscle_groups: ['back', 'biceps'], category: 'strength' },
    { name: 'Pull Ups', muscle_groups: ['back', 'biceps'], category: 'strength' },
    { name: 'Lat Pulldown', muscle_groups: ['back', 'biceps'], category: 'strength' },
    { name: 'Seated Row', muscle_groups: ['back'], category: 'strength' },
    { name: 'Face Pulls', muscle_groups: ['back', 'rear delts'], category: 'strength' },
    { name: 'Deadlift', muscle_groups: ['back', 'legs', 'core'], category: 'strength' },
    { name: 'Romanian Deadlift', muscle_groups: ['back', 'hamstrings'], category: 'strength' },
    { name: 'Squat', muscle_groups: ['legs', 'quads', 'glutes'], category: 'strength' },
    { name: 'Front Squat', muscle_groups: ['legs', 'quads'], category: 'strength' },
    { name: 'Leg Press', muscle_groups: ['legs', 'quads'], category: 'strength' },
    { name: 'Lunges', muscle_groups: ['legs', 'quads', 'glutes'], category: 'strength' },
    { name: 'Bulgarian Split Squat', muscle_groups: ['legs', 'quads', 'glutes'], category: 'strength' },
    { name: 'Leg Extension', muscle_groups: ['legs', 'quads'], category: 'strength' },
    { name: 'Leg Curl', muscle_groups: ['legs', 'hamstrings'], category: 'strength' },
    { name: 'Calf Raise', muscle_groups: ['legs', 'calves'], category: 'strength' },
    { name: 'Bicep Curl', muscle_groups: ['arms', 'biceps'], category: 'strength' },
    { name: 'Hammer Curl', muscle_groups: ['arms', 'biceps'], category: 'strength' },
    { name: 'Tricep Pushdown', muscle_groups: ['arms', 'triceps'], category: 'strength' },
    { name: 'Overhead Tricep Extension', muscle_groups: ['arms', 'triceps'], category: 'strength' },
    { name: 'Dips', muscle_groups: ['chest', 'triceps'], category: 'strength' },
    { name: 'Skull Crushers', muscle_groups: ['arms', 'triceps'], category: 'strength' },
    { name: 'Cable Fly', muscle_groups: ['chest'], category: 'strength' },
    { name: 'Pec Deck', muscle_groups: ['chest'], category: 'strength' },
    { name: 'Shrug', muscle_groups: ['shoulders', 'traps'], category: 'strength' },
    { name: 'Upright Row', muscle_groups: ['shoulders', 'traps'], category: 'strength' },
    { name: 'Arnold Press', muscle_groups: ['shoulders'], category: 'strength' },
    { name: 'Good Mornings', muscle_groups: ['back', 'hamstrings'], category: 'strength' },
    { name: 'Hip Thrust', muscle_groups: ['glutes', 'legs'], category: 'strength' },
    { name: 'Cable Row', muscle_groups: ['back'], category: 'strength' },
    { name: 'Chest Supported Row', muscle_groups: ['back'], category: 'strength' },
    { name: 'Reverse Fly', muscle_groups: ['rear delts'], category: 'strength' },
    { name: 'Wrist Curl', muscle_groups: ['arms', 'forearms'], category: 'strength' },
    { name: 'Plank', muscle_groups: ['core'], category: 'strength' },
    { name: 'Ab Wheel', muscle_groups: ['core'], category: 'strength' },
    { name: 'Hanging Leg Raise', muscle_groups: ['core'], category: 'strength' },
    { name: 'Cable Crunch', muscle_groups: ['core'], category: 'strength' },
    { name: 'Russian Twist', muscle_groups: ['core'], category: 'strength' },
    { name: 'Side Plank', muscle_groups: ['core'], category: 'strength' },
    { name: 'Mountain Climbers', muscle_groups: ['core', 'cardio'], category: 'strength' },
    { name: 'Push Ups', muscle_groups: ['chest', 'triceps', 'core'], category: 'strength' },
    { name: 'Chin Ups', muscle_groups: ['back', 'biceps'], category: 'strength' },
    { name: 'Incline Dumbbell Press', muscle_groups: ['chest', 'shoulders'], category: 'strength' },
    { name: 'Close Grip Bench', muscle_groups: ['triceps', 'chest'], category: 'strength' },
    { name: 'Preacher Curl', muscle_groups: ['biceps'], category: 'strength' },
    { name: 'Concentration Curl', muscle_groups: ['biceps'], category: 'strength' },
    { name: 'Kickbacks', muscle_groups: ['triceps'], category: 'strength' },
    { name: 'Step Ups', muscle_groups: ['legs', 'glutes'], category: 'strength' },
    { name: 'Goblet Squat', muscle_groups: ['legs', 'core'], category: 'strength' },
    { name: 'Sumo Deadlift', muscle_groups: ['legs', 'back'], category: 'strength' },
    { name: 'Hack Squat', muscle_groups: ['legs'], category: 'strength' },
    { name: 'Seated Calf Raise', muscle_groups: ['calves'], category: 'strength' },
    { name: 'Farmer Walk', muscle_groups: ['core', 'grip', 'shoulders'], category: 'strength' },
    { name: 'Kettlebell Swing', muscle_groups: ['back', 'glutes', 'core'], category: 'strength' },
    // add more to hit ~70
    { name: 'Dumbbell Fly', muscle_groups: ['chest'], category: 'strength' },
    { name: 'Incline Dumbbell Row', muscle_groups: ['back'], category: 'strength' },
    { name: 'Single Arm Landmine Press', muscle_groups: ['shoulders', 'chest'], category: 'strength' },
    { name: 'Z Press', muscle_groups: ['shoulders'], category: 'strength' },
    { name: 'Meadows Row', muscle_groups: ['back'], category: 'strength' },
    { name: 'Pendlay Row', muscle_groups: ['back'], category: 'strength' },
    { name: 'Safety Bar Squat', muscle_groups: ['legs'], category: 'strength' },
    { name: 'Belt Squat', muscle_groups: ['legs'], category: 'strength' },
    { name: 'Nordic Curl', muscle_groups: ['hamstrings'], category: 'strength' },
    { name: 'Sissy Squat', muscle_groups: ['quads'], category: 'strength' },
  ];
}

export async function getExercises(search = '', filter = ''): Promise<Exercise[]> {
  let sql = 'SELECT * FROM exercises';
  const binds: any[] = [];
  const wheres: string[] = [];
  if (search) {
    wheres.push('name LIKE ?');
    binds.push(`%${search}%`);
  }
  if (filter) {
    wheres.push('muscle_groups LIKE ?');
    binds.push(`%${filter}%`);
  }
  if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
  sql += ' ORDER BY is_custom ASC, name ASC';
  const res = await post('exec', { sql, bind: binds.length ? binds : undefined, rowMode: 'object' });
  return (res.rows || []).map((r: any) => ({
    ...r,
    muscle_groups: r.muscle_groups || '[]',
  }));
}

export async function addCustomExercise(name: string, muscleGroups: string[], description = ''): Promise<number> {
  const res = await post('exec', {
    sql: `INSERT INTO exercises (name, muscle_groups, category, description, is_custom) VALUES (?, ?, 'strength', ?, 1)`,
    bind: [name, JSON.stringify(muscleGroups), description || null],
  });
  // return last id via another query simple
  const idRes = await post('exec', { sql: 'SELECT last_insert_rowid() as id', rowMode: 'object' });
  return idRes.rows?.[0]?.id || 0;
}

export async function updateExercise(id: number, name: string, muscleGroups: string[], description = '') {
  await post('exec', {
    sql: `UPDATE exercises SET name=?, muscle_groups=?, description=? WHERE id=? AND is_custom=1`,
    bind: [name, JSON.stringify(muscleGroups), description || null, id],
  });
}

export async function deleteExercise(id: number) {
  await post('exec', {
    sql: `DELETE FROM exercises WHERE id=? AND is_custom=1`,
    bind: [id],
  });
}

export async function createWorkout(name?: string, notes?: string): Promise<number> {
  const now = new Date().toISOString();
  await post('exec', {
    sql: `INSERT INTO workouts (date, name, notes) VALUES (?, ?, ?)`,
    bind: [now, name || null, notes || null],
  });
  const idRes = await post('exec', { sql: 'SELECT last_insert_rowid() as id', rowMode: 'object' });
  return idRes.rows?.[0]?.id || 0;
}

export async function addWorkoutExercise(workoutId: number, exerciseId: number, order: number): Promise<number> {
  await post('exec', {
    sql: `INSERT INTO workout_exercises (workout_id, exercise_id, exercise_order) VALUES (?, ?, ?)`,
    bind: [workoutId, exerciseId, order],
  });
  const idRes = await post('exec', { sql: 'SELECT last_insert_rowid() as id', rowMode: 'object' });
  return idRes.rows?.[0]?.id || 0;
}

export async function addSet(workoutExerciseId: number, setOrder: number, weight?: number, reps?: number, rpe?: number, notes?: string) {
  await post('exec', {
    sql: `INSERT INTO sets (workout_exercise_id, set_order, weight_kg, reps, rpe, notes) VALUES (?, ?, ?, ?, ?, ?)`,
    bind: [workoutExerciseId, setOrder, weight ?? null, reps ?? null, rpe ?? null, notes || null],
  });
}

export async function updateSet(id: number, weight?: number, reps?: number, rpe?: number, notes?: string) {
  await post('exec', {
    sql: `UPDATE sets SET weight_kg=?, reps=?, rpe=?, notes=? WHERE id=?`,
    bind: [weight ?? null, reps ?? null, rpe ?? null, notes || null, id],
  });
}

export async function deleteSet(id: number) {
  await post('exec', { sql: `DELETE FROM sets WHERE id=?`, bind: [id] });
}

export async function getWorkouts(): Promise<Workout[]> {
  const res = await post('exec', {
    sql: 'SELECT * FROM workouts ORDER BY date DESC',
    rowMode: 'object',
  });
  return res.rows || [];
}

export async function getWorkoutDetail(workoutId: number): Promise<WorkoutDetail | null> {
  const wRes = await post('exec', {
    sql: 'SELECT * FROM workouts WHERE id=?',
    bind: [workoutId],
    rowMode: 'object',
  });
  const w = wRes.rows?.[0];
  if (!w) return null;

  const weRes = await post('exec', {
    sql: `SELECT we.id, we.exercise_order, e.id as exercise_id, e.name, e.muscle_groups 
          FROM workout_exercises we 
          JOIN exercises e ON e.id=we.exercise_id 
          WHERE we.workout_id=? ORDER BY we.exercise_order`,
    bind: [workoutId],
    rowMode: 'object',
  });

  const exercises = [];
  for (const we of weRes.rows || []) {
    const sRes = await post('exec', {
      sql: 'SELECT * FROM sets WHERE workout_exercise_id=? ORDER BY set_order',
      bind: [we.id],
      rowMode: 'object',
    });
    exercises.push({
      id: we.id,
      exercise_id: we.exercise_id,
      name: we.name,
      muscle_groups: we.muscle_groups || '[]',
      order: we.exercise_order,
      sets: sRes.rows || [],
    });
  }

  return { ...w, exercises };
}

export async function deleteWorkout(id: number) {
  await post('exec', { sql: 'DELETE FROM workouts WHERE id=?', bind: [id] });
}

export async function duplicateWorkout(sourceId: number): Promise<number> {
  const src = await getWorkoutDetail(sourceId);
  if (!src) throw new Error('source not found');
  const newId = await createWorkout(src.name ? src.name + ' (copy)' : undefined, src.notes || undefined);

  let exOrder = 1;
  for (const ex of src.exercises) {
    const weId = await addWorkoutExercise(newId, ex.exercise_id, exOrder++);
    let setOrder = 1;
    for (const s of ex.sets) {
      await addSet(weId, setOrder++, s.weight_kg ?? undefined, s.reps ?? undefined, s.rpe ?? undefined, s.notes ?? undefined);
    }
  }
  return newId;
}

export async function getExerciseHistory(exerciseId: number): Promise<any[]> {
  // simple history of last sessions for this exercise: date + best set + volume
  const res = await post('exec', {
    sql: `SELECT w.date, w.id as workout_id,
                 MAX(s.weight_kg) as max_weight,
                 SUM(s.weight_kg * s.reps) as volume,
                 COUNT(s.id) as sets
          FROM sets s
          JOIN workout_exercises we ON we.id = s.workout_exercise_id
          JOIN workouts w ON w.id = we.workout_id
          WHERE we.exercise_id = ?
          GROUP BY w.id ORDER BY w.date DESC LIMIT 20`,
    bind: [exerciseId],
    rowMode: 'object',
  });
  return res.rows || [];
}

// volume helper exposed
export function calcVolume(weight: number | null | undefined, reps: number | null | undefined): number {
  if (!weight || !reps) return 0;
  return weight * reps;
}

// ========== PLANS ==========

export async function createPlan(name: string, notes?: string): Promise<number> {
  await post('exec', {
    sql: `INSERT INTO plans (name, notes) VALUES (?, ?)`,
    bind: [name, notes || null],
  });
  const idRes = await post('exec', { sql: 'SELECT last_insert_rowid() as id', rowMode: 'object' });
  return idRes.rows?.[0]?.id || 0;
}

export async function addPlanExercise(
  planId: number,
  exerciseId: number,
  order: number,
  setsCount: number,
  defaultWeight?: number,
  defaultReps?: number
): Promise<number> {
  await post('exec', {
    sql: `INSERT INTO plan_exercises (plan_id, exercise_id, exercise_order, sets_count, default_weight_kg, default_reps)
          VALUES (?, ?, ?, ?, ?, ?)`,
    bind: [planId, exerciseId, order, setsCount, defaultWeight ?? null, defaultReps ?? null],
  });
  const idRes = await post('exec', { sql: 'SELECT last_insert_rowid() as id', rowMode: 'object' });
  return idRes.rows?.[0]?.id || 0;
}

export async function getPlans(): Promise<any[]> {
  // include simple exercise count for UI
  const res = await post('exec', {
    sql: `SELECT p.*, COUNT(pe.id) as exercise_count 
          FROM plans p 
          LEFT JOIN plan_exercises pe ON pe.plan_id = p.id 
          GROUP BY p.id 
          ORDER BY p.created_at DESC`,
    rowMode: 'object',
  });
  return res.rows || [];
}

export async function getPlanDetail(planId: number): Promise<{ plan: Plan; exercises: PlanExercise[] } | null> {
  const pRes = await post('exec', {
    sql: 'SELECT * FROM plans WHERE id=?',
    bind: [planId],
    rowMode: 'object',
  });
  const plan = pRes.rows?.[0];
  if (!plan) return null;

  const peRes = await post('exec', {
    sql: `SELECT pe.*, e.name, e.muscle_groups
          FROM plan_exercises pe
          JOIN exercises e ON e.id = pe.exercise_id
          WHERE pe.plan_id = ?
          ORDER BY pe.exercise_order`,
    bind: [planId],
    rowMode: 'object',
  });

  return {
    plan,
    exercises: peRes.rows || [],
  };
}

export async function deletePlan(id: number) {
  await post('exec', { sql: 'DELETE FROM plans WHERE id=?', bind: [id] });
}

// Start a workout from a plan: creates workout + pre-populates workout_exercises + sets with planned defaults
export async function startWorkoutFromPlan(planId: number): Promise<number> {
  const detail = await getPlanDetail(planId);
  if (!detail) throw new Error('plan not found');

  const workoutId = await createWorkout(detail.plan.name, detail.plan.notes || undefined);

  let exOrder = 1;
  for (const pe of detail.exercises) {
    const weId = await addWorkoutExercise(workoutId, pe.exercise_id, exOrder++);

    const w = pe.default_weight_kg ?? undefined;
    const r = pe.default_reps ?? undefined;
    const count = pe.sets_count || 3;

    for (let s = 1; s <= count; s++) {
      await addSet(weId, s, w, r);
      // completed defaults to 0
    }
  }
  return workoutId;
}

// Helper to update a set's completed flag
export async function markSetCompleted(setId: number, completed: boolean) {
  await post('exec', {
    sql: `UPDATE sets SET completed = ? WHERE id = ?`,
    bind: [completed ? 1 : 0, setId],
  });
}
