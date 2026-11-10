/**
 * Freeze `Date` for the page-level visual fixture build.
 *
 * The albums/projects freshness label is rendered at build time (`normalizeCollection`
 * defaults to `new Date()`), so without this the label increments every day and the committed
 * screenshots fail even when no CSS changed. Keep in sync with `FROZEN_NOW` in
 * `e2e/pages.visual.spec.ts`; bump both only in a baseline-regeneration commit.
 */
const FIXED = Date.parse("2026-11-09T12:00:00.000Z");
const NativeDate = Date;

class FrozenDate extends NativeDate {
    constructor(...args) {
        if (args.length === 0) super(FIXED);
        else super(...args);
    }

    static now() {
        return FIXED;
    }
}

globalThis.Date = FrozenDate;
