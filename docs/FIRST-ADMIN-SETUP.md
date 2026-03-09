# How to create your first admin (and promote more later)

## You have no admin yet

To give one of your **existing client accounts** admin access (so you can then promote others from the admin panel):

1. **Stop the auth server** (Ctrl+C) if it is running.
2. Open **`auth-server/data/users.json`** in a text editor.
3. Find the user object for the email you want to make admin (e.g. the Gmail you used to register as client).
4. Add **`"role": "admin"`** to that user. If the user has no `role` field, add it; if it has `"role": "client"`, change it to `"role": "admin"`.

   Example before:
   ```json
   {
     "email": "yourname@gmail.com",
     "username": "yourname",
     "name": "Your Name",
     "contactNumber": "+60123456789",
     "passwordHash": "...",
     "provider": "local"
   }
   ```

   Example after:
   ```json
   {
     "email": "yourname@gmail.com",
     "username": "yourname",
     "name": "Your Name",
     "contactNumber": "+60123456789",
     "passwordHash": "...",
     "provider": "local",
     "role": "admin"
   }
   ```

5. Save the file and **restart the auth server** (`npm start` in `auth-server`).
6. Log in to the Data Portal with that email (login page or Google/Microsoft if that’s how the account was created). You should now see the **Admin** link and be able to open the admin portal.

---

## You already have at least one admin

- Open the **Admin** portal and go to **Manage Users**.
- You’ll see all users stored in the system (email/password and those who completed the register form).
- For any **Client**, click **Promote to admin**.
- That user can then log in and access the Admin section; no need to re-register or use an approval code.

**Note:** Only users who signed up via the Data Portal (and appear in DataPortalUsers or `users.json`) can be promoted. Google/Microsoft users must have completed the “Complete your profile” step. See DATA-PORTAL-USERS-DATABASE.md for PostgreSQL setup.

---

## Admin approval code (register as Admin)

When someone chooses **“Sign up as: Admin”** on the register page, they must enter an **admin approval code**. That code is **not** shown in the app — you set it on the server:

1. Open **`auth-server/.env`** (create it from `auth-server/.env.example` if needed).
2. Add or edit:
   ```env
   ADMIN_REGISTRATION_CODE=your-secret-code-here
   ```
   Replace `your-secret-code-here` with any secret string (e.g. a password only you and other admins know). **Keep this secret** — anyone who has it can register as admin.
   - Use **no quotes** around the value (e.g. `ADMIN_REGISTRATION_CODE=mycode2024`). If you use quotes, some setups include them in the value and the code will not match.
   - No spaces before or after the `=`.
3. Restart the auth server (`npm start` in `auth-server`).

Registrants who choose “Sign up as: Admin” must enter that **exact** value in the “Admin approval code” field. If it’s wrong or empty, they’ll get an error and can sign up as Client instead.
