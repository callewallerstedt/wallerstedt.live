const BIRTH_YEAR = 2004;
const BIRTH_MONTH = 11;
const BIRTH_DAY = 23;
const BIRTH_TIME_ZONE = "Europe/Stockholm";

function getCurrentAge(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BIRTH_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  let age = year - BIRTH_YEAR;
  if (month < BIRTH_MONTH || (month === BIRTH_MONTH && day < BIRTH_DAY)) {
    age -= 1;
  }

  return age;
}

export const artist = {
  name: "Wallerstedt",
  shortName: "Wallerstedt",
  tagline: "Emotional piano music for late evenings, focus, and quiet rooms.",
  contact: "contact.wallerstedt@gmail.com",
  spotify: "https://open.spotify.com/artist/7qBBYMwk5wXAjSXWWhPCxK?si=YrgOKG1XSCeGS06AzwWUQQ",
  profileImage: "/media/artist-portrait.jpg",
  location: "Gothenburg, Sweden",
  bio: `Hi, I'm Wallerstedt, a ${getCurrentAge()}-year-old self-taught piano composer from Sweden writing neo-classical, cinematic piano pieces inspired by film.`,
} as const;
