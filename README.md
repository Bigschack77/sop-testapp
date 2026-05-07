# sop-testapp

A vanilla mobile-first PWA for saving photo + note records locally and exporting them to a PC.

## Features

- Create records with:
  - camera/gallery image (`accept="image/*"` with capture hint)
  - free-text note
  - auto timestamp (`createdAt` + `updatedAt`)
- View saved records with thumbnail, preview text, and timestamp
- Edit and delete records
- Offline local persistence via IndexedDB
- Export ZIP containing:
  - `records.json`
  - `images/` files
- Import ZIP back into the app
- PWA manifest + service worker app-shell caching

## Run locally (static hosting)

Use any static server. Example with Python:

```bash
cd /home/runner/work/sop-testapp/sop-testapp
python -m http.server 8080
```

Open:

- `http://localhost:8080` on desktop
- `http://<your-computer-ip>:8080` on your phone (same Wi-Fi)

## Use on phone + export to PC

1. Open the app in Chrome/Edge on Android.
2. (Optional) Add to Home Screen to install as PWA.
3. Create records with photo + note and tap **Save record**.
4. Tap a record in the list to edit/delete.
5. Tap **Export ZIP** to download all records and images.
6. Move the ZIP to your PC (USB, cloud, etc.) and extract.
7. (Optional) Use **Import ZIP** to restore records in the app.

## Offline behavior

After first successful load, the app shell is cached by the service worker and can be opened without network.
