// Simple settings store. Persisted to localStorage. Keep simple.
// Default: hide per-set weight editing (assume same weight for exercise).

import { writable } from 'svelte/store';

const STORAGE_KEY = 'gymtrack_settings';

export interface AppSettings {
  showPerSetWeights: boolean; // default false -> cleaner UI, only 1 weight per exercise
  showDuplicateButton: boolean; // show "dup" button in History
  showDeleteButton: boolean; // show "del" button in History
}

const defaultSettings: AppSettings = {
  showPerSetWeights: false,
  showDuplicateButton: true,
  showDeleteButton: true,
};

function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch {}
  return { ...defaultSettings };
}

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export const settings = writable<AppSettings>(loadSettings());

settings.subscribe((value) => {
  saveSettings(value);
});

export function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  settings.update((s) => ({ ...s, [key]: value }));
}
