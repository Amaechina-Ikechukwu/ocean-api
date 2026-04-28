import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { env } from "./env";

function getCredential() {
  const rawServiceAccount = env.FIREBASE_SERVICE_ACCOUNT_JSON
    ?? readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH!, "utf8");

  const serviceAccount = JSON.parse(rawServiceAccount.replace(/\\n/g, "\n")) as admin.ServiceAccount;
  return admin.credential.cert(serviceAccount);
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
