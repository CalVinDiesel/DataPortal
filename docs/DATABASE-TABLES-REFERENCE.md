# Database tables reference (pgAdmin 4)

Below is how each table you see in pgAdmin 4 relates to the current Data Portal.

---

## Used by the Data Portal (auth-server + admin portal)

| Table | Used by | Purpose |
|-------|---------|--------|
| **ClientUploads** | Auth server | Client upload requests (drone images, project info). Admin sees these in **Client Uploads**; accept/reject and link to ProcessingRequests. |
| **DataPortalUsers** | Auth server | User directory: registration, login, **role** (client/admin). **Manage Users** and “Promote to admin” use this. |
| **MapData** | Auth server | 3D model / map pins for the overview map. Admin: Add 3D Model, Manage Map Pins, sync from JSON. |
| **MicrosoftUsers** | Auth server | Microsoft OAuth: stores microsoft_id, email, name. Used when users sign in with Microsoft; we also upsert into DataPortalUsers. |
| **ProcessingRequests** | Auth server | Admin processing of a ClientUpload; status, result URL, delivery notes. Linked to ClientUploads. |
| **Showcase** | Auth server | Which MapData entries appear on the landing-page showcase and in what order. Admin: Manage Showcase. |

---

## Used by Better Auth (Google OAuth)

The Data Portal uses the **Better Auth** library for **Google sign-in**. When `PG_DATABASE` is set, Better Auth uses the same PostgreSQL database and creates/manages these tables itself. Your app code does not query them directly.

| Table | Used by | Purpose |
|-------|---------|--------|
| **account** | Better Auth | Links users to OAuth providers (e.g. Google). |
| **session** | Better Auth | Google sign-in sessions. |
| **GoogleUsers** | Better Auth | Google OAuth users (id, email, name, etc.). Renamed from `user` so it’s clear this table is for Google users. Roles for the Data Portal are in **DataPortalUsers**, not here. |
| **verification** | Better Auth | Used by Better Auth for verification flows (e.g. email verification) if enabled. |

So **account**, **session**, **GoogleUsers** (formerly `user`), and **verification** are all used by the Data Portal indirectly via Better Auth for Google login.

---

## Not created or used by the Data Portal

| Table | Likely origin | Used by Data Portal? |
|-------|----------------|----------------------|
| **pointcloud_formats** | PostgreSQL extension (e.g. pointcloud/pgpointcloud) or another project | **No** – no references in the Data Portal codebase. |
| **spatial_ref_sys** | **PostGIS** (created when you run `CREATE EXTENSION postgis`) | **No** – not referenced in auth-server or HTML admin. The **react-viewer-app** uses PostGIS and has a `spatial_features` table; PostGIS itself uses `spatial_ref_sys` for coordinate systems. So it’s in the DB because of PostGIS, not because the auth-server or admin portal use it directly. |

---

## Summary

- **Used by Data Portal (app + Better Auth):**  
  ClientUploads, DataPortalUsers, MapData, MicrosoftUsers, ProcessingRequests, Showcase, account, session, GoogleUsers (Better Auth’s user table), verification.  
- **Not used by Data Portal (extension/other):**  
  pointcloud_formats; spatial_ref_sys is a PostGIS system table (used by PostGIS, not by auth-server/admin).

All of the tables you listed except **pointcloud_formats** (and **spatial_ref_sys** as a direct app table) are either used by the Data Portal or by Better Auth/PostGIS that the Data Portal or viewer rely on.
