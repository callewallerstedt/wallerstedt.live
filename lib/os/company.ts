export const COMPANY = {
  name: "Wallerstedt Productions AB",
  shortName: "WP AB",
  owner: "Calle Wallerstedt",
  vat: "SE559559790601",
  orgNumber: "559559-7906",
  /**
   * Registry details. Taken from the public company record rather than from
   * Bolagsverket's API, so correct them here if anything has changed.
   */
  registry: {
    verksamhetsbeskrivning:
      "Musikproduktion, artistverksamhet samt investering i värdepapper och därmed förenlig verksamhet.",
    seat: "Kungsbacka kommun, Hallands län",
    registeredOn: "2025-12-05",
    shareCapitalSek: 25_000,
    legalForm: "Privat aktiebolag",
    boardMember: "Calle Wallerstedt",
    deputy: "Lars Wallerstedt",
  },
  locale: "sv-SE",
  timeZone: "Europe/Berlin",
  currency: "SEK",
  corpTaxRate: 0.206,
  spotifyArtistId: "7qBBYMwk5wXAjSXWWhPCxK",
  githubUser: "callewallerstedt",
  accounts: {
    bank: 1930,
    capitalInsurance: 1385,
    taxAccount: 1630,
    corpTax: 2510,
    vatOut: 2610,
    vatIn: 2641,
    vat: 2650,
    withholding: 2710,
    employer: 2730,
    otherLiability: 2893,
  },
} as const;

export const LEDGER_BALANCE_ACCOUNTS = [
  COMPANY.accounts.bank,
  COMPANY.accounts.capitalInsurance,
  COMPANY.accounts.taxAccount,
  COMPANY.accounts.corpTax,
  COMPANY.accounts.vatOut,
  COMPANY.accounts.vatIn,
  COMPANY.accounts.vat,
  COMPANY.accounts.withholding,
  COMPANY.accounts.employer,
  COMPANY.accounts.otherLiability,
] as const;
