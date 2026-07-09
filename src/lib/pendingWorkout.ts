// Simple cross-component bridge for starting a workout session.
// Keep simple: set the id from Workouts, the active logger shows inside Workouts tab.
// No full store to keep deps zero.

let pendingId: number | null = null;

export function setPendingWorkout(id: number) {
  pendingId = id;
}

export function consumePendingWorkout(): number | null {
  const id = pendingId;
  pendingId = null;
  return id;
}

export function clearPendingWorkout() {
  pendingId = null;
}
