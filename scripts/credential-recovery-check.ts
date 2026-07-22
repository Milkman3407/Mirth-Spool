import process from "node:process";

import { createDatabaseClient, createSource } from "@mirthspool/db";
import {
  createCredentialKeyring,
  CredentialEnvelopeError,
  decryptCredential,
  encryptCredential,
} from "../apps/web/src/lib/sources/credential-envelope.js";

if (process.env.MIRTHSPOOL_RECOVERY_FIXTURE !== "I_UNDERSTAND_TEST_DATA") {
  throw new Error("Recovery fixture guard is not set.");
}
const mode = process.argv[2];
if (!new Set(["seed", "verify", "verify-wrong-key"]).has(mode)) {
  throw new Error("Use seed, verify, or verify-wrong-key.");
}
const databaseUrl = process.env.DATABASE_URL;
const encodedKey = process.env.APP_ENCRYPTION_KEY;
if (!databaseUrl || !encodedKey)
  throw new Error("Required configuration is missing.");
const key = Buffer.from(encodedKey, "base64");
if (key.byteLength !== 32) throw new Error("Encryption key must be 32 bytes.");
const database = createDatabaseClient({ connectionString: databaseUrl });
const label = "m16-recovery-fixture";

try {
  if (mode === "seed") {
    const source = await createSource(database, {
      displayName: "M16 recovery fixture",
      kind: "RSS",
      configJson: { feedUrl: "https://example.invalid/recovery.xml" },
    });
    const binding = { kind: "ACCESS_TOKEN", label, sourceId: source.id };
    await database.sourceCredential.create({
      data: {
        encryptedPayload: Buffer.from(
          encryptCredential(
            { recoveryMarker: "verified" },
            binding,
            createCredentialKeyring(1, key),
          ),
        ),
        keyVersion: 1,
        kind: "ACCESS_TOKEN",
        label,
        sourceId: source.id,
      },
    });
    console.log("synthetic encrypted recovery fixture created");
  } else {
    const credential = await database.sourceCredential.findFirstOrThrow({
      where: { label },
    });
    const binding = {
      kind: credential.kind,
      label: credential.label,
      sourceId: credential.sourceId!,
    };
    const selectedKey =
      mode === "verify-wrong-key" ? Buffer.alloc(32, key[0]! ^ 0xff) : key;
    try {
      const value = decryptCredential(
        credential.encryptedPayload,
        binding,
        createCredentialKeyring(1, selectedKey),
      );
      if (mode === "verify-wrong-key" || value.recoveryMarker !== "verified") {
        throw new Error("Credential recovery assertion failed.");
      }
      console.log("restored credential decryptability verified");
    } catch (error) {
      if (
        mode === "verify-wrong-key" &&
        error instanceof CredentialEnvelopeError
      ) {
        console.log("wrong-key credential failure verified");
      } else {
        throw error;
      }
    }
  }
} finally {
  await database.$disconnect();
}
