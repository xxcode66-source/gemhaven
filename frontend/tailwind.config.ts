import type { Config } from "tailwindcss";

// GemHaven's visual identity: a lamp-lit crystal cavern. Deep near-black rock,
// mineral accents on the four gem families. Deliberately not a flat grid.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rock: {
          void: "#050608",
          deep: "#0b0d12",
          face: "#12151d",
          edge: "#1b1f2b",
          lit: "#2a3040",
        },
        gem: {
          teal: "#3ee6c4",
          violet: "#a78bfa",
          rose: "#f472b6",
          amber: "#fbbf6a",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        facet: "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.5)",
        lamp: "0 0 60px -12px var(--glow-color, rgba(62,230,196,0.4))",
      },
      keyframes: {
        // Light travelling across a polished facet.
        shimmer: {
          "0%": { transform: "translateX(-120%) skewX(-18deg)", opacity: "0" },
          "45%": { opacity: "0.65" },
          "100%": { transform: "translateX(220%) skewX(-18deg)", opacity: "0" },
        },
        // Ambient breathing glow; colour comes from --glow-color.
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--glow-color)", opacity: "0.85" },
          "50%": { boxShadow: "0 0 28px 2px var(--glow-color)", opacity: "1" },
        },
        // Slow parallax for the cavern dust motes.
        drift: {
          "0%": { transform: "translate3d(0,0,0)" },
          "50%": { transform: "translate3d(-18px,-26px,0)" },
          "100%": { transform: "translate3d(0,0,0)" },
        },
        // Motherlode reveal: the deposit fractures open.
        crack: {
          "0%": { transform: "scale(1) rotate(0deg)", filter: "brightness(1)" },
          "18%": { transform: "scale(1.08) rotate(-1.5deg)", filter: "brightness(2.4)" },
          "34%": { transform: "scale(0.97) rotate(1.5deg)", filter: "brightness(1.2)" },
          "52%": { transform: "scale(1.04) rotate(-0.75deg)", filter: "brightness(1.9)" },
          "100%": { transform: "scale(1) rotate(0deg)", filter: "brightness(1.25)" },
        },
        riseFade: {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        // The golden deposit's ember halo — slow breathing light behind the tile.
        ember: {
          "0%, 100%": { opacity: "0.22" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        shimmer: "shimmer 2.6s ease-in-out infinite",
        pulseGlow: "pulseGlow 3.2s ease-in-out infinite",
        drift: "drift 26s ease-in-out infinite",
        crack: "crack 900ms cubic-bezier(0.22,1,0.36,1) both",
        riseFade: "riseFade 320ms ease-out both",
        ember: "ember 3.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
