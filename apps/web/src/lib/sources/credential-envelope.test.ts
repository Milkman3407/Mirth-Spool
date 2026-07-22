import { describe, expect, it } from "vitest";

import {
  createCredentialKeyring,
  CredentialEnvelopeError,
  decryptCredential,
  encryptCredential,
} from "./credential-envelope.js";

const binding = {
  kind: "ACCESS_TOKEN",
  label: "primary",
  sourceId: "source-1",
};
const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const nonce = () => Uint8Array.from({ length: 12 }, (_, index) => index + 10);

describe("credential envelope", () => {
  it("encrypts and decrypts a versioned AES-256-GCM payload", () => {
    const keyring = createCredentialKeyring(4, key);
    const envelope = encryptCredential(
      { accessToken: "private-value" },
      binding,
      keyring,
      nonce,
    );
    const serialized = new TextDecoder().decode(envelope);
    expect(serialized).toContain('"version":4');
    expect(serialized).not.toContain("private-value");
    expect(decryptCredential(envelope, binding, keyring)).toEqual({
      accessToken: "private-value",
    });
  });

  it("rejects tampering, the wrong key, and changed associated data", () => {
    const keyring = createCredentialKeyring(1, key);
    const envelope = encryptCredential(
      { secret: "value" },
      binding,
      keyring,
      nonce,
    );
    const tampered = Uint8Array.from(envelope);
    const tamperIndex = tampered.length - 8;
    tampered[tamperIndex] = tampered[tamperIndex]! ^ 1;
    const wrongKey = createCredentialKeyring(
      1,
      Uint8Array.from({ length: 32 }, () => 9),
    );
    expect(() => decryptCredential(tampered, binding, keyring)).toThrow(
      CredentialEnvelopeError,
    );
    expect(() => decryptCredential(envelope, binding, wrongKey)).toThrow(
      CredentialEnvelopeError,
    );
    expect(() =>
      decryptCredential(
        envelope,
        { ...binding, sourceId: "source-2" },
        keyring,
      ),
    ).toThrow(CredentialEnvelopeError);
  });
});
