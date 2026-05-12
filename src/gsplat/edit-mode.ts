// Edit mode — added by the GSplat fork (M4 annotation editor support).
//
// When the viewer is embedded in an iframe by the dashboard's annotation
// editor page (URL has `?edit=1`), this module exposes a small bidirectional
// postMessage protocol so the dashboard can drive annotations live without
// reloading the splat:
//
//   Inbound  parent → iframe   `{source: 'gsplat-dashboard', kind: 'set-settings', settings}`
//   Inbound  parent → iframe   `{source: 'gsplat-dashboard', kind: 'get-camera-pose'}`
//   Outbound iframe → parent   `{source: 'gsplat-viewer-edit', kind: 'ready'}` (once on init)
//   Outbound iframe → parent   `{source: 'gsplat-viewer-edit', kind: 'camera-pose', pose}`
//
// `set-settings`: replace `global.settings` with the parent's latest copy and
// fire `gsplat.rebuild-annotations`, which the Annotations class handles by
// tearing down + recreating all hotspot entities. Splat itself is untouched.
//
// `get-camera-pose`: read the current camera's position/target/fov and emit
// back. The dashboard uses this to seed each hotspot's `camera.initial`
// (fly-to pose) when the operator clicks "Add hotspot here" or "Set fly-to
// from current view".
//
// All envelopes carry `source` strings so dashboard listeners can disambiguate
// from M1's analytics envelopes (`gsplat-viewer` / `gsplat-viewer-debug`).

import type { ExperienceSettings } from '../settings';
import type { Global } from '../types';

// Local pose shape — matches `Camera['initial']` from the v2 schema but kept
// inline here so we don't have to widen the viewer's public type exports for
// edit-mode's internal use.
type CameraPose = {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
};

type InboundMsg =
    | { source: 'gsplat-dashboard'; kind: 'set-settings'; settings: ExperienceSettings }
    | { source: 'gsplat-dashboard'; kind: 'get-camera-pose' };

const isInboundMsg = (data: unknown): data is InboundMsg => {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return d.source === 'gsplat-dashboard' && typeof d.kind === 'string';
};

const postToParent = (envelope: Record<string, unknown>) => {
    if (window.parent === window) return;
    try {
        window.parent.postMessage(envelope, '*');
    } catch (e) {
        // swallow — never break the viewer over a postMessage failure
    }
};

// Compute the current camera pose. PlayCanvas camera entity holds the position
// directly; "target" is the focal point — we derive it by stepping along the
// camera's forward vector by the current focal distance, falling back to a
// fixed offset if no focal distance is set.
const readCameraPose = (global: Global): CameraPose => {
    const cam = global.camera;
    const pos = cam.getPosition();
    const fwd = cam.forward;
    // Use a 2m focal distance fallback — close enough to give the next hotspot
    // a sensible "fly-to" target. Operators can refine via "Set fly-to" later.
    const dist = 2;
    const tx = pos.x + fwd.x * dist;
    const ty = pos.y + fwd.y * dist;
    const tz = pos.z + fwd.z * dist;
    return {
        position: [pos.x, pos.y, pos.z],
        target: [tx, ty, tz],
        fov: cam.camera?.fov ?? 60
    };
};

const initGSplatEditMode = (global: Global) => {
    const url = new URL(location.href);
    if (url.searchParams.get('edit') !== '1') {
        return;
    }
    console.log('[gsplat-edit] edit mode active');

    window.addEventListener('message', (event: MessageEvent) => {
        if (!isInboundMsg(event.data)) return;
        const msg = event.data;
        switch (msg.kind) {
            case 'set-settings': {
                // Mutate the shared settings object in place so other modules
                // (camera-manager, post-fx, etc.) see the latest values.
                Object.assign(global.settings, msg.settings);
                global.events.fire('gsplat.rebuild-annotations');
                global.app.renderNextFrame = true;
                break;
            }
            case 'get-camera-pose': {
                postToParent({
                    source: 'gsplat-viewer-edit',
                    kind: 'camera-pose',
                    pose: readCameraPose(global)
                });
                break;
            }
        }
    });

    // Tell the parent we're alive. Dashboard waits for this before sending the
    // first set-settings, so race conditions on iframe load don't drop messages.
    postToParent({ source: 'gsplat-viewer-edit', kind: 'ready' });
};

export { initGSplatEditMode };
