import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const envelopeSchema = z
  .object({
    algorithm: z.literal("A256GCM"),
    ciphertext: z.base64(),
    nonce: z.base64(),
    tag: z.base64(),
    version: z.number().int().positive(),
  })
  .strict();

export interface CredentialBinding {
  readonly kind: string;
  readonly label: string;
  readonly sourceId: string;
}

export interface CredentialKeyring {
  readonly currentVersion: number;
  readonly keys: ReadonlyMap<number, Uint8Array>;
}

export class CredentialEnvelopeError extends Error {
  readonly code = "CREDENTIAL_ENVELOPE_INVALID";
  constructor() {
    super("Credential material could not be decrypted.");
    this.name = "CredentialEnvelopeError";
  }
}

function associatedData(binding: CredentialBinding): Buffer {
  return Buffer.from(
    JSON.stringify({
      kind: binding.kind,
      label: binding.label,
      sourceId: binding.sourceId,
    }),
    "utf8",
  );
}

function requireKey(keyring: CredentialKeyring, version: number): Uint8Array {
  const key = keyring.keys.get(version);
  if (!key || key.byteLength !== 32) throw new CredentialEnvelopeError();
  return key;
}

export function createCredentialKeyring(
  currentVersion: number,
  key: Uint8Array,
): CredentialKeyring {
  if (
    !Number.isInteger(currentVersion) ||
    currentVersion < 1 ||
    key.byteLength !== 32
  ) {
    throw new CredentialEnvelopeError();
  }
  return Object.freeze({
    currentVersion,
    keys: new Map([[currentVersion, Uint8Array.from(key)]]) as ReadonlyMap<
      number,
      Uint8Array
    >,
  });
}

export function encryptCredential(
  plaintext: Readonly<Record<string, unknown>>,
  binding: CredentialBinding,
  keyring: CredentialKeyring,
  nonceFactory: () => Uint8Array = () => randomBytes(12),
): Uint8Array {
  const key = requireKey(keyring, keyring.currentVersion);
  const nonce = nonceFactory();
  if (nonce.byteLength !== 12) throw new CredentialEnvelopeError();
  const encoded = Buffer.from(JSON.stringify(plaintext), "utf8");
  if (encoded.byteLength > 16_384) throw new CredentialEnvelopeError();
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(associatedData(binding));
  const ciphertext = Buffer.concat([cipher.update(encoded), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      algorithm: "A256GCM",
      ciphertext: ciphertext.toString("base64"),
      nonce: Buffer.from(nonce).toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      version: keyring.currentVersion,
    }),
    "utf8",
  );
}

export function decryptCredential(
  encodedEnvelope: Uint8Array,
  binding: CredentialBinding,
  keyring: CredentialKeyring,
): Readonly<Record<string, unknown>> {
  try {
    if (encodedEnvelope.byteLength > 32_768)
      throw new Error("envelope too large");
    const envelope = envelopeSchema.parse(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(encodedEnvelope),
      ),
    );
    const key = requireKey(keyring, envelope.version);
    const nonce = Buffer.from(envelope.nonce, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    if (nonce.byteLength !== 12 || tag.byteLength !== 16)
      throw new Error("invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(associatedData(binding));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("invalid credential payload");
    }
    return Object.freeze(parsed as Record<string, unknown>);
  } catch {
    throw new CredentialEnvelopeError();
  }
}
