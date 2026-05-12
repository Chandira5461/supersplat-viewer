# GSplat Property Viewer

Embeddable Gaussian-splat tour viewer for real-estate property listings. Fork of
[`@playcanvas/supersplat-viewer`](https://github.com/playcanvas/supersplat-viewer) — see
[NOTICE](./NOTICE) for upstream attribution.

## What this fork adds

- **Rich hotspots.** Annotations can include room area and an image gallery via an
  `extras.gsplat` block on the annotation. Backward-compatible with upstream
  `settings.json` files — older or unmodified viewers simply ignore the extras.
- **Analytics event emitter.** Tour engagement events (`tour_started`,
  `hotspot_clicked`, `annotation_dismissed`, `camera_position_sample`,
  `tour_ended`) emit via `window.parent.postMessage` (for iframe embeds) and
  `navigator.sendBeacon` to an optional HTTP endpoint.

Everything else (rendering, camera controls, XR, post effects, URL parameters)
is upstream-as-is.

## Rich-hotspot schema (`extras.gsplat`)

```jsonc
{
    "position": [0, 0.5, 0],
    "title": "Master Bedroom",
    "text": "Primary suite with attached bath.",
    "camera": { "initial": { "position": [...], "target": [...], "fov": 60 } },
    "extras": {
        "gsplat": {
            "area_sqft": 240,
            "images": [
                "https://cdn.example.com/photo1.jpg",
                "https://cdn.example.com/photo2.jpg"
            ]
        }
    }
}
```

Both `area_sqft` and `images` are optional. See
[samples/property-demo/settings.json](./samples/property-demo/settings.json) for
a full example with four annotations.

## URL parameters added by this fork

| Parameter | Purpose |
| --------- | ------- |
| `scene`   | Opaque scene identifier reported with every analytics event |
| `beacon`  | URL of an HTTPS endpoint to which analytics events are POSTed via `sendBeacon` |

All upstream URL parameters (`content`, `settings`, `skybox`, `poster`,
`collision`, `noui`, `noanim`, `webgpu`, etc.) are unchanged.

## Analytics payload

```ts
{
  event: 'tour_started' | 'tour_ended' | 'hotspot_clicked' |
         'annotation_dismissed' | 'camera_position_sample',
  session_id: string,         // generated per page load
  scene_id: string | null,    // from ?scene= URL param
  timestamp: number,          // ms since epoch
  // event-specific fields:
  title?: string,             // hotspot_clicked
  room_index?: number,        // hotspot_clicked (annotation array index)
  position?: number[],        // hotspot_clicked, camera_position_sample
  dwell_ms?: number,          // annotation_dismissed
  duration_ms?: number,       // tour_ended
}
```

Events from `postMessage` are wrapped as `{ source: 'gsplat-viewer', payload }`
so the embedding page can filter on `event.data.source`. The viewer also emits
debug envelopes `{ source: 'gsplat-viewer-debug', kind: 'beacon-attempt', event,
beaconUrl, accepted }` after every `sendBeacon` call so a host page can verify
beacons are being sent without round-tripping through the receiver.

Beacons are sent with `Content-Type: text/plain` (despite carrying a JSON body)
to avoid a CORS preflight `OPTIONS` request. Receivers should parse the body as
JSON regardless of the declared Content-Type.

## Local development

```sh
npm install
npm run develop   # serves at http://localhost:3000
```

The viewer expects `?content=<url>&settings=<url>` to point at hosted assets.
For development, point them at the CloudFront distribution that fronts our S3
splat bucket.

## Build / publish

```sh
npm run build
```

Produces a self-contained static site in `public/` (`index.html`, `index.css`,
`index.js`) plus the npm package outputs in `dist/`.

## License

MIT. Upstream MIT license is preserved in [LICENSE](./LICENSE); fork
modifications credited in [NOTICE](./NOTICE).
