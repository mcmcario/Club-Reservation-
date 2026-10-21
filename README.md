# QC After Dark

Club and bar discovery and reservation requests for Katipunan, Timog, and Tomas Morato in Quezon City. Customers can request entrance, seats, or tables at venues configured as booking partners. Admins manage venues, photos, available arrival times, capacity, reservations, and customer accounts without editing code.

The app uses a React and Vite frontend, an Express REST API, and PostgreSQL. Local development uses embedded PostgreSQL through PGlite; Render uses its managed PostgreSQL service.

## Run locally

Requires Node.js 22 and pnpm 11. In this folder:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open [http://localhost:3000](http://localhost:3000). Set `PORT` to use another port. For frontend development, run `pnpm dev` in a second terminal; Vite serves port 5173 and proxies `/api` to port 3000.

The first local start creates `data/postgres/` and imports existing `data/store.json` accounts, venues, bookings, and uploaded photos if present. The original JSON data remains untouched. Back up the entire `data/` folder before moving the project to another computer. Data is excluded from Git.

If there is no admin yet, choose **Set up admin** on the sign-in screen. Existing admin credentials from the old site continue to work after import. Guests can browse; customers create an account to request reservations.

## Booking flow

1. An admin adds or edits a venue, marks it as a partner, and enters real prices, capacity, duration, and arrival times for each offered booking type.
2. A customer chooses a date within 90 days, booking type, available time, and guest count. The request starts as **Pending**.
3. The customer can edit pending requests and cancel pending or approved requests. Reservations appear in a list, searchable history, and calendar.
4. An admin searches or filters all reservations and moves pending requests to **Approved** or **Rejected**, then approved requests to **Completed**.

Pending and approved reservations consume the configured slot capacity. Overlapping time ranges for the same venue and booking type share that capacity. Rejected, completed, and cancelled reservations release it. The server checks capacity in a database transaction when creating or editing a request.

The starting directory lists AKAI 1108, Radius Katipunan, Club HYPE, Corte Ibiza Super Club, HEXA, URBN QC, and G-Side Tomas Morato. These are discovery listings, not claims of partnership. No prices or availability are invented for them. An admin can activate and configure a venue when it joins.

## Render deployment

The repository root contains [`render.yaml`](../render.yaml). In Render, create a **Blueprint** from this GitHub repository. It provisions a Node web service and a PostgreSQL database in Singapore. Enter a strong, private `ADMIN_SETUP_TOKEN` when Render asks for it. On the deployed site, choose **Set up admin** and enter that token with your admin details. After the first admin is created, setup closes. Render connects `DATABASE_URL` to the database automatically.

The Blueprint selects Render's free plans. [Render says free PostgreSQL expires after 30 days](https://render.com/docs/free); choose a durable paid database and backups before treating this as a production booking service. Uploaded partner pictures are stored in PostgreSQL, so web service restarts do not erase them. The local JSON data is not automatically copied to Render; a fresh deployment starts with the discovery listings and no accounts or bookings.

The site records **in-app admin approval** only. It does not take payments, message the venue, or guarantee admission. Confirm partner policies, prices, and availability with each business before opening public bookings. Venue photo sources are described in [`assets/README.md`](assets/README.md); obtain venue permission or licensed replacements before public promotion.

## Test

```powershell
pnpm test
```

Tests cover the original local flow and the new API's account roles, admin venue creation, image upload, slot capacity, overlapping times, editing, status changes, cancellation, and search. The API returns JSON under `/api/`; `/api/health` is the deployment health check.
