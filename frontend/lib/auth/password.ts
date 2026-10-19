// Password policy validation and secure generator helper
// Enforces:
// 1. Minimum 8 characters
// 2. At least one uppercase letter (A-Z)
// 3. At least one number (0-9)
// 4. At least one special symbol (!@#$%^&*()_+-=[]{};':"|,.<>/?~`)

export interface PasswordCriteria {
  minLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

// Check each individual criteria for the password
export function checkPasswordCriteria(password: string): PasswordCriteria {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password),
  };
}

// Return true only if all criteria are satisfied
export function isPasswordValid(password: string): boolean {
  const c = checkPasswordCriteria(password);
  return c.minLength && c.hasUppercase && c.hasNumber && c.hasSpecial;
}

// Generate a random secure password that meets all 4 requirements
export function generateSecurePassword(length = 16): string {
  const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowers = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%^&*_-+=";

  // Guarantee at least one character from each required category
  const guaranteed = [
    uppers[Math.floor(Math.random() * uppers.length)],
    lowers[Math.floor(Math.random() * lowers.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  const allChars = uppers + lowers + numbers + symbols;
  const remainingLength = Math.max(length, 12) - guaranteed.length;
  const extraChars: string[] = [];

  // Use browser crypto API when available
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const randomBytes = new Uint32Array(remainingLength);
    window.crypto.getRandomValues(randomBytes);
    for (let i = 0; i < remainingLength; i++) {
      extraChars.push(allChars[randomBytes[i] % allChars.length]);
    }
  } else {
    for (let i = 0; i < remainingLength; i++) {
      extraChars.push(allChars[Math.floor(Math.random() * allChars.length)]);
    }
  }

  // Shuffle array using Fisher-Yates
  const combined = [...guaranteed, ...extraChars];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined.join("");
}
