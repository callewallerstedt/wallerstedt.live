export const accents = ["ember", "sun", "ice"] as const

export type Accent = (typeof accents)[number]

export const accentMeta: Record<
  Accent,
  { label: string; hint: string }
> = {
  ember: { label: "Ember", hint: "Red–orange" },
  sun: { label: "Sun", hint: "Yellow–orange" },
  ice: { label: "Ice", hint: "Blue–light blue" },
}

export const ACCENT_STORAGE_KEY = "calle-accent"
export const DEFAULT_ACCENT: Accent = "ember"

export function isAccent(value: string | null | undefined): value is Accent {
  return accents.includes(value as Accent)
}
