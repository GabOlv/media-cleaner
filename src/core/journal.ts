import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clampBatchSize,
  DEFAULT_REMINDER_TIMES,
  freshJournal,
  Journal,
  normalizeReminderTimes,
  timeToMinutes,
  today,
} from "./model";

const KEY = "@media_cleaner_journal_v4";
const PREVIOUS_KEYS = [
  "@media_cleaner_journal_v3",
  "@media_cleaner_journal_v2",
  "@media_cleaner_robot_v1",
];

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string")))
    : [];
}

function migrateTimes(preferences: any): number[] {
  const raw = Array.isArray(preferences?.reminderTimes)
    ? preferences.reminderTimes
    : [];
  const parsed = raw
    .map((value: unknown) =>
      typeof value === "number" ? value : typeof value === "string" ? timeToMinutes(value) : null,
    )
    .filter((value: number | null): value is number => value !== null);
  const legacy = typeof preferences?.time === "string" ? timeToMinutes(preferences.time) : null;
  return normalizeReminderTimes(parsed.length ? parsed : legacy === null ? DEFAULT_REMINDER_TIMES : [legacy], parsed.length || 1);
}

function project(raw: any): Journal {
  const base = freshJournal();
  const oldPreferences = raw?.preferences || {};
  const batchSize = clampBatchSize(Number(oldPreferences.batchSize) || base.preferences.batchSize);
  const types = (["photo", "video", "audio"] as const).filter((kind) =>
    Array.isArray(oldPreferences.types) ? oldPreferences.types.includes(kind) : true,
  );
  const protectedPaths = strings(oldPreferences.protectedPaths).filter((path) => path.startsWith("/"));
  const legacyPaths = strings(oldPreferences.legacyPaths).filter((path) => path.startsWith("/"));
  const mission = raw?.mission || {};
  const ignoredIds = strings(raw?.ignoredIds ?? raw?.reviewed);
  const reviewedIds = strings(mission.reviewed);
  const reviewed = new Set(reviewedIds);
  const ignored = new Set(ignoredIds);
  return {
    version: 4,
    preferences: {
      batchSize,
      types: types.length ? [...types] : [...base.preferences.types],
      protectedPaths,
      ...(legacyPaths.length ? { legacyPaths } : {}),
      reminder: oldPreferences.reminder === true,
      reminderTimes: migrateTimes(oldPreferences),
      motion: oldPreferences.motion !== false,
    },
    ignoredIds,
    deleted: Number.isFinite(raw?.deleted) ? Math.max(0, raw.deleted) : 0,
    bytes: Number.isFinite(raw?.bytes) ? Math.max(0, raw.bytes) : 0,
    mission: {
      date: typeof mission.date === "string" ? mission.date : base.mission.date,
      target: clampBatchSize(Number(mission.target) || batchSize),
      reviewed: reviewedIds,
      deleted: Number.isFinite(mission.deleted) ? Math.max(0, mission.deleted) : 0,
      bytes: Number.isFinite(mission.bytes) ? Math.max(0, mission.bytes) : 0,
      queueIds: strings(mission.queueIds).filter((id) => !reviewed.has(id) && !ignored.has(id)),
    },
  };
}

export async function loadJournal(): Promise<Journal> {
  const current = await AsyncStorage.getItem(KEY);
  let raw = current;
  let sourceKey = KEY;
  if (!raw) {
    for (const key of PREVIOUS_KEYS) {
      raw = await AsyncStorage.getItem(key);
      if (raw) {
        sourceKey = key;
        break;
      }
    }
  }
  if (raw) {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Não foi possível ler seu progresso. Seus dados continuam guardados.");
    }
    if (!parsed || !parsed.preferences || !parsed.mission) {
      throw new Error("Não foi possível ler seu progresso. Seus dados continuam guardados.");
    }
    const migrated = today(project(parsed));
    if (sourceKey !== KEY || parsed.version !== 4) await saveJournal(migrated);
    return migrated;
  }

  const state = freshJournal();
  const legacySettings = await AsyncStorage.getItem("@media_cleaner_settings");
  if (legacySettings) {
    let old: any;
    try {
      old = JSON.parse(legacySettings);
    } catch {
      old = {};
    }
    const oldBatch = Number(old.batchSize);
    if ([5, 10, 15, 20].includes(oldBatch)) {
      state.preferences.batchSize = oldBatch;
      state.mission.target = oldBatch;
    }
    state.preferences.protectedPaths = strings(old.excludedFolderPaths).filter((path) => path.startsWith("/"));
    if (state.preferences.protectedPaths.length)
      state.preferences.legacyPaths = [...state.preferences.protectedPaths];
    state.preferences.types = (["photo", "video", "audio"] as const).filter(
      (_, index) => old[["includePhotos", "includeVideos", "includeAudios"][index]] !== false,
    );
    const legacyTimes = Array.isArray(old.reminderTimes)
      ? old.reminderTimes
      : typeof old.reminderTime === "string"
        ? [old.reminderTime]
        : [];
    const times = legacyTimes
      .map((value: unknown) => (typeof value === "string" ? timeToMinutes(value) : null))
      .filter((value: number | null): value is number => value !== null);
    if (times.length) state.preferences.reminderTimes = normalizeReminderTimes(times, Math.min(3, times.length));
    state.preferences.reminder = old.dailyReminderEnabled === true;
  }
  const reviewed = await AsyncStorage.getItem("@media_cleaner_reviewed_ids");
  if (reviewed) {
    try {
      state.ignoredIds = strings(JSON.parse(reviewed)).filter((id) => !id.startsWith("mock_"));
    } catch {
      /* Keep the empty, trustworthy state. */
    }
  }
  await saveJournal(state);
  return state;
}

export async function saveJournal(journal: Journal): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(journal));
}
