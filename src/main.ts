import { mount } from 'svelte'
import { get } from 'svelte/store'
import './app.css'
import App from './App.svelte'
import { settings } from './lib/settings'
import { applyAccentColor, applyUltraDarkMode } from './lib/theme'

// Apply saved theme settings on startup (before app mounts)
const currentSettings = get(settings)
applyAccentColor(currentSettings.accentColor ?? '#06b6d4')
applyUltraDarkMode(!!currentSettings.ultraDarkMode)

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
