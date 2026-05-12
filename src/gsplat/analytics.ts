import type { Annotation as AnnotationSettings } from '../settings';
import type { Global } from '../types';

type EventName =
    | 'tour_started'
    | 'tour_ended'
    | 'hotspot_clicked'
    | 'annotation_dismissed'
    | 'camera_position_sample';

type AnalyticsConfig = {
    sceneId: string | null;
    beaconUrl: string | null;
};

const CAMERA_SAMPLE_INTERVAL_MS = 5000;

class Analytics {
    private global: Global;

    private sessionId: string;

    private sceneId: string | null;

    private beaconUrl: string | null;

    private tourStartedAt: number | null = null;

    private currentAnnotationStart: number | null = null;

    private cameraSampleHandle: number | null = null;

    constructor(global: Global, cfg: AnalyticsConfig) {
        this.global = global;
        this.sessionId = this._uuid();
        this.sceneId = cfg.sceneId;
        this.beaconUrl = cfg.beaconUrl;

        if (global.state.loaded) {
            this._tourStarted();
        } else {
            global.events.on('loaded:changed', (loaded: boolean) => {
                if (loaded && this.tourStartedAt === null) {
                    this._tourStarted();
                }
            });
        }

        global.events.on('annotation.activate', (ann: AnnotationSettings) => {
            this.currentAnnotationStart = performance.now();
            this._emit('hotspot_clicked', {
                title: ann.title,
                room_index: global.settings.annotations.indexOf(ann),
                position: ann.position
            });
        });

        global.events.on('annotation.deactivate', () => {
            if (this.currentAnnotationStart !== null) {
                const dwellMs = performance.now() - this.currentAnnotationStart;
                this._emit('annotation_dismissed', { dwell_ms: Math.round(dwellMs) });
                this.currentAnnotationStart = null;
            }
        });

        window.addEventListener('pagehide', () => this._tourEnded());
        // pagehide fires reliably on tab close + back/forward navigation;
        // beforeunload is a fallback for browsers where pagehide is missed.
        window.addEventListener('beforeunload', () => this._tourEnded());
    }

    private _tourStarted() {
        this.tourStartedAt = performance.now();
        this._emit('tour_started', {});

        if (this.cameraSampleHandle === null) {
            this.cameraSampleHandle = window.setInterval(() => {
                if (!this.global.camera) return;
                const p = this.global.camera.getPosition();
                this._emit('camera_position_sample', {
                    position: [p.x, p.y, p.z]
                });
            }, CAMERA_SAMPLE_INTERVAL_MS);
        }
    }

    private _tourEnded() {
        if (this.tourStartedAt === null) return;
        const durationMs = performance.now() - this.tourStartedAt;
        this._emit('tour_ended', { duration_ms: Math.round(durationMs) });
        this.tourStartedAt = null;
        if (this.cameraSampleHandle !== null) {
            window.clearInterval(this.cameraSampleHandle);
            this.cameraSampleHandle = null;
        }
    }

    private _emit(name: EventName, data: Record<string, unknown>) {
        const payload = {
            event: name,
            session_id: this.sessionId,
            scene_id: this.sceneId,
            timestamp: Date.now(),
            ...data
        };

        const inIframe = window.parent !== window;

        if (inIframe) {
            try {
                window.parent.postMessage({ source: 'gsplat-viewer', payload }, '*');
            } catch (e) {
                // swallow — analytics must never break the experience
            }
        }

        if (this.beaconUrl && navigator.sendBeacon) {
            let accepted = false;
            try {
                // text/plain avoids the CORS preflight that application/json triggers,
                // so sendBeacon fires across origins without a separate OPTIONS handshake.
                // Receivers should parse the body as JSON regardless of Content-Type.
                const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain' });
                accepted = navigator.sendBeacon(this.beaconUrl, blob);
            } catch (e) {
                // swallow
            }
            console.debug(`[gsplat-analytics] beacon ${name} → ${this.beaconUrl}: sendBeacon returned ${accepted}`);
            if (inIframe) {
                try {
                    window.parent.postMessage({
                        source: 'gsplat-viewer-debug',
                        kind: 'beacon-attempt',
                        event: name,
                        beaconUrl: this.beaconUrl,
                        accepted
                    }, '*');
                } catch (e) {
                    // swallow
                }
            }
        }
    }

    private _uuid(): string {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

export { Analytics };
export type { AnalyticsConfig };
