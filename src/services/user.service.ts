import { FieldValue, firestore } from "../config/firebase";
import type { AuthenticatedUser } from "../types/auth";
import { notFound } from "../utils/http-error";

export async function getMe(uid: string) {
  const snapshot = await firestore.doc(`users/${uid}`).get();
  if (!snapshot.exists) throw notFound("User profile not found");
  return { id: snapshot.id, ...snapshot.data() };
}

export async function syncMe(user: AuthenticatedUser) {
  const ref = firestore.doc(`users/${user.uid}`);
  const snapshot = await ref.get();
  const now = FieldValue.serverTimestamp();

  const data = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    updatedAt: now,
    lastSeenAt: now,
    ...(snapshot.exists ? {} : { createdAt: now })
  };

  await ref.set(data, { merge: true });
  return { id: user.uid, ...data };
}

export async function updateMe(uid: string, data: { displayName?: string; photoURL?: string | null }) {
  const ref = firestore.doc(`users/${uid}`);
  await ref.set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const snapshot = await ref.get();
  return { id: snapshot.id, ...snapshot.data() };
}
