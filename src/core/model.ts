export type MediaKind = "photo" | "video" | "audio";

export interface MediaFile {
  id: string;
  uri: string;
  filename: string;
  kind: MediaKind;
  created: number;
  path?: string;
  albumId?: string;
  bytes?: number;
  demo?: boolean;
}

export interface Preferences {
  batchSize: number;
  types: MediaKind[];
  protectedPaths: string[];
  legacyPaths?: string[];
  reminder: boolean;
  reminderTimes: number[];
  motion: boolean;
}

export interface Mission {
  date: string;
  target: number;
  reviewed: string[];
  deleted: number;
  bytes: number;
  /** IDs already selected for this day's review and still pending. */
  queueIds: string[];
}

export interface Journal {
  version: 4;
  preferences: Preferences;
  /** Files deliberately kept out of future reviews. */
  ignoredIds: string[];
  deleted: number;
  bytes: number;
  mission: Mission;
}

export interface Folder {
  path: string;
  count: number;
}

export const DEFAULT_REMINDER_TIMES = [20 * 60];
export const DEFAULT_REMINDER_SLOTS = [9 * 60, 15 * 60, 20 * 60];

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function normalizePath(path: string): string {
  const isFileUri = /^file:\/\//i.test(path);
  let value = path.replace(/^file:\/\//i, "");
  try {
    if (isFileUri) value = decodeURIComponent(value);
  } catch {
    /* Preserve literal invalid escapes. */
  }
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

export function within(path: string, parent: string): boolean {
  const p = normalizePath(path),
    root = normalizePath(parent);
  return !!root && (p === root || p.startsWith(root + "/"));
}

export function isProtected(
  path: string | undefined,
  exclusions: string[],
): boolean {
  return !!path && exclusions.some((root) => within(path, root));
}

export function protect(paths: string[], path: string): string[] {
  const clean = normalizePath(path);
  if (!clean || paths.some((root) => within(clean, root))) return paths;
  return [...paths.filter((root) => !within(root, clean)), clean].sort();
}

export function shortPath(path: string): string {
  return path
    .replace(/^\/storage\/emulated\/0\//, "")
    .replace(/^\/storage\//, "");
}

export function clampBatchSize(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value || 1)));
}

export function minutesToTime(minutes: number): string {
  const value = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]),
    minute = Number(match[2]);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60
    ? hour * 60 + minute
    : null;
}

function validMinute(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? ((Math.round(value) % 1440) + 1440) % 1440
    : null;
}

/** Keeps slots unique. A collision is moved forward in ten-minute increments. */
export function normalizeReminderTimes(
  times: number[],
  count = Math.max(1, Math.min(3, times.length || 1)),
): number[] {
  const size = Math.max(1, Math.min(3, Math.round(count)));
  const result: number[] = [];
  for (let index = 0; index < size; index++) {
    let candidate = validMinute(times[index]);
    if (candidate === null) candidate = DEFAULT_REMINDER_SLOTS[index];
    while (result.includes(candidate)) candidate = (candidate + 10) % 1440;
    result.push(candidate);
  }
  return result;
}

/** Gives the edited slot priority, shifting later slots when needed. */
export function setReminderTime(
  times: number[],
  index: number,
  value: number,
): number[] {
  const size = Math.max(1, Math.min(3, Math.max(times.length, index + 1)));
  const source = normalizeReminderTimes(times, size);
  source[index] = validMinute(value) ?? source[index] ?? DEFAULT_REMINDER_SLOTS[index];
  const result: number[] = [];
  for (let i = 0; i < source.length; i++) {
    let candidate = source[i];
    while (result.includes(candidate)) candidate = (candidate + 10) % 1440;
    result.push(candidate);
  }
  return result;
}

export function freshMission(target: number): Mission {
  return {
    date: localDay(),
    target: clampBatchSize(target),
    reviewed: [],
    deleted: 0,
    bytes: 0,
    queueIds: [],
  };
}

export function freshJournal(): Journal {
  return {
    version: 4,
    preferences: {
      batchSize: 10,
      types: ["photo", "video", "audio"],
      protectedPaths: [],
      reminder: false,
      reminderTimes: [...DEFAULT_REMINDER_TIMES],
      motion: true,
    },
    ignoredIds: [],
    deleted: 0,
    bytes: 0,
    mission: freshMission(10),
  };
}

export function today(journal: Journal): Journal {
  return journal.mission.date === localDay()
    ? journal
    : { ...journal, mission: freshMission(journal.preferences.batchSize) };
}

/** Starts another review session without resetting today's deletion totals. */
export function newReview(journal: Journal): Journal {
  const state = today(journal);
  return {
    ...state,
    mission: {
      ...state.mission,
      target: clampBatchSize(state.preferences.batchSize),
      reviewed: [],
      queueIds: [],
    },
  };
}

/** Records a resolved item. Kept items become ignored; deleted items do not. */
export function record(
  journal: Journal,
  file: MediaFile,
  deleted: boolean,
): Journal {
  const state = today(journal);
  if (state.mission.reviewed.includes(file.id)) return state;
  const bytes = deleted ? file.bytes || 0 : 0;
  return {
    ...state,
    ignoredIds: deleted
      ? state.ignoredIds
      : Array.from(new Set([...state.ignoredIds, file.id])),
    deleted: state.deleted + Number(deleted),
    bytes: state.bytes + bytes,
    mission: {
      ...state.mission,
      reviewed: [...state.mission.reviewed, file.id],
      deleted: state.mission.deleted + Number(deleted),
      bytes: state.mission.bytes + bytes,
      queueIds: state.mission.queueIds.filter((id) => id !== file.id),
    },
  };
}

/** Removes an item from the pending queue without treating it as reviewed. */
export function removeFromQueue(journal: Journal, id: string): Journal {
  const state = today(journal);
  if (!state.mission.queueIds.includes(id)) return state;
  return {
    ...state,
    mission: {
      ...state.mission,
      queueIds: state.mission.queueIds.filter((item) => item !== id),
    },
  };
}

/** Replaces the pending queue while preserving order and removing duplicates. */
export function setQueue(journal: Journal, ids: string[]): Journal {
  const state = today(journal);
  const reviewed = new Set(state.mission.reviewed);
  const ignored = new Set(state.ignoredIds);
  const queueIds = Array.from(
    new Set(ids.filter((id) => !!id && !reviewed.has(id) && !ignored.has(id))),
  );
  return {
    ...state,
    mission: {
      ...state.mission,
      queueIds,
    },
  };
}
