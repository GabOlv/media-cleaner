import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

export const palette = {
  bg: "#F7F8F4",
  paper: "#FFFFFF",
  ink: "#243E35",
  muted: "#63756C",
  green: "#2E6B50",
  soft: "#E7F0E9",
  line: "#DCE3DC",
  peach: "#FBEEE2",
  orange: "#A94D2C",
};
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        secondary && ui.secondary,
        { opacity: disabled ? 0.45 : pressed ? 0.78 : 1 },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={21}
          color={secondary ? palette.green : "white"}
        />
      )}
      <Text style={[ui.buttonText, secondary && { color: palette.green }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Progress({
  value,
  label,
  gold = false,
  motion = false,
}: {
  value: number;
  label: string;
  gold?: boolean;
  motion?: boolean;
}) {
  const progress = Math.max(0, Math.min(1, value));
  const fill = useRef(new Animated.Value(progress)).current;
  useEffect(() => {
    const animation = Animated.timing(fill, {
      toValue: progress,
      duration: motion ? 350 : 0,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, motion, fill]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={ui.track}
    >
      <Animated.View
        style={[
          ui.fill,
          {
            width: fill.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
            backgroundColor: gold ? "#C99535" : "#3B8060",
          },
        ]}
      />
    </View>
  );
}
export function Row({
  title,
  detail,
  icon,
  onPress,
}: {
  title: string;
  detail?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [ui.row, { opacity: pressed ? 0.65 : 1 }]}
    >
      <View style={ui.rowIcon}>
        <Ionicons name={icon} size={24} color={palette.green} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={ui.rowTitle}>{title}</Text>
        {detail && <Text style={ui.small}>{detail}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={palette.muted} />
    </Pressable>
  );
}
export const ui = StyleSheet.create({
  page: {
    padding: 24,
    paddingBottom: 36,
    gap: 24,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  eyebrow: {
    color: palette.green,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  title: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: "700",
    letterSpacing: -1,
    color: palette.ink,
  },
  h2: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "700",
    color: palette.ink,
    letterSpacing: -0.4,
  },
  body: { fontSize: 17, lineHeight: 25, color: palette.muted },
  small: { fontSize: 14, lineHeight: 21, color: palette.muted },
  card: {
    padding: 22,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 26,
    backgroundColor: palette.paper,
    gap: 16,
  },
  button: {
    minHeight: 56,
    backgroundColor: palette.green,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondary: { backgroundColor: palette.soft },
  buttonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 17,
    textAlign: "center",
    flexShrink: 1,
  },
  track: {
    height: 10,
    borderRadius: 6,
    backgroundColor: "#DDE6DD",
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 6 },
  row: {
    minHeight: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: palette.line,
  },
  rowIcon: {
    width: 46,
    height: 46,
    backgroundColor: palette.soft,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  rowTitle: { fontSize: 18, fontWeight: "600", color: palette.ink },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 14,
    backgroundColor: "white",
    paddingHorizontal: 16,
    fontSize: 18,
    color: palette.ink,
  },
});
