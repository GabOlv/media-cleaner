import { Platform } from "react-native";
import type { Preferences } from "./model";

const OWNER = "media-cleaner-daily-review";
const CHANNEL = "daily-review";

export interface ReminderSyncResult {
  ok: boolean;
  permissionGranted: boolean | null;
  scheduled: number;
}

async function cancelOwned(n: any): Promise<void> {
  const scheduled = await n.getAllScheduledNotificationsAsync?.();
  if (Array.isArray(scheduled) && n.cancelScheduledNotificationAsync) {
    await Promise.all(
      scheduled
        .filter((item: any) => item.content?.data?.owner === OWNER)
        .map((item: any) => n.cancelScheduledNotificationAsync(item.identifier)),
    );
    return;
  }
  // Kept only for old mocked/runtime surfaces without per-notification lookup.
  if (n.cancelAllScheduledNotificationsAsync) await n.cancelAllScheduledNotificationsAsync();
}

export async function schedule(
  preferences: Preferences,
  request = false,
): Promise<boolean> {
  return (await syncReminders(preferences, request)).ok;
}

export async function syncReminders(
  preferences: Preferences,
  request = false,
): Promise<ReminderSyncResult> {
  if (Platform.OS === "web") return { ok: false, permissionGranted: null, scheduled: 0 };
  const n = await import("expo-notifications");
  n.setNotificationHandler?.({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  await cancelOwned(n);
  if (!preferences.reminder) return { ok: true, permissionGranted: null, scheduled: 0 };
  if (Platform.OS === "android")
    await n.setNotificationChannelAsync(CHANNEL, {
      name: "Revisões diárias",
      importance: n.AndroidImportance.DEFAULT,
    });
  const result = request
    ? await n.requestPermissionsAsync()
    : await n.getPermissionsAsync();
  if (!result.granted) return { ok: false, permissionGranted: false, scheduled: 0 };
  const triggerType = n.SchedulableTriggerInputTypes.DAILY;
  await Promise.all(
    preferences.reminderTimes.slice(0, 3).map((minutes, index) =>
      n.scheduleNotificationAsync({
        content: {
          title: "Hora de limpar o celular",
          body: "Abra o Dustio para revisar sua lista.",
          data: { owner: OWNER, slot: index, screen: "mission" },
        },
        trigger: {
          type: triggerType,
          hour: Math.floor(minutes / 60),
          minute: minutes % 60,
          channelId: CHANNEL,
        },
      }),
    ),
  );
  return {
    ok: true,
    permissionGranted: true,
    scheduled: preferences.reminderTimes.slice(0, 3).length,
  };
}

export { CHANNEL as REMINDER_CHANNEL, OWNER as REMINDER_OWNER };
