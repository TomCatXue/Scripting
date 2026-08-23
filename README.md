# UfiPeek

UFI-TOOLS / ZTE F50 network status monitoring widget for the iOS Scripting app.

Displays ZTE F50 traffic, signal, battery, CPU, memory, Wi-Fi band and unread SMS status.

## Files

- `widget.tsx` — widget core (systemSmall / systemMedium / systemLarge)
- `index.tsx` — entry (Widget.preview)
- `script.json` — Scripting project config

## Configuration (important)

Passwords are redacted in this repo. Configure them via script parameters or Storage:

| Param | Description |
|---|---|
| `URL` | UFI-TOOLS address, default `http://192.168.0.1:2333` |
| `password` | UFI-TOOLS password |
| `zte_password` | ZTE admin password (used by zreq / login) |

Example (Scripting run parameters):

```json
{"URL":"http://192.168.0.1:2333","password":"your-ufi-tools-password","zte_password":"your-zte-password"}
```

## Technical notes

- zreq auto-completes ZTE login; falls back to GET-only goform + POST login
- UFI-TOOLS signing: `minikano+method+path+timestamp` → HMAC-MD5 → double SHA256
- RSRQ/SNR queried separately via `network_information` (empty in multi_data=1 batch)
- Signal bars: derived from RSRP when `network_signalbar` is empty (≥-85 → 4 bars …)
- Transparent mode: `Widget.isTransparentMode || Widget.isBlurMode`, clear background, translucent pills

> Note: the `secretKey` kept in widget.tsx is the UFI-TOOLS client-wide signing constant shared by all compatible clients, not personal credentials. Always set your own passwords via parameters.

## License

For learning/reference only.
