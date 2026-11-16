import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [presetWind3()],
  theme: {
    colors: {
      accent: '#ff7048',
      canvas: '#090b0e',
      ink: '#f3f1ec',
      muted: '#8c929a',
      surface: '#111419',
    },
  },
  shortcuts: {
    eyebrow: 'text-[0.68rem] font-semibold tracking-[0.18em] uppercase text-accent',
    'focus-ring':
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent',
  },
})
