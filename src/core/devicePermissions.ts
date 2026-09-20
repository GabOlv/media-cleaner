import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import { getDustioMediaModule } from "./nativeMedia";

const MEDIA_MANAGEMENT_PROMPTED_KEY = "@media_cleaner_media_management_prompted_v2";

/** Android's special media-management access is available outside Expo Go on API 31+. */
export function supportsMediaManagement(): boolean {
  return (
    Platform.OS === "android" &&
    Number(Platform.Version) >= 31 &&
    Constants.executionEnvironment !== "storeClient"
  );
}

/** Checks the special access that removes Android's per-file delete confirmation. */
export async function hasMediaManagementAccess(): Promise<boolean | null> {
  if (!supportsMediaManagement()) return null;
  const native = getDustioMediaModule();
  if (!native) return false;
  try {
    return Boolean(await native.canManageMedia());
  } catch {
    return false;
  }
}

/** Opens Android's one-time media-management access screen. */
export async function openMediaManagementSettings(): Promise<void> {
  if (!supportsMediaManagement()) return;
  await Linking.sendIntent("android.settings.REQUEST_MANAGE_MEDIA");
}

/**
 * Offers the special access once on first launch. If the user declines it,
 * Settings keeps the explicit recovery path available without reopening it
 * on every app resume.
 */
export async function promptMediaManagementAccess(): Promise<boolean | null> {
  const granted = await hasMediaManagementAccess();
  if (granted !== false) return granted;
  if (await AsyncStorage.getItem(MEDIA_MANAGEMENT_PROMPTED_KEY)) return false;
  await AsyncStorage.setItem(MEDIA_MANAGEMENT_PROMPTED_KEY, "1");
  await openMediaManagementSettings();
  return false;
}
