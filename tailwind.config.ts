import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/games/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Mission Control 1960s Theme
        mission: {
          // Core console colors
          green: '#33ff33',        // Radar/terminal green
          'green-dim': '#1a8c1a',  // Dimmed green
          'green-glow': '#66ff66', // Bright green glow
          amber: '#ffbf00',        // Warning lights
          'amber-dim': '#997300',  // Dimmed amber
          red: '#ff3333',          // Alert/danger
          'red-dim': '#991f1f',    // Dimmed red
          cream: '#f5f5dc',        // Labels, text

          // Console surfaces
          dark: '#0d0d1a',         // Deep console background
          panel: '#1a1a2e',        // Panel background
          'panel-light': '#2d2d44', // Lighter panel
          steel: '#71797E',        // Metal accents
          'steel-dark': '#4a5056', // Darker steel

          // Card colors
          'eng-green': '#2d5a3d',  // Engineering card background
          'pol-red': '#5a2d3d',    // Political card background
          'move-blue': '#2d3d5a',  // Movement card background
          'str-gold': '#5a4a2d',   // Strength card background
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        display: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 10px #33ff33, 0 0 20px #33ff3366',
        'glow-amber': '0 0 10px #ffbf00, 0 0 20px #ffbf0066',
        'glow-red': '0 0 10px #ff3333, 0 0 20px #ff333366',
        'inset-panel': 'inset 0 2px 4px rgba(0,0,0,0.5), inset 0 -1px 2px rgba(255,255,255,0.1)',
        'button-3d': '0 4px 0 #1a1a2e, 0 6px 10px rgba(0,0,0,0.5)',
        'button-pressed': '0 1px 0 #1a1a2e, 0 2px 4px rgba(0,0,0,0.3)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scan-line': 'scan-line 8s linear infinite',
        'flicker': 'flicker 0.15s ease-in-out infinite',
        'dice-roll': 'dice-roll 1.5s ease-out',
        'card-draw': 'card-draw 0.8s ease-out',
        'comet-advance': 'comet-advance 0.6s ease-in-out',
        'card-flip': 'card-flip 0.6s ease-in-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'flicker': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        'dice-roll': {
          '0%': { transform: 'rotate(0deg) scale(0.5)', opacity: '0' },
          '20%': { transform: 'rotate(180deg) scale(1.2)', opacity: '1' },
          '40%': { transform: 'rotate(360deg) scale(0.9)' },
          '60%': { transform: 'rotate(540deg) scale(1.1)' },
          '80%': { transform: 'rotate(680deg) scale(1)' },
          '100%': { transform: 'rotate(720deg) scale(1)' },
        },
        'card-draw': {
          '0%': { transform: 'translateY(-20px) rotate(-5deg) scale(0.8)', opacity: '0' },
          '50%': { transform: 'translateY(10px) rotate(2deg) scale(1.05)' },
          '100%': { transform: 'translateY(0) rotate(0deg) scale(1)', opacity: '1' },
        },
        'comet-advance': {
          '0%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(-5px)' },
          '100%': { transform: 'translateX(var(--advance-distance))' },
        },
        'card-flip': {
          '0%': { transform: 'rotateY(0deg)' },
          '50%': { transform: 'rotateY(90deg)' },
          '100%': { transform: 'rotateY(180deg)' },
        },
      },
      backgroundImage: {
        'panel-gradient': 'linear-gradient(180deg, #2d2d44 0%, #1a1a2e 100%)',
        'button-gradient': 'linear-gradient(180deg, #3d3d5a 0%, #2d2d44 50%, #1a1a2e 100%)',
        'screen-gradient': 'radial-gradient(ellipse at center, #1a2e1a 0%, #0d0d1a 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
