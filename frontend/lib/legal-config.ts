// Central configuration for AutoPulse legal documents and disclosures
// Ensures company details, product name, dates, and contact information remain consistent

export const LEGAL_CONFIG = {
  // Legal company entity name
  COMPANY_NAME: "TODO: Company Legal Name (probably MB Stack, ask my manager)",
  // Brand and product name
  PRODUCT_NAME: "AutoPulse",
  // Public contact email address for privacy and legal requests
  CONTACT_EMAIL: "TODO: Contact Email",
  // Effective date of terms and privacy policy
  LAST_UPDATED: "3 November 2026",
  // Legal jurisdiction and governing law
  GOVERNING_LAW: "TODO: Governing Law",
  // Minimum age required to use the service
  MIN_AGE: "TODO: Minimum Age",
} as const;

export const {
  COMPANY_NAME,
  PRODUCT_NAME,
  CONTACT_EMAIL,
  LAST_UPDATED,
  GOVERNING_LAW,
  MIN_AGE,
} = LEGAL_CONFIG;
