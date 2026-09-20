import React, { useState } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { MediaFile } from "../core/model";
import { Button, palette as C, ui } from "./ui";
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
  return (
    <View style={[s.fallback, { minHeight: height }]}>
      <Ionicons name="musical-notes-outline" size={52} color={C.accent} />
      <Text style={ui.h2}>Dê uma escutadinha</Text>
      <Button
        label={status.playing ? "Pausar áudio" : "Ouvir áudio"}
        icon={status.playing ? "pause" : "play"}
        onPress={() => {
          if (status.playing) player.pause();
          else {
            if (status.didJustFinish) player.seekTo(0);
            player.play();
          }
        }}
      />
    </View>
  );
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
