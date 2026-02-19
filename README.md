# QuickFuelUp

Mobile-first PWA for capturing fuel fill-ups and posting them to the [LubeLogger](https://lubelogger.com) API.

## What it does

- Capture a **pump photo** and **odometer photo**
- Use **Gemini Vision** to extract:
  - `odometer`
  - `fuelconsumed` (quantity)
  - `cost` (total cost)
- Review/edit fields, then submit to LubeLogger:
  - `POST /api/vehicle/gasrecords/add?vehicleId=...`

## Setup (in-app)

Open **Settings** and configure:
- LubeLogger Base URL (e.g. `https://demo.lubelogger.com`)
- LubeLogger API Key (sent as `x-api-key`)
- Gemini API key

Use **Test connection** to hit `/api/whoami` and `/api/vehicles`.

## Data storage

- Config is stored locally in your browser (LocalStorage).
- A single in-progress draft (including compressed photos) is stored locally (IndexedDB) **until a successful submission** so you can retry without re-taking photos.
- No submission history is tracked.

## Development

```bash
npm install
npm run dev
```

## Notes

- This is a **client-only** app. Treat API keys as sensitive.
- LubeLogger must be reachable from the browser; if you run it on your LAN, ensure HTTPS and CORS are compatible with browser requests.

### CORS / “TypeError: Failed to fetch”

Some LubeLogger deployments do not send `Access-Control-Allow-Origin`, which causes browsers to block cross-origin calls.

To work around this, enable **“Use same-origin proxy”** in Settings and set this Vercel env var (then redeploy):

`LUBELOGGER_PROXY_BASE_URL=https://your.lubelogger.host`
