import { Platform } from "react-native";
import type { Preferences } from "./model";

const OWNER = "media-cleaner-daily-review";
const CHANNEL = "daily-review";

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
  if (Platform.OS === "web") return false;
  const n = await import("expo-notifications");
  await cancelOwned(n);
  if (!preferences.reminder) return true;
  if (Platform.OS === "android")
    await n.setNotificationChannelAsync(CHANNEL, {
      name: "Revisões diárias",
      importance: n.AndroidImportance.DEFAULT,
    });
  const result = request
    ? await n.requestPermissionsAsync()
    : await n.getPermissionsAsync();
  if (!result.granted) return false;
  const triggerType = n.SchedulableTriggerInputTypes.DAILY;
  await Promise.all(
    preferences.reminderTimes.slice(0, 3).map((minutes, index) =>
      n.scheduleNotificationAsync({
        content: {
          title: "Revisão de arquivos",
          body: `Você pode revisar até ${preferences.batchSize} arquivos quando for conveniente.`,
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
  return true;
}

export { CHANNEL as REMINDER_CHANNEL, OWNER as REMINDER_OWNER };
