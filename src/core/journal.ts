import AsyncStorage from "@react-native-async-storage/async-storage";
import { freshJournal, Journal, today } from "./model";

const KEY = "@media_cleaner_journal_v2";
const PREVIOUS_KEY = "@media_cleaner_robot_v1";
export async function loadJournal(): Promise<Journal> {
  const current = await AsyncStorage.getItem(KEY);
  const raw = current ?? await AsyncStorage.getItem(PREVIOUS_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (
      ![1, 2].includes(parsed.version) ||
      !Array.isArray(parsed.reviewed) ||
      !parsed.preferences ||
      !parsed.mission
    ) {
      throw new Error(
        "Não foi possível ler seu progresso. Seus dados continuam guardados.",
      );
    }
    // Explicit projection drops retired reward fields without losing real history.
    const migrated: Journal = {
      version: 2,
      preferences: parsed.preferences,
      reviewed: parsed.reviewed,
      deleted: parsed.deleted,
      bytes: parsed.bytes,
      mission: parsed.mission,
    };
    if (!current || parsed.version !== 2) await saveJournal(migrated);
    return today(migrated);
  }
  const state = freshJournal();
  // Import only explicit settings/history. Old fabricated statistics and catalogs are not evidence.
  const legacy = await AsyncStorage.getItem("@media_cleaner_settings");
  if (legacy) {
    const old = JSON.parse(legacy);
    if ([5, 10, 15, 20].includes(old.batchSize))
      state.preferences.batchSize = old.batchSize;
    state.preferences.protectedPaths = (old.excludedFolderPaths || []).filter(
      (p: unknown) => typeof p === "string" && p.startsWith("/"),
    );
    // The old catalog rewrote paths and lowercased them. Select each real folder once.
    state.preferences.legacyPaths = [...state.preferences.protectedPaths];
    state.preferences.types = (["photo", "video", "audio"] as const).filter(
      (_, i) =>
        old[["includePhotos", "includeVideos", "includeAudios"][i]] !== false,
    );
    const time = old.reminderTimes?.[0];
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time || ""))
      state.preferences.time = time;
    state.preferences.reminder = old.dailyReminderEnabled === true;
    state.mission.target = state.preferences.batchSize;
  }
  const reviewed = await AsyncStorage.getItem("@media_cleaner_reviewed_ids");
  if (reviewed)
    state.reviewed = JSON.parse(reviewed).filter(
      (id: unknown) => typeof id === "string" && !id.startsWith("mock_"),
    );
  await saveJournal(state);
  return state;
}
export async function saveJournal(journal: Journal): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(journal));
}
