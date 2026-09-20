import { Platform } from "react-native";

export interface DustioMediaNativeModule {
  canManageMedia: () => boolean | Promise<boolean>;
  deleteAsset: (assetId: string, mediaKind: string) => Promise<boolean>;
}

let cached: DustioMediaNativeModule | null | undefined;

/** Loads the local Expo module only on Android builds that include it. */
export function getDustioMediaModule(): DustioMediaNativeModule | null {
  if (Platform.OS !== "android") return null;
  if (cached !== undefined) return cached;
  try {
    const { requireNativeModule } = require("expo-modules-core") as {
      requireNativeModule: <T>(name: string) => T;
    };
    cached = requireNativeModule<DustioMediaNativeModule>("DustioMedia");
  } catch {
    cached = null;
  }
  return cached;
}
