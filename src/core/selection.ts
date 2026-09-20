import { MediaFile, MediaKind } from "./model";

const KINDS: MediaKind[] = ["photo", "video", "audio"];

export type RandomSource = () => number;

/** Small deterministic PRNG used so a day's queue does not reshuffle on every reopen. */
export function seededRandom(seed: string): RandomSource {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ordered(files: MediaFile[]): MediaFile[] {
  return [...files].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
}

function weightedPick(weights: Map<MediaKind, number>, random: RandomSource): MediaKind {
  const entries = [...weights.entries()];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!total) return entries[0][0];
  let cursor = random() * total;
  for (const [kind, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return kind;
  }
  return entries[entries.length - 1][0];
}

/**
 * Selects from an already-oldest candidate window. The first item is always the
 * oldest one; later picks use adaptive type weights while each type remains
 * internally oldest-first. Missing media types never receive a forced quota.
 */
export function selectWeighted(
  candidates: MediaFile[],
  limit: number,
  seed = "dustio",
  random: RandomSource = seededRandom(seed),
): MediaFile[] {
  const size = Math.max(0, Math.floor(limit));
  const source = ordered(candidates);
  if (!size || !source.length) return [];
  if (source.length <= size) return source.slice(0, size);

  const result = [source[0]];
  const queues = new Map<MediaKind, MediaFile[]>();
  for (const kind of KINDS) queues.set(kind, []);
  for (const file of source.slice(1)) queues.get(file.kind)?.push(file);

  const weights = new Map<MediaKind, number>();
  for (const [kind, queue] of queues) if (queue.length) weights.set(kind, 1);

  while (result.length < size && weights.size) {
    const kind = weightedPick(weights, random);
    const queue = queues.get(kind) || [];
    const next = queue.shift();
    if (!next) {
      weights.delete(kind);
      continue;
    }
    result.push(next);

    for (const available of weights.keys()) {
      if (available === kind) weights.set(available, (weights.get(available) || 1) * 0.55);
      else weights.set(available, (weights.get(available) || 1) * 1.15);
    }
    if (!queue.length) weights.delete(kind);
  }

  return result;
}

export function candidateWindow(limit: number): number {
  return Math.max(50, Math.min(200, Math.max(1, Math.floor(limit)) * 5));
}
