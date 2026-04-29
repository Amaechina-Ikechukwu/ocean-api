import admin from "firebase-admin";
import { env } from "./env";

function repairLiteralPrivateKeyNewlines(raw: string): string {
  return raw.replace(
    /"private_key"\s*:\s*"([\s\S]*?)"\s*,\s*"client_email"/,
    (_match, privateKey: string) => {
      const repairedKey = privateKey
        .replace(/\r?\n/g, "\\n")
        .replace(/(?<!\\)"/g, '\\"');

      return `"private_key":"${repairedKey}","client_email"`;
    }
  );
}

function parseServiceAccount(raw: string): admin.ServiceAccount {
  const trimmed = raw.trim();
  let serviceAccount: admin.ServiceAccount & { private_key?: string };

  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON must be the complete service account JSON on one line. " +
      "Your value appears truncated; .env files cannot use an unquoted multiline JSON object."
    );
  }

  try {
    serviceAccount = JSON.parse(trimmed) as admin.ServiceAccount & { private_key?: string };
  } catch (error) {
    try {
      serviceAccount = JSON.parse(repairLiteralPrivateKeyNewlines(trimmed)) as admin.ServiceAccount & { private_key?: string };
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Use a single-line JSON string and keep private_key newlines escaped as \\n."
      );
    }
  }

  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  return serviceAccount;
}

function getCredential() {
  return admin.credential.cert(parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON));
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: getCredential(),
    ...(env.FIREBASE_STORAGE_BUCKET ? { storageBucket: env.FIREBASE_STORAGE_BUCKET } : {}),
    ...(env.FIREBASE_REALTIME_DATABASE_URL ? { databaseURL: env.FIREBASE_REALTIME_DATABASE_URL } : {})
  });
}

export const auth = admin.auth();
export const firestore = admin.firestore();
export const realtimeDb = admin.database();
export const bucket = admin.storage().bucket();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
