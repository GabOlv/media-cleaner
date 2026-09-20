/** Product switches kept in one place so optional tools can be removed cleanly. */
import { Platform } from "react-native";

export const features = {
  // Keep the demo available for the browser test harness, but do not expose
  // it in the native APK used for real media reviews.
  demoMode: Platform.OS === "web",
} as const;
