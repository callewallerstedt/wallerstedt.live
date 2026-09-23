/**
 * Spending categories and the rules that sort a bank line into one. Pure so it
 * is easy to test and cheap to re-run over the whole history when rules change.
 */

export type FinanceCategory = {
  id: string;
  label: string;
  emoji: string;
  /** Money in rather than money out. */
  income?: boolean;
  /** Not spending: moving money between own accounts or into investments. */
  neutral?: boolean;
  color: string;
};

export const FINANCE_CATEGORIES: FinanceCategory[] = [
  { id: "groceries", label: "Groceries", emoji: "🛒", color: "oklch(0.72 0.15 150)" },
  { id: "fastfood", label: "Fast food & takeaway", emoji: "🍔", color: "oklch(0.72 0.17 55)" },
  { id: "restaurants", label: "Restaurants & cafés", emoji: "🍽️", color: "oklch(0.68 0.16 30)" },
  { id: "car", label: "Car", emoji: "🚗", color: "oklch(0.66 0.14 250)" },
  { id: "transport", label: "Transport", emoji: "🚆", color: "oklch(0.7 0.12 220)" },
  { id: "housing", label: "Housing & bills", emoji: "🏠", color: "oklch(0.62 0.1 280)" },
  { id: "subscriptions", label: "Subscriptions", emoji: "🔁", color: "oklch(0.66 0.18 310)" },
  { id: "shopping", label: "Shopping", emoji: "🛍️", color: "oklch(0.7 0.16 350)" },
  { id: "hobbies", label: "Hobbies & music gear", emoji: "🎹", color: "oklch(0.74 0.14 190)" },
  { id: "entertainment", label: "Fun & going out", emoji: "🎉", color: "oklch(0.76 0.15 90)" },
  { id: "health", label: "Health & gym", emoji: "💪", color: "oklch(0.7 0.13 170)" },
  { id: "travel", label: "Travel", emoji: "✈️", color: "oklch(0.68 0.13 235)" },
  { id: "swish", label: "Swish to people", emoji: "📲", color: "oklch(0.64 0.08 260)" },
  { id: "cash", label: "Cash", emoji: "💵", color: "oklch(0.6 0.05 140)" },
  { id: "fees", label: "Fees, tax & insurance", emoji: "🧾", color: "oklch(0.55 0.06 60)" },
  { id: "other", label: "Other", emoji: "❔", color: "oklch(0.6 0.02 260)" },
  { id: "savings", label: "Savings & investing", emoji: "📈", neutral: true, color: "oklch(0.7 0.14 145)" },
  { id: "transfer", label: "Own transfers", emoji: "🔄", neutral: true, color: "oklch(0.55 0.02 260)" },
  { id: "income", label: "Income", emoji: "💰", income: true, color: "oklch(0.72 0.17 150)" },
];

export const CATEGORY_BY_ID = new Map(FINANCE_CATEGORIES.map((category) => [category.id, category]));

export const SPENDING_CATEGORY_IDS = FINANCE_CATEGORIES.filter(
  (category) => !category.income && !category.neutral,
).map((category) => category.id);

export function isCategoryId(value: string) {
  return CATEGORY_BY_ID.has(value);
}

export function isSpendingCategory(id: string) {
  const category = CATEGORY_BY_ID.get(id);
  return Boolean(category && !category.income && !category.neutral);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word match that also works for Å, Ä and Ö (JavaScript's \b does not). */
function words(list: string[], flags = "u") {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${list.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`,
    flags,
  );
}

const MERCHANT_NOISE = words(
  [
    "KORTKÖP", "KORTKOP", "KÖP", "RESERVATION", "RESERVERAT", "PREL", "PRELIMINÄR", "BETALNING",
    "BG", "PG", "AUTOGIRO", "E-FAKTURA", "EFAKTURA", "DEBITERING", "CARD PURCHASE", "PURCHASE",
    "VISA", "MASTERCARD", "APPLE PAY", "GOOGLE PAY", "SEK", "EUR", "USD", "KR",
  ],
  "gu",
);

/**
 * Handelsbanken lines look like "KORTKÖP 260917 ICA NARA TORGET" or
 * "Reservation Kortköp MAX BURGERS". Strip the noise so the same shop always
 * lands on the same key.
 */
export function normalizeMerchant(text: string) {
  let value = text.toLocaleUpperCase("sv-SE");
  value = value.replace(MERCHANT_NOISE, " ");
  value = value.replace(/[*#_/\\|]+/g, " ");
  value = value.replace(/(?<![\p{L}])\d[\d.,:-]*(?![\p{L}])/gu, " ");
  value = value.replace(/\s+/g, " ").trim();
  // Chains append the store: "ICA NARA TORGET KUNGSB" → keep the first words.
  return value.split(" ").slice(0, 3).join(" ").slice(0, 60);
}

type Rule = { category: string; pattern: RegExp };

/** Order matters: the first match wins. */
const RULES: Rule[] = [
  // Money moving between own things is not spending.
  { category: "savings", pattern: words(["AVANZA", "NORDNET", "LYSA", "SAVR", "PENSIONSSPAR", "ISK", "FONDKÖP", "AKTIEKÖP", "SPARKONTO", "SPARANDE", "BITCOIN", "COINBASE", "SAFELLO", "BINANCE", "KRAKEN"]) },
  { category: "transfer", pattern: words(["ÖVERFÖRING", "OVERFORING", "ÖVERF", "EGET KONTO", "EGEN ÖVERF", "INTERN ÖVERF", "MELLAN EGNA", "TRANSFER"]) },
  { category: "cash", pattern: words(["UTTAG", "BANKOMAT", "ATM", "KONTANTUTTAG", "CASH"]) },

  // Food.
  { category: "fastfood", pattern: words(["MCDONALDS", "MCDONALD'S", "MC DONALDS", "MAX BURGERS", "MAX HAMBURGARE", "MAX", "BURGER KING", "SUBWAY", "KFC", "SIBYLLA", "PIZZA HUT", "DOMINOS", "DOMINO'S", "FOODORA", "WOLT", "UBER EATS", "UBEREATS", "JUST EAT", "ONLINEPIZZA", "PIZZERIA", "PIZZA", "KEBAB", "SUSHI", "THAI", "FALAFEL", "BASTARD BURGERS", "PHILS BURGER", "FRASSES", "O'LEARYS", "7-ELEVEN", "7 ELEVEN", "PRESSBYRÅN", "PRESSBYRAN", "GRILL", "GATUKÖK", "STARBUCKS", "DUNKIN", "TACO BAR", "POKE"]) },
  { category: "groceries", pattern: words(["ICA", "COOP", "WILLYS", "HEMKÖP", "HEMKOP", "LIDL", "CITY GROSS", "NETTO", "MATHEM", "MATSMART", "TEMPO", "MATHALLEN", "SYSTEMBOLAGET", "LINAS MATKASSE", "HELLOFRESH", "GODIS", "CANDY"]) },
  { category: "restaurants", pattern: words(["RESTAURANG", "RESTAURANT", "BISTRO", "CAFE", "CAFÉ", "KAFÉ", "KONDITORI", "BAGERI", "ESPRESSO HOUSE", "WAYNES", "WAYNE'S", "BRASSERIE", "TRATTORIA", "KROG", "PUB", "STEAKHOUSE", "JOE & THE JUICE", "JOE AND THE JUICE"]) },

  // Car: fuel, charging, parking, service, tolls.
  { category: "car", pattern: words(["CIRCLE K", "OKQ8", "PREEM", "ST1", "SHELL", "INGO", "QSTAR", "BENSIN", "DIESEL", "TESLA", "SUPERCHARGER", "IONITY", "CLEVER", "EASYPARK", "EASY PARK", "PARKERING", "APCOA", "AIMO", "Q-PARK", "QPARK", "PARKSTER", "BILTVÄTT", "DÄCK", "MECONOMEN", "BILIA", "BESIKTNING", "OPUS", "BILPROVNING", "TRÄNGSELSKATT", "VÄGTULL", "BROAVGIFT", "BILFÖRSÄKRING", "FORDONSSKATT"]) },
  { category: "transport", pattern: words(["SL", "VÄSTTRAFIK", "VASTTRAFIK", "SKÅNETRAFIKEN", "SJ", "MTR", "FLYGBUSSARNA", "ARLANDA EXPRESS", "UBER", "BOLT", "TAXI", "VOI", "LIME", "TIER", "HALLANDSTRAFIKEN", "ÖRESUNDSTÅG"]) },

  // Recurring digital services.
  { category: "subscriptions", pattern: words(["SPOTIFY", "NETFLIX", "HBO", "DISNEY", "VIAPLAY", "TV4", "YOUTUBE", "APPLE.COM", "APPLE COM", "ITUNES", "ICLOUD", "GOOGLE", "OPENAI", "CHATGPT", "ANTHROPIC", "CLAUDE", "MIDJOURNEY", "ADOBE", "MICROSOFT", "DROPBOX", "NOTION", "GITHUB", "VERCEL", "CANVA", "STORYTEL", "BOOKBEAT", "NEXTORY", "AUDIBLE", "PATREON", "TWITCH", "DISCORD", "NINTENDO", "XBOX", "PLAYSTATION", "STEAM", "AMAZON PRIME", "PRIME VIDEO", "XAI", "X.AI", "GROK", "SUPERGROK", "CAPCUT", "DISTROKID", "SPLICE", "TELIA", "TELE2", "HALLON", "COMVIQ", "VIMLA"]) },

  // Home.
  { category: "housing", pattern: words(["HYRA", "HYRESAVI", "BRF", "VATTENFALL", "ELLEVIO", "E.ON", "FORTUM", "TIBBER", "GREENELY", "ELHANDEL", "BREDBAND", "BAHNHOF", "BREDBAND2", "OWNIT", "COM HEM", "TELENOR", "IKEA", "BAUHAUS", "JULA", "BYGGMAX", "HORNBACH", "CLAS OHLSON", "RUSTA", "ÖOB"]) },

  { category: "health", pattern: words(["APOTEK", "APOTEKET", "KRONANS", "APOTEA", "HJÄRTAT", "SATS", "FRISKIS", "NORDIC WELLNESS", "FITNESS24SEVEN", "ACTIC", "GYM", "TANDLÄKARE", "FOLKTANDVÅRDEN", "VÅRDCENTRAL", "KRY", "MIN DOKTOR", "SYNSAM", "SPECSAVERS", "FRISÖR", "BARBER"]) },
  { category: "hobbies", pattern: words(["THOMANN", "MUSIKÖRAT", "4SOUND", "SWEETWATER", "ROLAND", "YAMAHA", "NATIVE INSTRUMENTS", "PLUGIN BOUTIQUE", "WAVES", "ABLETON", "IMAGE-LINE", "STEINBERG", "SPITFIRE", "ARTURIA", "KORG", "PIANO", "WEBHALLEN", "INET", "DUSTIN", "KJELL", "CYBERPHOTO", "SCANDINAVIAN PHOTO", "STADIUM", "XXL", "INTERSPORT", "DECATHLON"]) },
  { category: "entertainment", pattern: words(["SF BIO", "FILMSTADEN", "BIO", "TICKETMASTER", "TICKSTER", "LIVE NATION", "EVENTIM", "KONSERT", "NATTKLUBB", "BOWLING", "LISEBERG", "GRÖNA LUND", "PADEL", "MATCHI", "SVENSKA SPEL", "ATG", "UNIBET", "BET365"]) },
  { category: "travel", pattern: words(["SAS", "NORWEGIAN", "RYANAIR", "WIZZ", "EASYJET", "LUFTHANSA", "KLM", "FINNAIR", "AIRBNB", "BOOKING.COM", "HOTELS.COM", "EXPEDIA", "HOTEL", "HOTELL", "SCANDIC", "STRAWBERRY", "CLARION", "QUALITY HOTEL", "ELITE HOTEL", "HOSTEL", "STENA LINE", "VIKING LINE", "TALLINK", "DUTY FREE"]) },
  { category: "shopping", pattern: words(["AMAZON", "AMZN", "ZALANDO", "H&M", "H & M", "LINDEX", "KAPPAHL", "DRESSMANN", "JACK & JONES", "WEEKDAY", "ARKET", "NIKE", "ADIDAS", "JD SPORTS", "FOOTWAY", "BOOZT", "ELLOS", "CDON", "TEMU", "SHEIN", "ALIEXPRESS", "ELGIGANTEN", "MEDIAMARKT", "MEDIA MARKT", "NETONNET", "KOMPLETT", "APPLE STORE", "ÅHLÉNS", "AHLENS", "KICKS", "LYKO", "BLOCKET", "TRADERA", "VINTED", "SELLPY", "PLANTAGEN", "NORMAL", "FLYING TIGER", "LAGERHAUS", "ADLIBRIS", "BOKUS", "KLARNA", "QLIRO"]) },
  { category: "fees", pattern: words(["SKATTEVERKET", "CSN", "FÖRSÄKRING", "IF SKADEFÖRSÄKRING", "TRYGG-HANSA", "TRYGG HANSA", "FOLKSAM", "LÄNSFÖRSÄKRINGAR", "GJENSIDIGE", "AVGIFT", "ÅRSAVGIFT", "KORTAVGIFT", "RÄNTA", "INKASSO", "KRONOFOGDEN", "PÅMINNELSEAVGIFT"]) },
  { category: "swish", pattern: words(["SWISH"]) },
];

const INCOME_PATTERN = words(["LÖN", "LÖNEUTBETALNING", "SALARY", "ARVODE", "UTDELNING", "FÖRSÄKRINGSKASSAN", "CSN", "SKATTEÅTERBÄRING", "ÅTERBÄRING", "DISTROKID", "WALLERSTEDT PRODUCTIONS", "RÄNTA", "INSÄTTNING"]);
const INCOMING_TRANSFER = words(["ÖVERFÖRING", "OVERFORING", "EGET KONTO", "MELLAN EGNA", "TRANSFER"]);
const INCOMING_SAVINGS = words(["AVANZA", "NORDNET"]);

export type CategorizeInput = {
  text: string;
  amountCents: number;
};

/** Pick the built-in category for a bank line. Rules the owner saved win over this. */
export function categorize({ text, amountCents }: CategorizeInput): string {
  const upper = text.toLocaleUpperCase("sv-SE");
  if (amountCents > 0) {
    if (INCOMING_TRANSFER.test(upper)) return "transfer";
    if (INCOMING_SAVINGS.test(upper)) return "savings";
    if (INCOME_PATTERN.test(upper)) return "income";
    // Refunds from a shop are negative spending in that shop's category.
    for (const rule of RULES) {
      if (rule.category === "swish" || rule.category === "cash") continue;
      if (rule.pattern.test(upper)) return rule.category;
    }
    return "income";
  }
  for (const rule of RULES) {
    if (rule.pattern.test(upper)) return rule.category;
  }
  return "other";
}

/**
 * Two lines on two of the owner's accounts, same day (±2), same amount with
 * opposite signs, are one transfer and not spending or income.
 */
export function findTransferPairs<T extends { id: string; accountId: string; amountCents: number; day: number }>(
  rows: T[],
) {
  const paired = new Set<string>();
  const byAmount = new Map<number, T[]>();
  for (const row of rows) {
    const key = Math.abs(row.amountCents);
    const list = byAmount.get(key) ?? [];
    list.push(row);
    byAmount.set(key, list);
  }
  for (const list of byAmount.values()) {
    if (list.length < 2) continue;
    const outs = list.filter((row) => row.amountCents < 0).sort((a, b) => a.day - b.day);
    const ins = list.filter((row) => row.amountCents > 0).sort((a, b) => a.day - b.day);
    for (const out of outs) {
      const match = ins.find(
        (candidate) =>
          !paired.has(candidate.id) &&
          candidate.accountId !== out.accountId &&
          Math.abs(candidate.day - out.day) <= 2,
      );
      if (match) {
        paired.add(out.id);
        paired.add(match.id);
      }
    }
  }
  return paired;
}
