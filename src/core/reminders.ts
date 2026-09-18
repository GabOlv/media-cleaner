import { Platform } from "react-native";
import type { Preferences } from "./model";
export async function schedule(
  preferences: Preferences,
  request = false,
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const n = await import("expo-notifications");
  // Cancel old schedules before setting up the replacement, including disabled reminders.
  await n.cancelAllScheduledNotificationsAsync();
  if (!preferences.reminder) return true;
  if (Platform.OS === "android")
    await n.setNotificationChannelAsync("daily-robot", {
      name: "Revisão diária",
      importance: n.AndroidImportance.DEFAULT,
    });
  const result = request
    ? await n.requestPermissionsAsync()
    : await n.getPermissionsAsync();
  if (!result.granted) return false;
  const [hour, minute] = preferences.time.split(":").map(Number);
  await n.scheduleNotificationAsync({
    content: {
      title: "Revisão de arquivos",
      body: `Revise até ${preferences.batchSize} arquivos e escolha o que deseja manter.`,
      data: { screen: "mission" },
    },
    trigger: {
      type: n.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: "daily-robot",
    },
  });
  return true;
}
