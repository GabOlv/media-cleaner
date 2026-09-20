import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { MediaFile } from "../core/model";
import { palette as C, ui } from "./ui";

const AUDIO_WAVEFORM = [
  8, 14, 21, 12, 28, 17, 10, 24, 15, 31, 19, 11, 26, 16, 22, 13, 30, 18, 9, 24, 14, 27, 18, 11, 23, 16, 29, 13, 20, 9,
];
export function MediaPreview({ file }: { file: MediaFile }) {
  const [failed, setFailed] = useState(false);
  const { width } = useWindowDimensions();
  const previewHeight = Math.min(300, Math.max(190, width * 0.58));
  if (file.demo)
    return (
      <View style={[s.demoPhoto, { height: previewHeight }]}>
        <View style={s.sun} />
        <View style={s.hillBack} />
        <View style={s.hill} />
        <View style={s.demoCaption}>
          <Ionicons name="image-outline" size={19} color={C.ink} />
          <Text style={ui.small}>Uma lembrança de exemplo</Text>
        </View>
      </View>
    );
  if (file.kind === "video") return <VideoPreview uri={file.uri} height={previewHeight} />;
  if (file.kind === "audio") return <AudioPreview uri={file.uri} height={previewHeight} />;
  return (
    <View style={{ backgroundColor: "#E8EDE6" }}>
      {failed ? (
        <View style={s.fallback}>
          <Ionicons name="image-outline" size={42} color={C.accent} />
          <Text style={ui.body}>Prévia indisponível</Text>
          <Text style={ui.small}>
            Você pode guardar este arquivo para ver depois.
          </Text>
        </View>
      ) : (
        <Image
          accessibilityLabel={`Prévia de ${file.filename}`}
          source={{ uri: file.uri }}
          style={{ width: "100%", height: previewHeight }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}
function VideoPreview({ uri, height }: { uri: string; height: number }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      nativeControls
      style={{ width: "100%", height }}
      contentFit="contain"
    />
  );
}
function AudioPreview({ uri, height }: { uri: string; height: number }) {
  const player = useAudioPlayer(uri),
    status = useAudioPlayerStatus(player);
  const duration = Number.isFinite(status.duration) ? status.duration : 0;
  const progress = duration > 0 ? Math.max(0, Math.min(1, status.currentTime / duration)) : 0;
  const activeBars = Math.round(progress * AUDIO_WAVEFORM.length);
  const togglePlayback = () => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish) player.seekTo(0);
      player.play();
    }
  };

  return (
    <View style={[s.audioPreview, { minHeight: height }]}>
      <View style={s.audioCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? "Pausar áudio" : "Reproduzir áudio"}
          onPress={togglePlayback}
          style={({ pressed }) => [s.audioPlay, pressed && s.audioPlayPressed]}
        >
          <Ionicons name={status.playing ? "pause" : "play"} size={22} color="#FFFFFF" />
        </Pressable>
        <View style={s.audioContent}>
          <Text style={s.audioTitle}>Áudio</Text>
          <View accessibilityLabel="Forma de onda do áudio" style={s.waveform}>
            {AUDIO_WAVEFORM.map((bar, index) => (
              <View
                key={`${bar}-${index}`}
                style={[s.wave, { height: bar }, index < activeBars && s.waveActive]}
              />
            ))}
          </View>
          <View style={s.audioMeta}>
            <Text style={s.audioMetaText}>{status.playing ? "Reproduzindo" : "Toque para ouvir"}</Text>
            {duration > 0 && <Text style={s.audioMetaText}>{formatAudioTime(status.currentTime)} / {formatAudioTime(duration)}</Text>}
          </View>
        </View>
      </View>
    </View>
  );
}

function formatAudioTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const s = StyleSheet.create({
  fallback: {
    minHeight: 270,
    padding: 25,
    backgroundColor: C.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  audioPreview: {
    backgroundColor: C.surfaceWarm,
    paddingHorizontal: 18,
    paddingVertical: 24,
    justifyContent: "center",
  },
  audioCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  audioPlay: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },
  audioPlayPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  audioContent: { flex: 1, gap: 7 },
  audioTitle: { color: C.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  waveform: { height: 34, flexDirection: "row", alignItems: "center", gap: 3 },
  wave: { width: 3, borderRadius: 2, backgroundColor: C.border },
  waveActive: { backgroundColor: C.accent },
  audioMeta: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  audioMetaText: { color: C.muted, fontSize: 12, lineHeight: 16 },
  demoPhoto: { height: 270, backgroundColor: "#E4EDDF", overflow: "hidden" },
  sun: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#F0CF8C",
    position: "absolute",
    top: 35,
    right: 60,
  },
  hillBack: {
    width: 400,
    height: 260,
    borderRadius: 160,
    backgroundColor: "#B0C5A7",
    position: "absolute",
    top: 105,
    left: 80,
    transform: [{ rotate: "-20deg" }],
  },
  hill: {
    width: 360,
    height: 220,
    borderRadius: 140,
    backgroundColor: "#789C80",
    position: "absolute",
    top: 155,
    left: -80,
    transform: [{ rotate: "15deg" }],
  },
  demoCaption: {
    position: "absolute",
    bottom: 18,
    left: 18,
    backgroundColor: "#FFFFF0",
    padding: 10,
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
  },
});
