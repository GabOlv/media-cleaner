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
  time: string;
  motion: boolean;
}
export interface Mission {
  date: string;
  target: number;
  reviewed: string[];
  deleted: number;
  bytes: number;
}
export interface Journal {
  version: 2;
  preferences: Preferences;
  reviewed: string[];
  deleted: number;
  bytes: number;
  mission: Mission;
}
export interface Folder {
  path: string;
  count: number;
}

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
export function freshMission(target: number): Mission {
  return { date: localDay(), target, reviewed: [], deleted: 0, bytes: 0 };
}
export function freshJournal(): Journal {
  return {
    version: 2,
    preferences: {
      batchSize: 10,
      types: ["photo", "video", "audio"],
      protectedPaths: [],
      reminder: false,
      time: "20:00",
      motion: true,
    },
    reviewed: [],
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
export function record(
  journal: Journal,
  file: MediaFile,
  deleted: boolean,
): Journal {
  const state = today(journal);
  if (state.reviewed.includes(file.id)) return state;
  const bytes = deleted ? file.bytes || 0 : 0;
  return {
    ...state,
    reviewed: [...state.reviewed, file.id],
    deleted: state.deleted + Number(deleted),
    bytes: state.bytes + bytes,
    mission: {
      ...state.mission,
      reviewed: [...state.mission.reviewed, file.id],
      deleted: state.mission.deleted + Number(deleted),
      bytes: state.mission.bytes + bytes,
    },
  };
}
