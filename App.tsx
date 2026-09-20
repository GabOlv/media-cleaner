import React, { useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { features } from "./src/config/features";
import { Button, palette as C, Progress, Row, Section, ui } from "./src/components/ui";
import { MediaPreview } from "./src/components/MediaPreview";
import { useCleaner } from "./src/core/useCleaner";
import {
  clampBatchSize,
  MediaFile,
  MediaKind,
  Preferences,
  minutesToTime,
  normalizeReminderTimes,
  protect,
  setReminderTime,
  shortPath,
} from "./src/core/model";
import { formatBytes, formatRelativeDate } from "./src/utils/formatters";

type Screen = "home" | "mission" | "folders" | "protected" | "picker" | "more";
type RootScreen = "home" | "mission" | "folders" | "more";

const ROOT_SCREENS: RootScreen[] = ["home", "mission", "folders", "more"];
const BATCH_OPTIONS = [5, 10, 15];
const MEDIA_LABELS: Record<MediaKind, string> = {
  photo: "Fotos",
  video: "Vídeos",
  audio: "Áudios",
};

export default function App() {
  return (
    <SafeAreaProvider>
      <CleanerApp />
    </SafeAreaProvider>
  );
}

function CleanerApp() {
  const app = useCleaner();
  const insets = useSafeAreaInsets();
  const lastTab = useRef(app.tab);
  const [screen, setScreen] = useState<Screen>("home");
  const [history, setHistory] = useState<Screen[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [timeSlot, setTimeSlot] = useState<number | null>(null);
  const [customBatchOpen, setCustomBatchOpen] = useState(false);
  const [customBatchValue, setCustomBatchValue] = useState("10");
  const [pickerQuery, setPickerQuery] = useState("");
  const [replacePath, setReplacePath] = useState<string | null>(null);
  const [folderLoadedFor, setFolderLoadedFor] = useState<Screen | null>(null);

  const journal = app.journal;
  const preferences = journal?.preferences;
  const activeRoot: RootScreen = ROOT_SCREENS.includes(screen as RootScreen)
    ? (screen as RootScreen)
    : screen === "protected" || screen === "picker"
      ? ([...history].reverse().find((item) => ROOT_SCREENS.includes(item as RootScreen)) as RootScreen | undefined) || "folders"
      : "more";
  const showTopBar = history.length > 0;

  useEffect(() => {
    if (app.tab !== lastTab.current && ROOT_SCREENS.includes(app.tab as RootScreen)) {
      lastTab.current = app.tab;
      setScreen(app.tab as RootScreen);
      setHistory([]);
    }
  }, [app.tab]);

  useEffect(() => {
    if ((screen === "folders" || screen === "picker") && folderLoadedFor !== screen) {
      setFolderLoadedFor(screen);
      app.loadFolders();
    }
  }, [app, folderLoadedFor, screen]);

  function navigate(next: Screen) {
    if (next === screen) return;
    if (ROOT_SCREENS.includes(next as RootScreen)) {
      app.setTab(next as RootScreen);
      setHistory([]);
      setScreen(next);
      return;
    }
    setHistory((current) => [...current, screen]);
    setScreen(next);
  }

  function goBack() {
    const previous = history[history.length - 1] || "home";
    setHistory(history.slice(0, -1));
    setScreen(previous);
  }

  async function beginReview() {
    if (!journal) return;
    if (preferences?.legacyPaths?.length) {
      navigate("folders");
      return;
    }
    navigate("mission");
    await app.startMission();
  }

  async function keepFile(file: MediaFile) {
    await app.completeReview([], [file.id]);
  }

  function requestDelete(file: MediaFile) {
    setConfirmDeleteId(file.id);
  }

  async function confirmDeletion() {
    if (!confirmDeleteId) return;
    const fileId = confirmDeleteId;
    setConfirmDeleteId(null);
    await app.completeReview([fileId], [fileId]);
  }

  async function addProtectedFolder(path: string) {
    if (!preferences) return;
    const remaining = replacePath
      ? preferences.protectedPaths.filter((item) => item !== replacePath)
      : preferences.protectedPaths;
    await app.updatePreferences({ protectedPaths: protect(remaining, path) });
    setReplacePath(null);
    goBack();
  }

  async function saveCustomBatch() {
    const value = clampBatchSize(Number(customBatchValue));
    await app.updatePreferences({ batchSize: value });
    setCustomBatchOpen(false);
  }

  if (!journal || !preferences) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={C.accent} />
        <Text style={ui.body}>Carregando suas preferências…</Text>
      </View>
    );
  }

  const headerTitle: Record<Screen, string> = {
    home: "Início",
    mission: "Revisão",
    folders: "Pastas",
    protected: "Pastas protegidas",
    picker: "Escolher pasta",
    more: "Ajustes",
  };

  const content = (() => {
    switch (screen) {
      case "mission":
        return (
          <ReviewScreen
            app={app}
            preferences={preferences}
            onStart={beginReview}
            onKeep={keepFile}
            onDelete={requestDelete}
          />
        );
      case "folders":
        return (
          <FoldersScreen
            app={app}
            preferences={preferences}
            onProtected={() => navigate("protected")}
            onAdd={() => {
              setReplacePath(null);
              setPickerQuery("");
              navigate("picker");
            }}
          />
        );
      case "protected":
        return (
          <ProtectedScreen
            app={app}
            preferences={preferences}
            onAdd={() => {
              setReplacePath(null);
              setPickerQuery("");
              navigate("picker");
            }}
            onReplace={(path) => {
              setReplacePath(path);
              setPickerQuery("");
              navigate("picker");
            }}
            onReset={() => setConfirmReset(true)}
          />
        );
      case "picker":
        return (
          <FolderPicker
            app={app}
            preferences={preferences}
            query={pickerQuery}
            setQuery={setPickerQuery}
            onPick={addProtectedFolder}
            replacing={replacePath}
          />
        );
      case "more":
        return (
          <SettingsScreen
            app={app}
            preferences={preferences}
            onProtected={() => navigate("protected")}
            onReset={() => setConfirmReset(true)}
            onPickTime={setTimeSlot}
            onCustomBatch={() => {
              setCustomBatchValue(String(preferences.batchSize));
              setCustomBatchOpen(true);
            }}
            onOpenSystemSettings={() => Linking.openSettings().catch(() => app.setMessage("Abra as configurações do aplicativo no celular."))}
            onOpenDeleteSettings={async () => {
              try {
                if (Platform.OS === "android" && Number(Platform.Version) >= 31)
                  await Linking.sendIntent("android.settings.REQUEST_MANAGE_MEDIA");
                else await Linking.openSettings();
              } catch {
                await Linking.openSettings().catch(() => app.setMessage("Abra as configurações do aplicativo no celular."));
              }
            }}
          />
        );
      case "home":
      default:
        return <HomeScreen app={app} onStart={beginReview} onSettings={() => navigate("more")} onFolders={() => navigate("folders")} />;
    }
  })();

  return (
    <View style={s.appShell}>
      <StatusBar style="dark" />
      {showTopBar && <View style={s.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={goBack}
          style={({ pressed }) => [s.backButton, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={C.ink} />
        </Pressable>
        <View style={s.topBarText}>
          <Text style={ui.title}>{headerTitle[screen]}</Text>
        </View>
        <View style={s.topBarSpacer} />
      </View>}
      <ScrollView
        contentContainerStyle={[ui.page, { paddingBottom: 112 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {app.message ? <Message text={app.message} transient={app.message.includes("arquivo(s) excluído(s).")} onDismiss={() => app.setMessage("")} motion={!app.reduced} /> : null}
        {app.unsaved ? (
          <View style={s.unsaved}>
            <Text style={[ui.small, { flex: 1 }]}>A última revisão terminou, mas ainda não foi salva.</Text>
            <Button label="Salvar" compact secondary onPress={app.retrySave} disabled={app.busy} />
          </View>
        ) : null}
        {content}
      </ScrollView>
      <BottomNav active={activeRoot} onNavigate={navigate} bottomInset={insets.bottom} />

      <ConfirmDialog
        visible={confirmDeleteId !== null}
        title="Excluir este arquivo?"
        text="Essa escolha não poderá ser desfeita pelo Dustio."
        confirmLabel="Excluir arquivo"
        danger
        busy={app.deleting || app.busy}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={confirmDeletion}
      />
      <ConfirmDialog
        visible={confirmReset}
        title="Redefinir itens ignorados?"
        text="Os arquivos que você escolheu manter poderão aparecer novamente nas próximas revisões. As pastas protegidas continuam intactas."
        confirmLabel="Redefinir lista"
        busy={app.busy}
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          await app.resetIgnored();
        }}
      />
      <TimePickerModal
        visible={timeSlot !== null}
        value={timeSlot === null ? preferences.reminderTimes[0] : preferences.reminderTimes[timeSlot] ?? 0}
        onCancel={() => setTimeSlot(null)}
        onSave={async (value) => {
          if (timeSlot === null) return;
          const next = setReminderTime(preferences.reminderTimes, timeSlot, value);
          const adjustedIndex = next[timeSlot] !== value
            ? timeSlot
            : next.findIndex((time, index) => index !== timeSlot && time !== preferences.reminderTimes[index]);
          setTimeSlot(null);
          if (adjustedIndex >= 0)
            app.setMessage(`O lembrete ${adjustedIndex + 1} foi ajustado para ${minutesToTime(next[adjustedIndex])} para evitar horários iguais.`);
          await app.updatePreferences({ reminderTimes: next });
        }}
      />
      <BatchModal
        visible={customBatchOpen}
        value={customBatchValue}
        setValue={setCustomBatchValue}
        onCancel={() => setCustomBatchOpen(false)}
        onSave={saveCustomBatch}
      />
    </View>
  );
}

function HomeScreen({ app, onStart, onSettings, onFolders }: { app: ReturnType<typeof useCleaner>; onStart: () => void; onSettings: () => void; onFolders: () => void }) {
  const journal = app.journal!;
  const target = journal.mission.target;
  const reviewed = Math.min(target, journal.mission.reviewed.length);
  const complete = reviewed >= target;
  return (
    <>
      <View style={ui.header}>
        <Text style={ui.h2}>Uma pequena revisão por vez.</Text>
        <Text style={ui.body}>Escolha o que realmente não precisa mais. O restante sai da sua lista e não volta a atrapalhar.</Text>
      </View>
      <View style={ui.card}>
        <View style={ui.between}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={ui.sectionTitle}>Revisão de hoje</Text>
            <Text style={ui.body}>{reviewed} de {target} arquivos revisados</Text>
          </View>
          <View style={s.numberBadge}><Text style={s.numberBadgeText}>{reviewed}</Text></View>
        </View>
        <Progress value={target ? reviewed / target : 0} label={`${reviewed} de ${target} arquivos revisados`} motion={journal.preferences.motion && !app.reduced} />
        <Button label={complete ? "Fazer nova revisão" : reviewed ? "Continuar revisão" : "Começar revisão"} icon="arrow-forward" onPress={onStart} disabled={app.busy || app.unsaved} />
      </View>
      <View style={s.statsGrid}>
        <Stat label="Excluídos hoje" value={String(journal.mission.deleted)} icon="trash-outline" />
        <Stat label="Espaço liberado" value={formatBytes(journal.mission.bytes)} icon="layers-outline" />
      </View>
      <Section title="Atalhos">
        <View style={ui.card}>
          <Row title="Pastas protegidas" detail={`${journal.preferences.protectedPaths.length} ${journal.preferences.protectedPaths.length === 1 ? "pasta" : "pastas"} fora das revisões`} icon="lock-closed-outline" onPress={onFolders} />
          <Row title="Lembretes e preferências" detail="Ajuste a quantidade e os horários" icon="options-outline" onPress={onSettings} />
        </View>
      </Section>
    </>
  );
}

function ReviewScreen({
  app,
  preferences,
  onStart,
  onKeep,
  onDelete,
}: {
  app: ReturnType<typeof useCleaner>;
  preferences: Preferences;
  onStart: () => void;
  onKeep: (file: MediaFile) => void | Promise<void>;
  onDelete: (file: MediaFile) => void;
}) {
  const journal = app.journal!;
  const target = journal.mission.target;
  const reviewed = Math.min(target, journal.mission.reviewed.length);
  const hasFiles = app.files.length > 0;
  const currentFile = app.files[0];
  const currentNumber = Math.min(target, reviewed + 1);

  return (
    <>
      <View style={ui.header}>
        <Text style={ui.h2}>{app.demo ? "Revisão de demonstração" : "Revise um arquivo por vez"}</Text>
        <Text style={ui.body}>Veja, ouça e decida com calma. O próximo arquivo aparece depois da sua escolha.</Text>
      </View>
      <View style={ui.card}>
        <View style={ui.between}><Text style={ui.sectionTitle}>{hasFiles ? `${currentNumber} de ${target}` : `${reviewed} de ${target}`}</Text><Text style={ui.small}>{app.files.length} restante(s)</Text></View>
        <Progress value={target ? reviewed / target : 0} label={`${reviewed} de ${target} revisados`} motion={preferences.motion && !app.reduced} />
      </View>

      {app.busy && !hasFiles ? (
        <View style={s.centerCard}><ActivityIndicator color={C.accent} /><Text style={ui.body}>Procurando arquivos…</Text></View>
      ) : app.libraryUnavailable && !app.demo ? (
        <View style={ui.card}>
          <Ionicons name="information-circle-outline" size={24} color={C.accent} />
          <Text style={ui.body}>{app.libraryUnavailable}</Text>
          {Platform.OS !== "web" && <Button label="Permitir acesso" icon="shield-checkmark-outline" onPress={app.access} disabled={app.busy || app.unsaved} />}
          <Text style={ui.small}>Para testar a interface sem tocar nos arquivos reais, ative a demonstração em Ajustes.</Text>
          {Platform.OS !== "web" && <Button label="Abrir configurações do celular" secondary compact onPress={() => Linking.openSettings().catch(() => app.setMessage("Abra as configurações do aplicativo no celular."))} />}
        </View>
      ) : !app.demo && !app.granted && Platform.OS !== "web" && !app.searched ? (
        <View style={ui.card}>
          <Ionicons name="images-outline" size={24} color={C.accent} />
          <Text style={ui.body}>O acesso às mídias é necessário para encontrar arquivos elegíveis.</Text>
          <Button label="Permitir acesso" onPress={app.access} disabled={app.busy || app.unsaved} />
        </View>
      ) : !hasFiles ? (
        <View style={ui.card}>
          <Ionicons name="checkmark-circle-outline" size={28} color={C.success} />
          <Text style={ui.sectionTitle}>{app.searched ? "Revisão concluída" : "Pronto para começar"}</Text>
          <Text style={ui.body}>{app.searched ? "Não há outros arquivos nesta revisão." : "A busca respeitará as pastas protegidas e os itens que você já decidiu manter."}</Text>
          {!app.searched && <Button label="Buscar arquivos" icon="search-outline" onPress={onStart} disabled={app.busy || app.unsaved} />}
          {app.searched && <Button label="Fazer nova revisão" icon="refresh-outline" onPress={onStart} disabled={app.busy || app.unsaved} />}
        </View>
      ) : (
        <>
          <View style={s.reviewMediaCard}>
            {currentFile && <MediaPreview file={currentFile} />}
            {currentFile && <View style={s.mediaMeta}>
              <Text style={s.fileName} numberOfLines={2}>{currentFile.filename}</Text>
              <Text style={ui.small}>{MEDIA_LABELS[currentFile.kind]} · {formatRelativeDate(currentFile.created)} · {formatBytes(currentFile.bytes)}</Text>
              <Text style={s.filePath} numberOfLines={2}>{currentFile.path ? shortPath(currentFile.path) : "Pasta não identificada"}</Text>
            </View>}
          </View>
          <View style={s.reviewActions}>
            <View style={s.actionButtonWrap}><Button label="Manter" secondary icon="bookmark-outline" onPress={() => currentFile && onKeep(currentFile)} disabled={app.busy || app.unsaved} /></View>
            <View style={s.actionButtonWrap}><Button label="Excluir" danger icon="trash-outline" onPress={() => currentFile && onDelete(currentFile)} disabled={app.busy || app.unsaved} /></View>
          </View>
          {app.deleting && <View style={s.deletingLine}><ActivityIndicator color={C.accent} /><Text style={ui.small}>Excluindo arquivo…</Text></View>}
        </>
      )}
      <View style={s.quietNote}><Ionicons name="lock-closed-outline" size={16} color={C.muted} /><Text style={[ui.small, { flex: 1 }]}>Ao escolher Manter, o arquivo sai das próximas buscas até você redefinir a lista em Ajustes.</Text></View>
    </>
  );
}

function FoldersScreen({ app, preferences, onProtected, onAdd }: { app: ReturnType<typeof useCleaner>; preferences: Preferences; onProtected: () => void; onAdd: () => void }) {
  return (
    <>
      <View style={ui.header}><Text style={ui.h2}>Tudo entra por padrão.</Text><Text style={ui.body}>Em vez de montar uma lista enorme, proteja somente as pastas que nunca devem aparecer na revisão.</Text></View>
      <View style={ui.card}>
        <Row title="Pastas protegidas" detail={preferences.protectedPaths.length ? `${preferences.protectedPaths.length} pasta(s) não serão pesquisadas` : "Nenhuma pasta foi protegida"} icon="lock-closed-outline" onPress={onProtected} />
        <Button label="Proteger uma pasta" icon="add" onPress={onAdd} disabled={app.busy || app.unsaved} />
      </View>
      <View style={s.infoBox}><Ionicons name="information-circle-outline" size={20} color={C.accent} /><Text style={[ui.small, { flex: 1 }]}>Subpastas também ficam protegidas automaticamente. Você pode alterar essa lista quando quiser.</Text></View>
      {app.demo && <Text style={ui.small}>A demonstração mostra uma pequena amostra de pastas para você conhecer o fluxo.</Text>}
    </>
  );
}

function ProtectedScreen({ app, preferences, onAdd, onReplace, onReset }: { app: ReturnType<typeof useCleaner>; preferences: Preferences; onAdd: () => void; onReplace: (path: string) => void; onReset: () => void }) {
  return (
    <>
      <View style={ui.header}><Text style={ui.h2}>O que deve ficar fora?</Text><Text style={ui.body}>Uma pasta protegida e todas as suas subpastas ficam fora das revisões.</Text></View>
      <View style={ui.card}>
        {preferences.protectedPaths.length === 0 ? <View style={s.empty}><Ionicons name="folder-open-outline" size={28} color={C.muted} /><Text style={ui.body}>Nenhuma pasta protegida</Text></View> : preferences.protectedPaths.map((path) => <ProtectedPath key={path} path={path} onReplace={() => onReplace(path)} onRemove={() => app.updatePreferences({ protectedPaths: preferences.protectedPaths.filter((item) => item !== path) })} />)}
        <Button label="Adicionar pasta" icon="add" onPress={onAdd} disabled={app.busy || app.unsaved} />
      </View>
      <Section title="Itens ignorados" detail="Arquivos que você decidiu manter durante uma revisão.">
        <View style={ui.card}>
          <View style={ui.between}><View style={{ flex: 1, gap: 3 }}><Text style={ui.rowTitle}>{app.journal?.ignoredIds.length || 0} item(ns) na lista</Text><Text style={ui.small}>Eles só voltam a aparecer depois de uma redefinição.</Text></View><Ionicons name="eye-off-outline" size={22} color={C.muted} /></View>
          <Button label="Redefinir lista de itens ignorados" secondary compact onPress={onReset} disabled={app.busy || app.unsaved || !app.journal?.ignoredIds.length} />
        </View>
      </Section>
      {app.folderError ? <Message text={app.folderError} /> : null}
    </>
  );
}

function ProtectedPath({ path, onReplace, onRemove }: { path: string; onReplace: () => void; onRemove: () => void }) {
  return (
    <View style={s.pathRow}>
      <View style={s.pathIcon}><Ionicons name="lock-closed-outline" size={19} color={C.accent} /></View>
      <View style={{ flex: 1, gap: 2 }}><Text style={s.fileName} numberOfLines={1}>{shortPath(path)}</Text><Text style={ui.small}>Inclui subpastas</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${shortPath(path)}`} onPress={onRemove} style={s.iconButton}><Ionicons name="trash-outline" size={19} color={C.danger} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Trocar ${shortPath(path)}`} onPress={onReplace} style={s.iconButton}><Ionicons name="create-outline" size={19} color={C.accent} /></Pressable>
    </View>
  );
}

function FolderPicker({ app, preferences, query, setQuery, onPick, replacing }: { app: ReturnType<typeof useCleaner>; preferences: Preferences; query: string; setQuery: (value: string) => void; onPick: (path: string) => void; replacing: string | null }) {
  const folders = useMemo(() => app.folders.filter((folder) => folder.path.toLowerCase().includes(query.toLowerCase().trim())), [app.folders, query]);
  return (
    <>
      <View style={ui.header}><Text style={ui.h2}>{replacing ? "Trocar pasta protegida" : "Escolha uma pasta"}</Text><Text style={ui.body}>Pesquisar só organiza a lista; a proteção sempre inclui as subpastas.</Text></View>
      <TextInput accessibilityLabel="Buscar pasta" value={query} onChangeText={setQuery} placeholder="Buscar pasta" placeholderTextColor={C.disabled} style={ui.input} autoCapitalize="none" />
      {app.folderLoading ? <View style={s.centerCard}><ActivityIndicator color={C.accent} /><Text style={ui.body}>Encontrando pastas…</Text></View> : app.folderError ? <View style={ui.card}><Text style={ui.body}>{app.folderError}</Text>{Platform.OS !== "web" && <Button label="Permitir acesso" onPress={app.access} disabled={app.busy} />}<Button label="Tentar novamente" secondary onPress={app.loadFolders} disabled={app.busy} /></View> : folders.length === 0 ? <View style={ui.card}><Text style={ui.body}>Nenhuma pasta encontrada.</Text></View> : <View style={ui.card}>{folders.map((folder) => <Pressable key={folder.path} accessibilityRole="button" accessibilityLabel={`${shortPath(folder.path)}, ${folder.count} arquivos`} onPress={() => onPick(folder.path)} style={({ pressed }) => [s.folderOption, pressed && { opacity: 0.68 }]}><View style={s.pathIcon}><Ionicons name="folder-outline" size={20} color={C.accent} /></View><View style={{ flex: 1 }}><Text style={s.fileName} numberOfLines={1}>{shortPath(folder.path)}</Text><Text style={ui.small}>{folder.count} arquivo(s) encontrados</Text></View><Ionicons name="add-circle-outline" size={22} color={C.accent} /></Pressable>)}</View>}
      {preferences.protectedPaths.length > 0 && <Text style={ui.small}>Protegidas atualmente: {preferences.protectedPaths.length}</Text>}
    </>
  );
}

function SettingsScreen({ app, preferences, onProtected, onReset, onPickTime, onCustomBatch, onOpenSystemSettings, onOpenDeleteSettings }: { app: ReturnType<typeof useCleaner>; preferences: Preferences; onProtected: () => void; onReset: () => void; onPickTime: (index: number) => void; onCustomBatch: () => void; onOpenSystemSettings: () => void; onOpenDeleteSettings: () => void | Promise<void> }) {
  const batchIsPreset = BATCH_OPTIONS.includes(preferences.batchSize);
  const [demoNotice, setDemoNotice] = useState(false);
  const toggleType = (kind: MediaKind) => {
    const next = preferences.types.includes(kind) ? preferences.types.filter((item) => item !== kind) : [...preferences.types, kind];
    if (!next.length) {
      app.setMessage("Escolha pelo menos um tipo de mídia para revisar.");
      return;
    }
    app.updatePreferences({ types: next });
  };
  return (
    <>
      <View style={ui.header}><Text style={ui.h2}>Do seu jeito.</Text><Text style={ui.body}>Preferências de revisão e lembretes, sem etapas desnecessárias.</Text></View>
      <Section title="Arquivos por revisão" detail="Quantos arquivos você quer revisar por vez?">
        <View style={ui.card}>
          <View style={ui.choiceGrid}>{BATCH_OPTIONS.map((value) => <Choice key={value} label={String(value)} selected={preferences.batchSize === value} onPress={() => app.updatePreferences({ batchSize: value })} />)}<Choice label="Personalizado" selected={!batchIsPreset} onPress={onCustomBatch} /></View>
          <Text style={ui.small}>A quantidade vale para a próxima revisão.</Text>
        </View>
      </Section>
      <Section title="Tipos de mídia" detail="Escolha o que entra na busca.">
        <View style={ui.card}>{(["photo", "video", "audio"] as MediaKind[]).map((kind) => <SwitchRow key={kind} label={MEDIA_LABELS[kind]} value={preferences.types.includes(kind)} onValueChange={() => toggleType(kind)} />)}</View>
      </Section>
      <Section title="Lembretes" detail="Escolha quantas vezes o aviso pode tocar por dia.">
        <View style={ui.card}>
          <SwitchRow label="Ativar lembretes" value={preferences.reminder} onValueChange={(value) => app.updatePreferences({ reminder: value })} />
          {preferences.reminder && <>
            <View style={s.divider} />
            <Text style={ui.small}>Quantidade de lembretes por dia</Text>
            <View style={ui.choiceGrid}>{[1, 2, 3].map((value) => <Choice key={value} label={`${value} ${value === 1 ? "vez" : "vezes"}`} selected={preferences.reminderTimes.length === value} onPress={() => app.updatePreferences({ reminderTimes: normalizeReminderTimes(preferences.reminderTimes, value) })} />)}</View>
            {preferences.reminderTimes.map((time, index) => <Row key={`${index}-${time}`} title={`Lembrete ${index + 1}`} detail={minutesToTime(time)} icon="time-outline" onPress={() => onPickTime(index)} />)}
            <Text style={ui.small}>Horários iguais são ajustados automaticamente em intervalos de 10 minutos.</Text>
            <Text style={ui.small}>O Android pode entregar o lembrete alguns minutos depois para economizar bateria.</Text>
            {Platform.OS !== "web" && !app.demo && app.notificationGranted === false && <View style={s.reminderWarning}>
              <Ionicons name="notifications-off-outline" size={20} color={C.accent} />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={ui.small}>As notificações estão desativadas nas configurações do celular.</Text>
                <Button label="Abrir configurações" secondary compact onPress={onOpenSystemSettings} />
              </View>
            </View>}
          </>}
          {!preferences.reminder && <Text style={ui.small}>Você pode ativar um, dois ou três horários quando quiser.</Text>}
        </View>
      </Section>
      <Section title="Pastas e histórico">
        <View style={ui.card}>
          <Row title="Pastas protegidas" detail={`${preferences.protectedPaths.length} configurada(s)`} icon="folder-outline" onPress={onProtected} />
          <Row title="Itens ignorados" detail={`${app.journal?.ignoredIds.length || 0} na lista`} icon="eye-off-outline" onPress={onReset} disabled={!app.journal?.ignoredIds.length} />
        </View>
      </Section>
      {Platform.OS === "android" && Number(Platform.Version) >= 31 && <Section title="Permissões">
        <View style={ui.card}>
          <Row title="Permitir exclusões sem confirmação" detail="Acesso especial do Android, solicitado uma única vez" icon="shield-checkmark-outline" onPress={onOpenDeleteSettings} />
        </View>
      </Section>}
      <Section title="Acessibilidade">
        <View style={ui.card}><SwitchRow label="Movimento suave" detail="Reduza as transições se preferir" value={preferences.motion} onValueChange={(value) => app.updatePreferences({ motion: value })} /></View>
      </Section>
      {features.demoMode && <Section title="Demonstração" detail="Disponível somente em Ajustes para não misturar com a revisão real."><View style={ui.card}><Row title={app.demo ? "Encerrar demonstração" : "Abrir demonstração"} detail={app.demo ? "Nenhum arquivo real será alterado" : "Conheça o fluxo com arquivos de exemplo"} icon="flask-outline" onPress={() => { app.switchDemo(); setDemoNotice(true); }} /></View></Section>}
      {demoNotice && <View style={s.infoBox}><Ionicons name="checkmark-circle-outline" size={20} color={C.success} /><Text style={[ui.small, { flex: 1 }]}>{app.demo ? "Demonstração ativada. Vá para Revisão quando quiser." : "Demonstração encerrada."}</Text></View>}
      {Platform.OS !== "web" && !app.demo && <Button label="Permissões do aplicativo" secondary icon="settings-outline" onPress={onOpenSystemSettings} />}
    </>
  );
}

function SwitchRow({ label, detail, value, onValueChange }: { label: string; detail?: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={s.switchRow}><View style={{ flex: 1, gap: 2 }}><Text style={ui.rowTitle}>{label}</Text>{detail && <Text style={ui.small}>{detail}</Text>}</View><Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} trackColor={{ false: C.border, true: C.accentSoft }} thumbColor={value ? C.accent : C.disabled} ios_backgroundColor={C.border} /></View>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onPress} style={({ pressed }) => [ui.choice, selected && ui.choiceSelected, focused && ui.focus, pressed && { opacity: 0.7 }]}><Text style={[ui.choiceText, selected && ui.choiceTextSelected]}>{label}</Text></Pressable>;
}

function Stat({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return <View style={s.stat}><Ionicons name={icon} size={19} color={C.accent} /><Text style={s.statValue}>{value}</Text><Text style={ui.small}>{label}</Text></View>;
}

function Message({ text, transient = false, onDismiss, motion = true }: { text: string; transient?: boolean; onDismiss?: () => void; motion?: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const offset = useRef(new Animated.Value(-6)).current;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    opacity.stopAnimation();
    offset.stopAnimation();
    if (motion) {
      opacity.setValue(0);
      offset.setValue(-6);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: false }),
        Animated.timing(offset, { toValue: 0, duration: 180, useNativeDriver: false }),
      ]).start();
    } else {
      opacity.setValue(1);
      offset.setValue(0);
    }
    if (!transient) return;
    const timer = setTimeout(() => {
      if (!motion) {
        opacity.setValue(0);
        dismissRef.current?.();
        return;
      }
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: false }),
        Animated.timing(offset, { toValue: -6, duration: 240, useNativeDriver: false }),
      ]).start(({ finished }) => {
        if (finished) dismissRef.current?.();
      });
    }, 3600);
    return () => clearTimeout(timer);
  }, [motion, opacity, offset, text, transient]);
  return <Animated.View accessibilityLiveRegion="polite" style={[s.message, { opacity, transform: [{ translateY: offset }] }]}><Ionicons name="information-circle-outline" size={19} color={C.accent} /><Text style={[ui.small, { flex: 1 }]}>{text}</Text></Animated.View>;
}

function BottomNav({ active, onNavigate, bottomInset }: { active: RootScreen; onNavigate: (screen: RootScreen) => void; bottomInset: number }) {
  const items: { key: RootScreen; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "home", label: "Início", icon: "home-outline" },
    { key: "mission", label: "Revisão", icon: "images-outline" },
    { key: "folders", label: "Pastas", icon: "folder-outline" },
    { key: "more", label: "Ajustes", icon: "options-outline" },
  ];
  return <View style={[s.bottomNav, { paddingBottom: Math.max(8, bottomInset) }]}>{items.map((item) => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active === item.key }} accessibilityLabel={item.label} onPress={() => onNavigate(item.key)} style={({ pressed }) => [s.navItem, active === item.key && s.navItemActive, pressed && { opacity: 0.65 }]}><Ionicons name={active === item.key ? item.icon.replace("-outline", "") as keyof typeof Ionicons.glyphMap : item.icon} size={22} color={active === item.key ? C.accent : C.muted} /><Text style={[s.navLabel, active === item.key && s.navLabelActive]}>{item.label}</Text></Pressable>)}</View>;
}

function ConfirmDialog({ visible, title, text, confirmLabel, danger = false, busy = false, onCancel, onConfirm }: { visible: boolean; title: string; text: string; confirmLabel: string; danger?: boolean; busy?: boolean; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}><View style={s.modalBackdrop}><View style={s.modalCard}><Text style={ui.h2}>{title}</Text><Text style={ui.body}>{text}</Text><View style={s.modalActions}><Button label="Cancelar" secondary onPress={onCancel} disabled={busy} /><Button label={busy ? "Aguarde…" : confirmLabel} danger={danger} onPress={onConfirm} disabled={busy} /></View></View></View></Modal>;
}

function TimePickerModal({ visible, value, onCancel, onSave }: { visible: boolean; value: number; onCancel: () => void; onSave: (value: number) => void | Promise<void> }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (visible) setDraft(value); }, [value, visible]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBackdrop}><View style={s.modalCard}><Text style={ui.h2}>Horário do lembrete</Text><Text style={ui.body}>Escolha a hora e o minuto.</Text><WheelTimePicker value={draft} onChange={setDraft} /><View style={s.modalActions}><Button label="Cancelar" secondary onPress={onCancel} /><Button label="Salvar horário" onPress={() => onSave(draft)} /></View></View></KeyboardAvoidingView></Modal>;
}

function WheelTimePicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const hour = Math.floor(value / 60) % 24;
  const minute = value % 60;
  return <View style={s.timePicker}><View style={s.wheelColumns}><TimeWheel label="Hora" max={23} selected={hour} onChange={(next) => onChange(next * 60 + minute)} /><Text style={s.timeSeparator}>:</Text><TimeWheel label="Minuto" max={59} selected={minute} onChange={(next) => onChange(hour * 60 + next)} /></View><View style={s.timeReadout}><Ionicons name="time-outline" size={18} color={C.accent} /><Text style={s.timeReadoutText}>{minutesToTime(value)}</Text></View></View>;
}

function TimeWheel({ label, max, selected, onChange }: { label: string; max: number; selected: number; onChange: (value: number) => void }) {
  const scrollRef = useRef<any>(null);
  const values = Array.from({ length: max + 1 }, (_, index) => index);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: selected * TIME_ROW_HEIGHT, animated: false });
  }, [selected]);
  function select(value: number) {
    onChange(value);
    scrollRef.current?.scrollTo({ y: value * TIME_ROW_HEIGHT, animated: true });
  }
  function finishScroll(event: any) {
    const offset = Number(event.nativeEvent.contentOffset?.y || 0);
    const next = Math.max(0, Math.min(max, Math.round(offset / TIME_ROW_HEIGHT)));
    onChange(next);
  }
  return <View style={s.wheelColumn}><Text style={s.wheelLabel}>{label}</Text><View testID={`time-wheel-${label.toLowerCase()}`} style={s.wheelWindow}><ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} snapToInterval={TIME_ROW_HEIGHT} decelerationRate="fast" scrollEventThrottle={16} contentContainerStyle={s.wheelContent} onScrollEndDrag={finishScroll} onMomentumScrollEnd={finishScroll}>{values.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`${label} ${String(item).padStart(2, "0")}`} accessibilityState={{ selected: item === selected }} onPress={() => select(item)} style={({ pressed }) => [s.wheelRow, item === selected && s.wheelRowSelected, pressed && { opacity: 0.68 }]}><Text style={[s.wheelValue, item === selected && s.wheelValueSelected]}>{String(item).padStart(2, "0")}</Text></Pressable>)}</ScrollView><View pointerEvents="none" style={s.wheelSelection} /></View></View>;
}

const TIME_ROW_HEIGHT = 44;

function BatchModal({ visible, value, setValue, onCancel, onSave }: { visible: boolean; value: string; setValue: (value: string) => void; onCancel: () => void; onSave: () => void | Promise<void> }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBackdrop}><View style={s.modalCard}><Text style={ui.h2}>Quantidade personalizada</Text><Text style={ui.body}>Escolha entre 1 e 100 arquivos por revisão.</Text><TextInput accessibilityLabel="Quantidade de arquivos" value={value} onChangeText={setValue} style={ui.input} keyboardType="number-pad" selectTextOnFocus /><View style={s.modalActions}><Button label="Cancelar" secondary onPress={onCancel} /><Button label="Salvar quantidade" onPress={onSave} /></View></View></KeyboardAvoidingView></Modal>;
}

const s = StyleSheet.create({
  appShell: { flex: 1, backgroundColor: C.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: C.background, padding: 20 },
  topBar: { minHeight: 72, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", backgroundColor: C.background },
  topBarText: { flex: 1, gap: 1 },
  topBarSpacer: { width: 40 },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  backPlaceholder: { opacity: 0 },
  message: { padding: 12, borderRadius: 10, backgroundColor: C.accentPale, flexDirection: "row", alignItems: "center", gap: 9 },
  unsaved: { padding: 10, borderRadius: 10, backgroundColor: "#FFF4D6", flexDirection: "row", alignItems: "center", gap: 8 },
  numberBadge: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.accentPale, alignItems: "center", justifyContent: "center" },
  numberBadgeText: { color: C.accentText, fontSize: 18, fontWeight: "800" },
  statsGrid: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, minHeight: 92, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 13, gap: 4 },
  statValue: { color: C.ink, fontSize: 21, lineHeight: 26, fontWeight: "700" },
  centerCard: { minHeight: 130, borderRadius: 14, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 18 },
  reviewMediaCard: { overflow: "hidden", backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 14 },
  mediaMeta: { padding: 16, gap: 4 },
  reviewActions: { flexDirection: "row", gap: 9 },
  actionButtonWrap: { flex: 1 },
  fileName: { color: C.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  filePath: { color: C.muted, fontSize: 12, lineHeight: 17 },
  deletingLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  quietNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  infoBox: { backgroundColor: C.surfaceWarm, borderRadius: 11, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  reminderWarning: { backgroundColor: C.surfaceWarm, borderRadius: 11, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  empty: { minHeight: 92, alignItems: "center", justifyContent: "center", gap: 8 },
  pathRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  pathIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.accentPale, alignItems: "center", justifyContent: "center" },
  iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  folderOption: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  switchRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { height: 1, backgroundColor: C.border },
  bottomNav: { position: "absolute", bottom: 0, left: 0, right: 0, minHeight: 72, paddingTop: 7, paddingHorizontal: 8, flexDirection: "row", backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border },
  navItem: { flex: 1, minHeight: 56, maxWidth: 180, alignItems: "center", justifyContent: "center", borderRadius: 11, gap: 3 },
  navItemActive: { backgroundColor: C.accentPale },
  navLabel: { color: C.muted, fontSize: 12, lineHeight: 16 },
  navLabelActive: { color: C.accentText, fontWeight: "800" },
  modalBackdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(45,41,38,0.35)" },
  modalCard: { width: "100%", maxWidth: 460, borderRadius: 16, padding: 18, gap: 14, backgroundColor: C.surface },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 9, flexWrap: "wrap" },
  timePicker: { gap: 12 },
  wheelColumns: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  wheelColumn: { flex: 1, minWidth: 0, gap: 6 },
  wheelLabel: { color: C.muted, fontSize: 11, lineHeight: 16, fontWeight: "800", letterSpacing: 1.1, textAlign: "center", textTransform: "uppercase" },
  wheelWindow: { height: TIME_ROW_HEIGHT * 3, overflow: "hidden", borderRadius: 12, backgroundColor: C.surfaceWarm, borderWidth: 1, borderColor: C.border, position: "relative" },
  wheelContent: { paddingVertical: TIME_ROW_HEIGHT },
  wheelRow: { height: TIME_ROW_HEIGHT, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  wheelRowSelected: { backgroundColor: C.accentPale },
  wheelValue: { color: C.muted, fontSize: 18, lineHeight: 24, fontWeight: "600" },
  wheelValueSelected: { color: C.accentText, fontSize: 22, fontWeight: "800" },
  wheelSelection: { position: "absolute", left: 5, right: 5, top: TIME_ROW_HEIGHT, height: TIME_ROW_HEIGHT, borderWidth: 1, borderColor: C.accentSoft, borderRadius: 9 },
  timeSeparator: { color: C.ink, fontSize: 24, lineHeight: 30, fontWeight: "700", marginTop: 22 },
  timeReadout: { alignSelf: "center", minHeight: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: C.accentPale, flexDirection: "row", alignItems: "center", gap: 7 },
  timeReadoutText: { color: C.accentText, fontSize: 16, lineHeight: 21, fontWeight: "800" },
});
