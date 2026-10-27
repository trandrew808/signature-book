# Photo Lounge Signature Book

Guests find the portrait they just took on an iPad, write a note on it with the Apple Pencil, and the couple gets a signed digital set.

Three screens, one link per event:

| URL | Who | What |
|---|---|---|
| `/{slug}` | Guests (iPad, no login) | "Find Your Portrait" grid → sign → thank-you with gallery QR |
| `/{slug}/upload` | Editor (PIN) | Drop zone for exports, QR code upload, live counts |
| `/{slug}/gallery?key={gallery_token}` | Couple | Signed set, lightbox, one-click ZIP (signed + original + ink layer) |
| `/{slug}/wall` | TV / second screen | Live slideshow of signed portraits, newest first |
| `/admin` | Team (ADMIN_PIN) | Create and manage events, QR codes, links, downloads, deletion |

Stack: Next.js 15 (App Router) on Vercel, Supabase (Postgres + Storage + Realtime). No auth system: guests are anonymous, the editor uses a per-event PIN, the couple's link carries a token.

## 1. Supabase (10 min)

1. Create a project at supabase.com. Pick a region close to Honolulu (us-west).
2. SQL Editor → paste `supabase/schema.sql` → Run. This creates `events`, `photos`, the public `booth` bucket, realtime and read policies.
3. Project Settings → API: copy the Project URL, the `anon` key and the `service_role` key.

## 2. Deploy (5 min)

1. Push this folder to a GitHub repo and import it in Vercel, or run `npx vercel` from the folder.
2. Environment variables (Vercel → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ADMIN_PIN` — the team PIN that unlocks `/admin`
   - `SUPABASE_SERVICE_KEY` (server only) — or connect the Supabase resource under Vercel → Storage, which injects `SUPABASE_SERVICE_ROLE_KEY` and the two public vars automatically
3. Deploy. Live at `book.photoloungehawaii.com` (CNAME at GoDaddy → Vercel). The root redirects to `/admin`.

Local dev: copy `.env.example` to `.env.local`, fill it in, `npm install`, `npm run dev`.

## 3. Create an event

Open `/admin`, enter the admin PIN, type the couple's names and the date, click **Create event**. You get the iPad link and the editor link + PIN with copy buttons, upload the Pic-Time QR, view the gallery, download the ZIP, and delete the event when it's delivered.

## 4. Night of

**iPad**: open `https://book.photoloungehawaii.com/{slug}` in Safari → Share → Add to Home Screen → open from the icon → Settings → Accessibility → Guided Access, then triple-click the top button to lock it. Tap **Lock kiosk** to hide the header and the button; to leave, hold the logo for 2 seconds and enter `0000`. After a minute untouched the booth drifts into the signed-portrait slideshow; any tap brings the grid back.

**Wall**: open `/{slug}/wall` on a TV or second iPad for a live crossfading slideshow of signed portraits.

**Laptop**: Lightroom export preset → JPEG, 2500px long edge, quality 85, no subfolder, destination `~/Pictures/Booth Export`. Then in this project folder:

```bash
BOOTH_URL=https://book.photoloungehawaii.com BOOTH_EVENT={slug} BOOTH_PIN={pin} npm run watcher
```

Every export lands on the iPad in a few seconds. The Upload page works as a manual fallback (drag and drop) and is where the editor uploads the Pic-Time pre-registration QR.

**Delivery**: in `/admin`, "Download signed" gives a ZIP named `SB-001-Guest-Name-signed.jpg / -original.jpg / -ink.png`, in signing order, ready to import into Lightroom and publish to Pic-Time as a "Signature Book" scene. (A couple's web gallery also exists at `/{slug}/gallery?key={gallery_token}` if you ever want to share one directly.)

## Storage layout

```
booth/
  {slug}/originals/{timestamp}-{filename}.jpg   edited export (what guests tap)
  {slug}/signed/{photo_id}-{timestamp}.jpg      flattened signed JPEG, quality 92
  {slug}/ink/{photo_id}-{timestamp}.png         transparent ink layer, same size as the signed file
  {slug}/qr-{timestamp}.png                     event's pre-registration QR
```

Guests choose a frame when they sign: **Print frame** (default) sets the photo on paper like instant film: side and top border 5% of the paper width, writing band 30% of the paper width, photo full width. Every portrait shares the same border weight and writing room, landscape or portrait; **Photo only** writes directly on the image. The `photos.frame` column records which. The ink layer is kept separately so the handwriting can be re-applied to the full-resolution original for an album (for `print`, the photo sits at 5% of the paper width from the left and top, and the paper width is the photo width ÷ 0.9).

## Notes and next steps

- A second guest signing the same portrait replaces the first note. If you want multiple notes per photo, make `signed_path` a child table.
- The gallery key is checked in the browser against a public-readable `events` row, which is fine for a private link but not a secret. Move the check to an API route if galleries need to be locked down harder.
- Realtime falls back to a 30-second refresh if the venue wifi drops the websocket.
- Nothing is sent by email or SMS; Pic-Time handles guest registration via the QR.
