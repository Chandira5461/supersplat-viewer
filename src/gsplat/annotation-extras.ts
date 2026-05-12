// gsplat-specific extension of the upstream Annotation type.
//
// Upstream `Annotation.extras` is typed `any` (see src/schemas/v2.ts) and passes
// through validation unchanged. We slot our rich-hotspot fields under
// `extras.gsplat` so the on-disk settings.json stays fully compatible with the
// upstream viewer: older / upstream viewers simply ignore unknown extras.

type GSplatAnnotationExtras = {
    area_sqft?: number;
    images?: string[];
};

type AnnotationExtras = {
    gsplat?: GSplatAnnotationExtras;
};

const readGSplatExtras = (extras: unknown): GSplatAnnotationExtras | undefined => {
    if (!extras || typeof extras !== 'object') return undefined;
    const g = (extras as AnnotationExtras).gsplat;
    if (!g || typeof g !== 'object') return undefined;
    return g;
};

export type { GSplatAnnotationExtras, AnnotationExtras };
export { readGSplatExtras };
