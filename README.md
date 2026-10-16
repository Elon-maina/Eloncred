# ELonCred

E-commerce site: static pages in `Frontend/`, served together with the REST API by the Express server in `Backend/` (MySQL database).

## Setup

1. Install dependencies:
   ```
   cd Backend
   npm install
   ```
2. Create the database and tables (MySQL 8):
   ```
   mysql -u root -p < Backend/database.sql
   ```
   Creating a dedicated least-privilege MySQL user for the app is recommended (see the end of `database.sql`).
3. Configure secrets: copy `Backend/.env.example` to `Backend/.env` and fill in `DB_USER`, `DB_PASSWORD` and `SESSION_SECRET`.
   `.env` is git-ignored and must never be committed.
4. Create an admin account:
   ```
   cd Backend
   npm run create-admin -- admin@example.com "<password>" "Admin Name"
   ```
5. Start the server and open http://localhost:3000:
   ```
   npm start        # or: npm run dev (auto-reload)
   ```
   The admin dashboard is at http://localhost:3000/Admin/adminlogin.html.
