import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0d1117',
        surface: '#161b22',
        border:  '#30363d',
        muted:   '#21262d',
        'text-primary':   '#f0f6fc',
        'text-secondary': '#8b949e',
        'text-muted':     '#7d8590',
        green:   '#3fb950',
        red:     '#f85149',
        yellow:  '#d29922',
        blue:    '#58a6ff',
        purple:  '#bc8cff',
      },
    },
  },
  plugins: [],
}
export default config
