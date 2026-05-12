import { Entity } from 'playcanvas';

import { Annotation } from './annotation';
import { readGSplatExtras } from './gsplat/annotation-extras';
import type { Annotation as AnnotationSettings } from './settings';
import type { Global } from './types';

class Annotations {
    annotations: AnnotationSettings[];

    parentDom: HTMLElement;

    // gsplat: track created entities + script map so we can rebuild without
    // losing references on a settings hot-replace from edit-mode.
    private entityList: Entity[] = [];

    private scriptMap = new Map<AnnotationSettings, Annotation>();

    private global: Global;

    constructor(global: Global, hasCameraFrame: boolean) {
        this.global = global;

        // create dom parent
        const parentDom = document.createElement('div');
        parentDom.id = 'annotations';
        Annotation.parentDom = parentDom;
        document.querySelector('#ui').appendChild(parentDom);

        this.annotations = global.settings.annotations;
        this.parentDom = parentDom;

        const { state } = global;

        const updateVisibility = () => {
            const firstPersonGamingControls = (
                (state.cameraMode === 'walk' || state.cameraMode === 'fly') &&
                state.gamingControls
            );
            const hidden = state.controlsHidden || firstPersonGamingControls;
            parentDom.style.display = hidden ? 'none' : 'block';
            Annotation.opacity = hidden ? 0.0 : 1.0;
            if (this.annotations.length > 0) {
                global.app.renderNextFrame = true;
            }
        };

        global.events.on('controlsHidden:changed', updateVisibility);
        global.events.on('cameraMode:changed', updateVisibility);
        global.events.on('gamingControls:changed', updateVisibility);
        updateVisibility();

        if (hasCameraFrame) {
            Annotation.hotspotColor.gamma();
            Annotation.hoverColor.gamma();
        }

        this._createEntities();

        // handle navigator requesting an annotation to be shown
        global.events.on('annotation.navigate', (ann: AnnotationSettings) => {
            const script = this.scriptMap.get(ann);
            if (script) {
                script.showTooltip();
            }
        });

        // gsplat edit-mode: rebuild annotation entities when settings are
        // hot-replaced via postMessage (M4 annotation editor flow).
        global.events.on('gsplat.rebuild-annotations', () => this.rebuild());
    }

    private _createEntities() {
        const parent = this.global.app.root;
        const events = this.global.events;

        for (let i = 0; i < this.annotations.length; i++) {
            const ann = this.annotations[i];

            const entity = new Entity();
            entity.addComponent('script');
            entity.script.create(Annotation);
            const script = entity.script as any;
            script.annotation.label = (i + 1).toString();
            script.annotation.title = ann.title;
            script.annotation.text = ann.text;

            // gsplat: pass through optional rich-hotspot fields from extras.gsplat
            const extras = readGSplatExtras(ann.extras);
            if (extras) {
                script.annotation.areaSqft = extras.area_sqft;
                script.annotation.images = extras.images;
            }

            entity.setPosition(ann.position[0], ann.position[1], ann.position[2]);

            parent.addChild(entity);

            this.entityList.push(entity);
            this.scriptMap.set(ann, script.annotation);

            // handle an annotation being activated/shown
            script.annotation.on('show', () => {
                events.fire('annotation.activate', ann);
            });

            script.annotation.on('hide', () => {
                events.fire('annotation.deactivate');
            });

            // re-render if hover state changes
            script.annotation.on('hover', () => {
                this.global.app.renderNextFrame = true;
            });
        }

        this.global.app.renderNextFrame = true;
    }

    // gsplat: tear down all annotation entities (destroys their scripts, hotspot
    // DOMs, etc. — Annotation.initialize() registers a 'destroy' listener that
    // cleans up the DOM/textures), then read the latest annotation list from
    // global.settings.annotations and recreate. Called by edit-mode after a
    // set-settings postMessage from the parent.
    rebuild() {
        for (const entity of this.entityList) {
            entity.destroy();
        }
        this.entityList = [];
        this.scriptMap.clear();
        this.annotations = this.global.settings.annotations;
        this._createEntities();
    }
}

export { Annotations };
