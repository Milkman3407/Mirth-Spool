import { hash, verify, type Options } from "@node-rs/argon2";

const ARGON2ID_OPTIONS: Options = Object.freeze({
  algorithm: 2,
  memoryCost: 65_536,
  outputLen: 32,
  parallelism: 1,
  timeCost: 3,
});

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID_OPTIONS);
}

export async function verifyPassword(input: {
  readonly hash: string;
  readonly password: string;
}): Promise<boolean> {
  try {
    return await verify(input.hash, input.password, ARGON2ID_OPTIONS);
  } catch {
    return false;
  }
}
