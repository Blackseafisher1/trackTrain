import { mount } from 'svelte'
import { get } from 'svelte/store'
import './app.css'
import App from './App.svelte'
import { settings } from './lib/settings'
import { applyAccentColor } from './lib/theme'

// Apply saved accent color on startup (before app mounts)
const currentSettings = get(settings)
applyAccentColor(currentSettings.accentColor ?? '#06b6d4')

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
