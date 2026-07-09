<script lang="ts">
  // Settings page. Keep simple.
  // Controls UI options + custom accent + ultra dark for OLED.

  import { settings, updateSetting } from './settings';
  import { isValidAccentColor } from './theme';

  let showPerSet = $state($settings.showPerSetWeights);
  let showDup = $state($settings.showDuplicateButton);
  let showDel = $state($settings.showDeleteButton);
  let accentColor = $state($settings.accentColor);
  let hideBrand = $state($settings.hideBrand);
  let ultraDark = $state($settings.ultraDarkMode);

  $effect(() => {
    updateSetting('showPerSetWeights', showPerSet);
  });
  $effect(() => {
    updateSetting('showDuplicateButton', showDup);
  });
  $effect(() => {
    updateSetting('showDeleteButton', showDel);
  });
  $effect(() => {
    updateSetting('hideBrand', hideBrand);
  });
  $effect(() => {
    updateSetting('ultraDarkMode', ultraDark);
  });

  function handleAccentChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newColor = target.value;

    if (isValidAccentColor(newColor)) {
      accentColor = newColor;
      updateSetting('accentColor', newColor);
    } else {
      // Revert to previous valid color
      target.value = accentColor;
      alert('Please choose a color with better contrast (not too close to black or white).');
    }
  }
</script>

<div class="settings">
  <h2>Settings</h2>

  <div class="setting">
    <label>
      <input type="checkbox" bind:checked={showPerSet} />
      Show per-set weight editing
    </label>
    <p class="help">
      Off by default for cleaner UI. Only shows 1 weight per exercise (the default).
      You can still override per set when this is on.
      Turn on if you frequently change weight between sets.
    </p>
  </div>

  <div class="setting">
    <label>
      <input type="checkbox" bind:checked={showDup} />
      Show duplicate ("dup") button in History
    </label>
    <p class="help">
      Duplicating a workout creates a copy in history (e.g. to repeat a session).
    </p>
  </div>

  <div class="setting">
    <label>
      <input type="checkbox" bind:checked={showDel} />
      Show delete ("del") button in History
    </label>
    <p class="help">
      Allows deleting past workouts from history.
    </p>
  </div>

  <div class="setting">
    <label>Accent color</label>
    <input
      type="color"
      value={accentColor}
      oninput={handleAccentChange}
      style="width: 60px; height: 40px; padding: 0; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;"
    />
    <p class="help">
      Pick your accent color. Avoid very dark or very light colors for good contrast.
    </p>
  </div>

  <div class="setting">
    <label>
      <input type="checkbox" bind:checked={hideBrand} />
      Hide "GymTrack" text in header
    </label>
    <p class="help">
      Hides the brand text to give more vertical space on small screens (e.g. phones).
    </p>
  </div>

  <div class="setting">
    <label>
      <input type="checkbox" bind:checked={ultraDark} />
      Ultra dark mode for OLED (pure black #000)
    </label>
    <p class="help">
      Makes dark mode use pure black background for better contrast and battery on OLED screens.
    </p>
  </div>

  <div class="note">
    All changes saved locally. Weight and reps are still tracked per set in the background.
  </div>
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 500px;
  }

  .setting {
    border: 1px solid var(--border);
    padding: 12px;
    border-radius: 8px;
  }

  .setting label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    cursor: pointer;
  }

  .help {
    margin: 8px 0 0;
    font-size: 13px;
    opacity: 0.7;
    line-height: 1.3;
  }

  .note {
    font-size: 12px;
    opacity: 0.6;
    padding: 8px;
  }
</style>
