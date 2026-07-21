/**
 * Type declarations for @sailingnaturali/station-corrections.
 *
 * Kept in step with src/index.js by two checks that need each other:
 * types/surface.ts type-checks consumer-shaped usage of every export, and
 * src/public-surface.test.js asserts every runtime export is declared here.
 * tsc alone cannot catch a declaration that was never written, because
 * nothing references it.
 */

/** A station as the provider publishes it — the input to a resolver. */
export interface Station {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

/** A place in the gazetteer, used to derive a context when nothing better exists. */
export interface GazetteerPlace {
  name: string;
  region: string;
  latitude: number;
  longitude: number;
}

/** One record in the corrections file. Every field is optional except `reason`, which `position` requires. */
export interface Correction {
  name?: string;
  context?: string;
  slug?: string;
  cities?: string[];
  aliases?: string[];
  /** A corrected `[latitude, longitude]`. Requires `reason`. */
  position?: [number, number];
  /** Why the published position is wrong. Required whenever `position` is set. */
  reason?: string;
  /** Why the published position is *right* despite reading inland. Mutually exclusive with `position`. */
  positionVerified?: string;
}

/** A station after the corrections overlay is applied. */
export interface ResolvedStation {
  id: string;
  name: string;
  context: string;
  slug: string;
  cities: string[];
  aliases: string[];
  latitude: number;
  longitude: number;
  /** True when the position came from a correction rather than the provider. */
  corrected: boolean;
  /** True when the context was derived from the nearest gazetteer place. */
  derived: boolean;
  /** Present only when the correction sets it. */
  positionVerified?: string;
}

export type Resolver = (station: Station) => ResolvedStation;

/**
 * Corrections keyed by provider station ID. IDs are opaque strings —
 * `noaa/9447659`, `chs-active-pass`, `PUG1717` — so nothing may assume a format.
 */
export type Corrections = Map<string, Correction>;

/** Build a resolver over the corrections and gazetteer this package ships. Runs in Node and in the browser. */
export function createBundledResolver(): Resolver;

/** Build a resolver over your own corrections and gazetteer. */
export function createResolver(options?: {
  corrections?: Corrections;
  gazetteer?: GazetteerPlace[];
}): Resolver;

/** Parse a corrections YAML document into a map keyed by station ID. */
export function loadCorrections(yamlText: string): Corrections;

/** Check a corrections map for the mistakes contributors make. Returns human-readable problems; empty means valid. */
export function validateCorrections(map: Corrections): string[];

/**
 * Check that each corrected position is a plausible distance from the
 * provider's published one. Stations absent from `stations` are skipped.
 */
export function validateAgainstStations(
  map: Corrections,
  stations: Station[] | null | undefined,
  options?: { maxKm?: number },
): string[];

/** How far a correction may move a station from its published position, in kilometres. */
export const MAX_CORRECTION_KM: number;

/** Clean a provider's station name. Only ALL-CAPS runs are re-cased. */
export function cleanName(raw: string): string;

/** Derive a URL slug from a display name. */
export function toSlug(name: string): string;

/** One station's pinned position and audit verdict. */
export interface LockEntry {
  position: [number, number];
  verdict: "clear" | "verified" | "ashore";
  /** Present only on an `ashore` verdict. */
  metresInland?: number;
}

export interface Lock {
  note: string;
  generated: string;
  coastline: string;
  thresholdM: number;
  stations: Record<string, LockEntry>;
}

export interface LockDiff {
  moved: { id: string; was: [number, number]; now: [number, number] }[];
  added: string[];
  removed: string[];
  unchanged: string[];
}

/**
 * Pin every station's resolved position and audit verdict.
 *
 * `classify` is injected rather than imported so that using the lock API
 * never pulls in the coastline parse.
 */
export function buildLock(
  stations: Station[],
  options: {
    resolve: Resolver;
    classify: (resolved: ResolvedStation, thresholdM?: number) => Omit<LockEntry, "position">;
    coastlineFingerprint: string;
    thresholdM: number;
  },
): Lock;

/** Parse a lock from its on-disk JSON string. */
export function readLock(json: string): Lock;

/** Compare a lock against the current station list. */
export function diffLock(lock: Lock, stations: Station[], options: { resolve: Resolver }): LockDiff;
