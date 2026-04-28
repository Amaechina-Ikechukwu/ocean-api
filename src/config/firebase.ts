import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { env } from "./env";

function parseServiceAccount(raw: string): admin.ServiceAccount {
  const serviceAccount = JSON.parse(raw) as admin.ServiceAccount & { private_key?: string };

  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  return serviceAccount;
}

function getCredential() {
  if (env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return admin.credential.cert(parseServiceAccount(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")));
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return admin.credential.cert(parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }

  return admin.credential.cert(parseServiceAccount(readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH!, "utf8")));
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
