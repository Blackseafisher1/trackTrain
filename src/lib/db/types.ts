// DB types. Mirror the relational schema in GymTrack_Local_Spezifikation.md
// Keep simple. No extra fields yet.

export interface Exercise {
  id: number;
  name: string;
  muscle_groups: string; // JSON string e.g. '["chest","triceps"]'
  category: 'strength' | 'cardio';
  description?: string | null;
  is_custom: number; // 0 default, 1 user
  created_at?: string;
}

export interface Workout {
  id: number;
  date: string;
  name?: string | null;
  notes?: string | null;
  duration_minutes?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface WorkoutExercise {
  id: number;
  workout_id: number;
  exercise_id: number;
  exercise_order: number;
}

export interface Set {
  id: number;
  workout_exercise_id: number;
  set_order: number;
  weight_kg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  notes?: string | null;
  completed?: number | null;  // 0 = not done, 1 = completed (persisted beyond UI)
  created_at?: string;
}

// Joined view for UI
export interface WorkoutDetail extends Workout {
  exercises: Array<{
    id: number;
    exercise_id: number;
    name: string;
    muscle_groups: string;
    order: number;
    rest_seconds?: number;
    superset_group?: number | null;
    sets: Set[];
  }>;
}

export interface ProgressStats {
  maxWeight: number;
  totalVolume: number;
  totalSets: number;
  prs: number; // count of PRs in history or simple
}

// Plans
export interface Plan {
  id: number;
  name: string;
  notes?: string | null;
  created_at?: string;
}

export interface PlanExercise {
  id: number;
  plan_id: number;
  exercise_id: number;
  exercise_order: number;
  sets_count: number;
  default_weight_kg?: number | null;
  default_reps?: number | null;
  default_rest_seconds?: number | null;
  superset_group?: number | null;
  name?: string; // joined
  muscle_groups?: string;
}
