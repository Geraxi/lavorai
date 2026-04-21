/**
 * Policy password comune a signup + reset.
 * Requisiti minimi: 8+ caratteri, almeno 1 maiuscola, 1 minuscola, 1 numero.
 */

export interface PasswordCheckResult {
  ok: boolean;
  message: string;
}

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "12345678",
  "123456789",
  "qwerty123",
  "letmein1",
  "admin123",
  "welcome1",
  "abc12345",
  "iloveyou",
  "passw0rd",
  "password123",
  "qwertyuiop",
  "lavorai123",
]);

export function validatePassword(password: string): PasswordCheckResult {
  if (password.length < 8) {
    return { ok: false, message: "Almeno 8 caratteri." };
  }
  if (password.length > 100) {
    return { ok: false, message: "Massimo 100 caratteri." };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: "Serve almeno una lettera minuscola." };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: "Serve almeno una lettera maiuscola." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: "Serve almeno un numero." };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, message: "Password troppo comune. Scegline una diversa." };
  }
  return { ok: true, message: "" };
}
