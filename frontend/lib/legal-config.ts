// Central configuration for AutoPulse legal documents and disclosures
// Ensures company details, product name, dates, and contact information remain consistent

export const LEGAL_CONFIG = {
  // Legal company entity name
  COMPANY_NAME: "MB Stack",
  // Brand and product name
  PRODUCT_NAME: "AutoPulse",
  // Public contact email address for privacy and legal requests
  CONTACT_EMAIL: "contact@mbstack.net",
  // Effective date of terms and privacy policy
  LAST_UPDATED: "3 November 2026",
  // Legal jurisdiction and governing law
  GOVERNING_LAW: "the laws of Pakistan",
  // Minimum age required to use the service
  MIN_AGE: "18 years of age",
} as const;

export const {
  COMPANY_NAME,
  PRODUCT_NAME,
  CONTACT_EMAIL,
  LAST_UPDATED,
  GOVERNING_LAW,
  MIN_AGE,
} = LEGAL_CONFIG;
