# Role-based access and admin registration

## Rules

1. **Public visitors** can view the landing page and all functions **except** Upload and Admin (those links are hidden or redirect to login).
2. **Signed-in users (client)** can view Upload but not Admin.
3. **Admin users** can view Admin (and Upload).

## Admin registration safeguard

To prevent anyone from self-registering as admin:

- On the register page, the user can choose **Client** or **Admin**.
- If they choose **Admin**, they must enter an **Admin approval code** (a secret only real admins know).
- The server checks: `adminCode === process.env.ADMIN_REGISTRATION_CODE`. If it matches, the account is created with `role: "admin"`; otherwise the request is rejected or the account is created as `role: "client"`.

Set in `.env`:

```env
ADMIN_REGISTRATION_CODE=your-secret-code-change-in-production
```

Only share this code with people who should be able to create admin accounts.

## Implementation checklist

- [ ] `users` storage (users.json or DB) has a `role` field: `"client"` or `"admin"`.
- [ ] `POST /api/auth/register` accepts `role` and optional `adminCode`; if `role === "admin"` and code does not match, return 403 or create as client.
- [ ] `GET /api/auth/me` returns `{ user: { ..., role } }`.
- [ ] Middleware `requireAdmin` for routes that serve the admin page or admin API.
- [ ] Register page: dropdown Client/Admin + approval code input when Admin is selected.
- [ ] Landing page: JS that calls `/api/auth/me` and shows/hides Upload and Admin links accordingly.
