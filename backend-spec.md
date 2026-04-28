# Notion-Like Backend — AI Build Specification

## Overview

Build a production-ready REST API backend for a Notion-like collaborative workspace app.

**Runtime:** Bun  
**Framework:** Express.js  
**Deployment:** Google Cloud Run  
**Authentication:** Firebase Auth (via Firebase Admin SDK)  
**Primary Database:** Cloud Firestore  
**Presence Database:** Firebase Realtime Database  
**File Storage:** Firebase Storage  
**Background Jobs:** Cloud Tasks / Cloud Scheduler  
**Search (later):** Meilisearch, Typesense, Algolia, or Vertex AI Search

---

## Project Structure

```
notion-backend/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   ├── firebase.ts
│   │   ├── env.ts
│   │   └── cors.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── validate.middleware.ts
│   │   └── permission.middleware.ts
│   ├── routes/
│   │   ├── index.ts
│   │   ├── me.routes.ts
│   │   ├── workspace.routes.ts
│   │   ├── page.routes.ts
│   │   ├── block.routes.ts
│   │   ├── database.routes.ts
│   │   ├── comment.routes.ts
│   │   ├── file.routes.ts
│   │   ├── share.routes.ts
│   │   ├── invite.routes.ts
│   │   ├── search.routes.ts
│   │   └── ai.routes.ts
│   ├── controllers/
│   ├── services/
│   ├── repositories/
│   ├── validators/
│   ├── types/
│   └── utils/
├── Dockerfile
├── package.json
├── tsconfig.json
├── bun.lock
└── .env
```

---

## Firebase Admin Setup

**File:** `src/config/firebase.ts`

Initialize Firebase Admin SDK with Firestore, Auth, Realtime Database, and Storage.

```ts
import admin from "firebase-admin";

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    databaseURL: process.env.FIREBASE_REALTIME_DATABASE_URL,
  });
}

export const auth = admin.auth();
export const firestore = admin.firestore();
export const realtimeDb = admin.database();
export const bucket = admin.storage().bucket();
export const FieldValue = admin.firestore.FieldValue;
```

---

## Express App

**File:** `src/app.ts`

```ts
import express from "express";
import cors from "cors";
import routes from "./routes";
import { errorMiddleware } from "./middleware/error.middleware";

export const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", routes);
app.use(errorMiddleware);
```

**File:** `src/server.ts`

```ts
import { app } from "./app";
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server running on port ${port}`));
```

---

## Auth Middleware

**File:** `src/middleware/auth.middleware.ts`

- Extract `Bearer` token from `Authorization` header
- Verify token using `auth.verifyIdToken(token)`
- Attach decoded user `{ uid, email, displayName, photoURL }` to `req.user`
- Return `401` if token is missing or invalid

**File:** `src/types/express.d.ts`

Extend Express `Request` interface to include:

```ts
user?: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}
```

---

## Permission System

### Roles (ordered by access level)

| Role        | Can View | Can Comment | Can Edit | Can Manage Members | Can Delete Workspace |
|-------------|----------|-------------|----------|--------------------|----------------------|
| `viewer`    | ✅       | ❌          | ❌       | ❌                 | ❌                   |
| `commenter` | ✅       | ✅          | ❌       | ❌                 | ❌                   |
| `editor`    | ✅       | ✅          | ✅       | ❌                 | ❌                   |
| `admin`     | ✅       | ✅          | ✅       | ✅                 | ❌                   |
| `owner`     | ✅       | ✅          | ✅       | ✅                 | ✅                   |

### Permission Service

**File:** `src/services/permission.service.ts`

```ts
export async function getWorkspaceRole(workspaceId: string, uid: string): Promise<string | null>
export function canEdit(role: string | null): boolean       // owner, admin, editor
export function canComment(role: string | null): boolean    // + commenter
export function canView(role: string | null): boolean       // + viewer
export function canManageMembers(role: string | null): boolean // owner, admin only
```

Fetch role from: `workspaces/{workspaceId}/members/{uid}`

Every protected route must:
1. Verify the user is logged in
2. Verify they are a workspace member
3. Check their role against the required permission

---

## Firestore Data Model

### `users/{uid}`

```ts
{
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastSeenAt: Timestamp;
}
```

### `workspaces/{workspaceId}`

```ts
{
  name: string;
  icon: string;
  coverImage: string | null;
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isDeleted: boolean;
}
```

### `workspaces/{workspaceId}/members/{uid}`

```ts
{
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: "owner" | "admin" | "editor" | "commenter" | "viewer";
  status: "active" | "invited";
  joinedAt: Timestamp;
}
```

### `users/{uid}/workspaces/{workspaceId}` *(denormalized for fast lookup)*

```ts
{
  workspaceId: string;
  name: string;
  icon: string;
  role: string;
  joinedAt: Timestamp;
}
```

### `pages/{pageId}` *(top-level collection)*

```ts
{
  workspaceId: string;
  parentPageId: string | null;
  title: string;
  icon: string;
  coverImage: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isDeleted: boolean;
  deletedAt: Timestamp | null;
  visibility: "private" | "workspace" | "public";
  order: number; // spaced integers, e.g. 1000, 2000, 3000
}
```

**Useful queries:**
```
pages where workspaceId == X and parentPageId == null orderBy order
pages where workspaceId == X and parentPageId == Y orderBy order
```

### `pages/{pageId}/blocks/{blockId}`

```ts
{
  pageId: string;
  workspaceId: string;
  type: BlockType;
  content: Record<string, any>; // varies by block type
  parentBlockId: string | null;
  order: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isDeleted: boolean;
}
```

**Supported block types:**
`paragraph`, `heading_1`, `heading_2`, `heading_3`, `bulleted_list`, `numbered_list`, `todo`, `toggle`, `quote`, `callout`, `divider`, `code`, `image`, `video`, `audio`, `file`, `bookmark`, `equation`, `table`, `columns`, `database_view`, `embed`, `breadcrumb`, `table_of_contents`, `synced_block`

**Block ordering rule:**
- Use spaced integers: 1000, 2000, 3000
- When inserting between blocks: `newOrder = (prevOrder + nextOrder) / 2`

### `databases/{databaseId}`

```ts
{
  workspaceId: string;
  pageId: string;
  name: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isDeleted: boolean;
}
```

### `databases/{databaseId}/properties/{propertyId}`

```ts
{
  name: string;
  type: "text" | "number" | "select" | "multi_select" | "date" | "checkbox" | "url" | "email" | "phone" | "relation" | "formula";
  order: number;
  options?: { id: string; name: string; color: string }[]; // for select/multi_select
  createdAt: Timestamp;
}
```

### `databases/{databaseId}/rows/{rowId}`

```ts
{
  workspaceId: string;
  databaseId: string;
  pageId: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isDeleted: boolean;
  values: Record<string, any>; // e.g. { property_status: "progress", property_title: "Build backend" }
}
```

**Query example:**
```
databases/{databaseId}/rows where values.property_status == "progress"
```

### `databases/{databaseId}/views/{viewId}`

```ts
{
  name: string;
  type: "table" | "board" | "calendar" | "list" | "gallery" | "timeline";
  filters: Filter[];
  sorts: Sort[];
  groupBy: string | null;
  hiddenProperties: Record<string, boolean>;
  propertyOrder: string[];
  createdAt: Timestamp;
}
```

### `pages/{pageId}/comments/{commentId}`

```ts
{
  workspaceId: string;
  pageId: string;
  blockId: string | null;
  authorId: string;
  text: string;
  status: "open" | "resolved";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `pages/{pageId}/comments/{commentId}/replies/{replyId}`

```ts
{
  authorId: string;
  text: string;
  createdAt: Timestamp;
}
```

### `users/{uid}/notifications/{notificationId}`

```ts
{
  type: "mention" | "comment" | "invite" | "reply";
  workspaceId: string;
  pageId: string;
  actorId: string;
  message: string;
  read: boolean;
  createdAt: Timestamp;
}
```

### `files/{fileId}`

```ts
{
  workspaceId: string;
  pageId: string;
  blockId: string;
  uploadedBy: string;
  name: string;
  mimeType: string;
  size: number;
  storagePath: string; // workspaces/{workspaceId}/pages/{pageId}/files/{fileId}-{filename}
  downloadURL: string | null;
  status: "pending" | "confirmed" | "failed";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `pages/{pageId}/permissions/{uid}`

```ts
{
  uid: string;
  role: "owner" | "editor" | "commenter" | "viewer";
  grantedBy: string;
  createdAt: Timestamp;
}
```

### `publicShares/{slug}`

```ts
{
  slug: string;
  pageId: string;
  workspaceId: string;
  enabled: boolean;
  allowDuplicate: boolean;
  allowComments: boolean;
  allowEditing: boolean;
  createdBy: string;
  createdAt: Timestamp;
}
```

### `invites/{inviteId}`

```ts
{
  workspaceId: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "expired";
  invitedBy: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}
```

### `workspaces/{workspaceId}/activityLogs/{activityId}`

```ts
{
  type: "page_created" | "page_updated" | "page_deleted" | "member_added" | "member_removed";
  actorId: string;
  pageId?: string;
  message: string;
  createdAt: Timestamp;
}
```

---

## Realtime Database — Presence

**Do not use Firestore for presence.** Use Firebase Realtime Database with `onDisconnect()`.

**Path:** `presence/{workspaceId}/{pageId}/{uid}`

```ts
{
  uid: string;
  displayName: string;
  photoURL: string;
  cursor: { blockId: string; offset: number } | null;
  selection: { startBlockId: string; endBlockId: string } | null;
  lastActiveAt: number; // Unix ms timestamp
}
```

---

## API Routes

### Auth / Profile

```
GET    /api/me
POST   /api/me/sync
PATCH  /api/me
```

### Workspaces

```
POST   /api/workspaces
GET    /api/workspaces
GET    /api/workspaces/:workspaceId
PATCH  /api/workspaces/:workspaceId
DELETE /api/workspaces/:workspaceId

GET    /api/workspaces/:workspaceId/members
POST   /api/workspaces/:workspaceId/invites
PATCH  /api/workspaces/:workspaceId/members/:uid/role
DELETE /api/workspaces/:workspaceId/members/:uid
```

### Pages

```
POST   /api/pages
GET    /api/pages/:pageId
PATCH  /api/pages/:pageId
DELETE /api/pages/:pageId

POST   /api/pages/:pageId/restore
POST   /api/pages/:pageId/duplicate
POST   /api/pages/:pageId/move

GET    /api/workspaces/:workspaceId/pages/root
GET    /api/pages/:pageId/children
```

### Blocks

```
POST   /api/pages/:pageId/blocks
PATCH  /api/pages/:pageId/blocks/:blockId
DELETE /api/pages/:pageId/blocks/:blockId
POST   /api/pages/:pageId/blocks/reorder
POST   /api/pages/:pageId/blocks/bulk
```

> Simple text editing can write directly to Firestore from the client if security rules are in place. Use backend routes for complex operations: duplicate, move, bulk delete, reorder many blocks.

### Databases

```
POST   /api/databases
GET    /api/databases/:databaseId
PATCH  /api/databases/:databaseId
DELETE /api/databases/:databaseId

POST   /api/databases/:databaseId/properties
PATCH  /api/databases/:databaseId/properties/:propertyId
DELETE /api/databases/:databaseId/properties/:propertyId

POST   /api/databases/:databaseId/rows
PATCH  /api/databases/:databaseId/rows/:rowId
DELETE /api/databases/:databaseId/rows/:rowId

POST   /api/databases/:databaseId/views
PATCH  /api/databases/:databaseId/views/:viewId
DELETE /api/databases/:databaseId/views/:viewId
```

### Comments

```
POST   /api/pages/:pageId/comments
GET    /api/pages/:pageId/comments
PATCH  /api/pages/:pageId/comments/:commentId
DELETE /api/pages/:pageId/comments/:commentId

POST   /api/pages/:pageId/comments/:commentId/replies
POST   /api/pages/:pageId/comments/:commentId/resolve
```

### Files

```
POST   /api/files/init       — backend checks permission, creates metadata
POST   /api/files/confirm    — backend updates metadata with download URL
DELETE /api/files/:fileId
```

**Upload flow:**
1. Client calls `POST /api/files/init`
2. Backend verifies permission, creates pending file doc
3. Client uploads directly to Firebase Storage
4. Client calls `POST /api/files/confirm`
5. Backend updates file status and `downloadURL`

**Storage path format:** `workspaces/{workspaceId}/pages/{pageId}/files/{fileId}-{filename}`

### Sharing

```
POST   /api/pages/:pageId/share/users
DELETE /api/pages/:pageId/share/users/:uid

POST   /api/pages/:pageId/public-share
PATCH  /api/pages/:pageId/public-share
DELETE /api/pages/:pageId/public-share

GET    /api/public/:slug    — serve via backend only, never expose raw Firestore
```

### Search

```
GET /api/search?workspaceId=X&q=project
```

V1: search page titles and indexed text via Firestore.  
Later: delegate to Meilisearch / Typesense / Algolia / Vertex AI Search.

### AI

```
/api/ai
```

Handle workspace AI assistant requests. Implement later.

---

## Key Backend Flows

### Workspace Creation (`POST /api/workspaces`)

Use a Firestore batch write:

1. Verify Firebase token
2. Create `workspaces/{workspaceId}` document
3. Add user as `owner` in `workspaces/{workspaceId}/members/{uid}`
4. Duplicate shortcut in `users/{uid}/workspaces/{workspaceId}`
5. Create a default home page under `pages/{pageId}`
6. Return workspace + page

### Page Creation (`POST /api/pages`)

1. Verify token
2. Fetch and check workspace role
3. Assert `canEdit(role)`
4. Create `pages/{pageId}` document
5. Create first empty block in `pages/{pageId}/blocks/{blockId}`
6. Write activity log to `workspaces/{workspaceId}/activityLogs`
7. Return page

---

## Firestore Security Rules

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function workspaceRole(workspaceId) {
      return get(/databases/$(database)/documents/workspaces/$(workspaceId)/members/$(request.auth.uid)).data.role;
    }

    function isWorkspaceMember(workspaceId) {
      return signedIn() &&
        exists(/databases/$(database)/documents/workspaces/$(workspaceId)/members/$(request.auth.uid));
    }

    function canViewWorkspace(workspaceId) {
      return isWorkspaceMember(workspaceId);
    }

    function canEditWorkspace(workspaceId) {
      return isWorkspaceMember(workspaceId) &&
        workspaceRole(workspaceId) in ["owner", "admin", "editor"];
    }

    match /workspaces/{workspaceId} {
      allow read: if canViewWorkspace(workspaceId);
      allow create: if signedIn();
      allow update: if workspaceRole(workspaceId) in ["owner", "admin"];
      allow delete: if workspaceRole(workspaceId) == "owner";

      match /members/{uid} {
        allow read: if canViewWorkspace(workspaceId);
        allow write: if workspaceRole(workspaceId) in ["owner", "admin"];
      }
    }

    match /pages/{pageId} {
      allow read: if canViewWorkspace(resource.data.workspaceId);
      allow create: if canEditWorkspace(request.resource.data.workspaceId);
      allow update: if canEditWorkspace(resource.data.workspaceId);
      allow delete: if canEditWorkspace(resource.data.workspaceId);

      match /blocks/{blockId} {
        allow read: if canViewWorkspace(get(/databases/$(database)/documents/pages/$(pageId)).data.workspaceId);
        allow write: if canEditWorkspace(get(/databases/$(database)/documents/pages/$(pageId)).data.workspaceId);
      }

      match /comments/{commentId} {
        allow read: if canViewWorkspace(get(/databases/$(database)/documents/pages/$(pageId)).data.workspaceId);
        allow create: if isWorkspaceMember(get(/databases/$(database)/documents/pages/$(pageId)).data.workspaceId);
      }
    }

    match /databases/{databaseId} {
      allow read: if canViewWorkspace(resource.data.workspaceId);
      allow create: if canEditWorkspace(request.resource.data.workspaceId);
      allow update, delete: if canEditWorkspace(resource.data.workspaceId);

      match /{subcollection=**}/{docId} {
        allow read: if canViewWorkspace(get(/databases/$(database)/documents/databases/$(databaseId)).data.workspaceId);
        allow write: if canEditWorkspace(get(/databases/$(database)/documents/databases/$(databaseId)).data.workspaceId);
      }
    }
  }
}
```

---

## Realtime Collaboration Strategy

### V1 — Firestore Listeners

- Frontend listens to `pages/{pageId}/blocks` ordered by `order`
- Client debounces edits and writes directly to Firestore
- Other clients receive updates via `onSnapshot`
- Suitable for: notes, wikis, team editing with low conflict

**Limitation:** Two users editing the exact same block simultaneously can overwrite each other.

### V2 — Yjs (implement later)

- Firestore stores final page/block state
- Yjs handles live collaborative editing state
- Cloud Run WebSocket server or Liveblocks manages document sessions
- Redis needed if Cloud Run scales horizontally

---

## Build Order

Build in this sequence:

1. Firebase Admin setup in Bun + Express
2. Auth middleware
3. User sync endpoint (`POST /api/me/sync`)
4. Workspace creation
5. Workspace member roles + permission service
6. Page creation
7. Nested pages (parent/child)
8. Blocks collection under pages
9. Firestore realtime editor (frontend direct writes)
10. Basic file uploads
11. Comments and replies
12. Sharing (user permissions + public shares)
13. Databases (properties, rows, views)
14. Search (title-based V1, then dedicated engine)
15. AI features
16. True multiplayer editing with Yjs

---

## Cloud Run Responsibilities

The backend API must own these operations (not the client):

- Workspace creation and member management
- Invite handling
- Permission-sensitive page/block operations
- Page duplication and movement
- Bulk block operations
- File upload initialization and confirmation
- Public share serving
- AI requests
- Search API
- Export generation
- Webhook handling

The frontend may interact with Firestore directly for:

- Listening to page blocks (`onSnapshot`)
- Simple block content updates (with Firestore security rules enforced)
- Listening to comments
- Presence via Realtime Database

---

## Environment Variables

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_STORAGE_BUCKET=
FIREBASE_REALTIME_DATABASE_URL=
CLIENT_URL=
PORT=8080
```
