/**
 * Fixed z-index scale. Do not invent arbitrary z-* values in UI work.
 * Matches DESIGN.md.
 */
export const zIndex = {
  base: 0,
  sticky: 20,
  overlay: 50,
  toast: 60,
} as const
