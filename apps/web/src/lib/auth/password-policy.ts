const commonPasswords = new Set([
  "adminadminadmin",
  "changemechangeme",
  "letmeinletmein",
  "mirthspoolmirthspool",
  "passwordpassword",
]);

export const MIN_PASSWORD_LENGTH = 14;
export const MAX_PASSWORD_LENGTH = 128;

export type PasswordPolicyCode =
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_COMMON"
  | "PASSWORD_CONTAINS_IDENTITY";

export interface PasswordPolicyResult {
  readonly valid: boolean;
  readonly codes: readonly PasswordPolicyCode[];
}

export function evaluatePasswordPolicy(input: {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}): PasswordPolicyResult {
  const codes: PasswordPolicyCode[] = [];
  const normalizedPassword = input.password.toLocaleLowerCase("en-US");
  const localPart =
    input.email.split("@", 1)[0]?.toLocaleLowerCase("en-US") ?? "";
  const identityTerms = [
    localPart,
    ...input.name.toLocaleLowerCase("en-US").split(/\s+/u),
  ].filter((term) => term.length >= 4);

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    codes.push("PASSWORD_TOO_SHORT");
  }
  if (input.password.length > MAX_PASSWORD_LENGTH) {
    codes.push("PASSWORD_TOO_LONG");
  }
  if (commonPasswords.has(normalizedPassword)) {
    codes.push("PASSWORD_COMMON");
  }
  if (identityTerms.some((term) => normalizedPassword.includes(term))) {
    codes.push("PASSWORD_CONTAINS_IDENTITY");
  }

  return Object.freeze({
    codes: Object.freeze(codes),
    valid: codes.length === 0,
  });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}
