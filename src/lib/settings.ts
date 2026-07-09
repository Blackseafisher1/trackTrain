// Simple settings store. Persisted to localStorage. Keep simple.
// Default: hide per-set weight editing (assume same weight for exercise).

import { writable } from 'svelte/store';
import { applyAccentColor } from './theme';

const STORAGE_KEY = 'gymtrack_settings';

export interface AppSettings {
  showPerSetWeights: boolean;
  showDuplicateButton: boolean;
  showDeleteButton: boolean;
  accentColor: string;
  hideBrand: boolean; // hide "GymTrack" text in header for more vertical space
  ultraDarkMode: boolean; // pure black #000 for OLED dark mode
}

const defaultSettings: AppSettings = {
  showPerSetWeights: false,
  showDuplicateButton: true,
  showDeleteButton: true,
  accentColor: '#06b6d4',
  hideBrand: false,
  ultraDarkMode: false,
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

// Apply theme settings whenever they change
settings.subscribe((value) => {
  saveSettings(value);
  if (value.accentColor) {
    applyAccentColor(value.accentColor);
  }
  applyUltraDarkMode(!!value.ultraDarkMode);
});

export function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  settings.update((s) => ({ ...s, [key]: value }));
}
