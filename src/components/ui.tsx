import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

export const palette = {
  background: "#F7FAF7",
  surface: "#FFFFFF",
  surfaceWarm: "#EDF6EF",
  accent: "#2E6B50",
  accentSoft: "#B7D9C2",
  accentPale: "#E1F0E5",
  accentText: "#1F4C37",
  ink: "#243E35",
  muted: "#5F7168",
  border: "#D9E5DC",
  danger: "#A83226",
  success: "#2E6B50",
  disabled: "#9CAAA2",
};

export type IconName = keyof typeof Ionicons.glyphMap;

export function Button({
  label,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
  icon,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: IconName;
  compact?: boolean;
}) {
  const color = danger ? palette.danger : palette.accent;
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        ui.button,
        compact && ui.buttonCompact,
        secondary && ui.buttonSecondary,
        danger && ui.buttonDanger,
        focused && ui.focus,
        { opacity: disabled ? 0.48 : pressed ? 0.72 : 1 },
      ]}
    >
      {icon && <Ionicons name={icon} size={compact ? 18 : 20} color={secondary ? color : "#FFFFFF"} />}
      <Text style={[ui.buttonText, secondary && { color }, danger && secondary && { color: palette.danger }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Progress({ value, label, motion = false }: { value: number; label: string; motion?: boolean }) {
  const progress = Math.max(0, Math.min(1, value));
  const fill = useRef(new Animated.Value(progress)).current;
  useEffect(() => {
    const animation = Animated.timing(fill, {
      toValue: progress,
      duration: motion ? 280 : 0,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [fill, motion, progress]);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={ui.track}>
      <Animated.View style={[ui.fill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
    </View>
  );
}

export function Row({
  title,
  detail,
  icon,
  onPress,
  selected = false,
  disabled = false,
}: {
  title: string;
  detail?: string;
  icon?: IconName;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [ui.row, selected && ui.rowSelected, focused && ui.focus, { opacity: disabled ? 0.48 : pressed ? 0.68 : 1 }]}
    >
      {icon && <View style={ui.rowIcon}><Ionicons name={icon} size={21} color={selected ? palette.accent : palette.muted} /></View>}
      <View style={ui.rowContent}>
        <Text style={ui.rowTitle}>{title}</Text>
        {detail && <Text style={ui.small}>{detail}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.muted} />
    </Pressable>
  );
}

export function Section({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return (
    <View style={ui.section}>
      <View style={{ gap: 3 }}>
        <Text style={ui.sectionTitle}>{title}</Text>
        {detail && <Text style={ui.small}>{detail}</Text>}
      </View>
      {children}
    </View>
  );
}

export const ui = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 34,
    gap: 22,
  },
  header: { gap: 4 },
  eyebrow: { color: palette.accent, fontSize: 12, lineHeight: 17, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: palette.ink, fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.4 },
  h2: { color: palette.ink, fontSize: 20, lineHeight: 26, fontWeight: "700" },
  body: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  small: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  section: { gap: 12 },
  sectionTitle: { color: palette.ink, fontSize: 18, lineHeight: 24, fontWeight: "700" },
  card: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 14 },
  button: { minHeight: 48, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: palette.accent, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  buttonCompact: { minHeight: 42, paddingVertical: 8, paddingHorizontal: 12 },
  buttonSecondary: { backgroundColor: palette.surfaceWarm, borderColor: palette.accentSoft, borderWidth: 1 },
  buttonDanger: { backgroundColor: palette.danger },
  buttonText: { color: "#FFFFFF", fontSize: 15, lineHeight: 20, fontWeight: "700", textAlign: "center", flexShrink: 1 },
  focus: Platform.OS === "web" ? { outlineStyle: "solid", outlineWidth: 2, outlineColor: palette.accent } as any : { borderColor: palette.accent, borderWidth: 2 },
  track: { height: 7, borderRadius: 4, backgroundColor: palette.border, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: palette.accent },
  row: { minHeight: 64, borderBottomWidth: 1, borderBottomColor: palette.border, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  rowSelected: { backgroundColor: palette.surfaceWarm },
  rowIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  rowContent: { flex: 1, gap: 2 },
  rowTitle: { color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  input: { minHeight: 48, borderWidth: 1, borderColor: palette.border, borderRadius: 10, backgroundColor: palette.surface, paddingHorizontal: 13, fontSize: 16, color: palette.ink },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { minHeight: 44, minWidth: 58, borderRadius: 9, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  choiceSelected: { borderColor: palette.accent, backgroundColor: palette.accentPale },
  choiceText: { color: palette.ink, fontSize: 15, fontWeight: "600" },
  choiceTextSelected: { color: palette.accentText, fontWeight: "800" },
  checkbox: { width: 28, height: 28, borderRadius: 7, borderWidth: 2, borderColor: palette.border, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface },
  checkboxSelected: { borderColor: palette.accent, backgroundColor: palette.accent },
});
