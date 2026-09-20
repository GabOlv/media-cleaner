import React, { useEffect, useMemo, useRef, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Image,
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
  timeToMinutes,
} from "./src/core/model";
import { formatBytes, formatRelativeDate } from "./src/utils/formatters";

type Screen = "home" | "mission" | "folders" | "protected" | "picker" | "more";
type RootScreen = "home" | "mission" | "folders" | "more";

const ROOT_SCREENS: RootScreen[] = ["home", "mission", "folders", "more"];
const BATCH_OPTIONS = [5, 10, 15, 20];
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  useEffect(() => {
    if (app.tab !== lastTab.current && ROOT_SCREENS.includes(app.tab as RootScreen)) {
      lastTab.current = app.tab;
      setScreen(app.tab as RootScreen);
      setHistory([]);
    }
  }, [app.tab]);

  useEffect(() => {
    setSelectedIds(app.files.map((file) => file.id));
  }, [app.files]);

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

  async function finishReview() {
    if (selectedIds.length === 0) {
      await app.completeReview([]);
      return;
    }
    setConfirmDelete(true);
  }

  async function confirmDeletion() {
    setConfirmDelete(false);
    await app.completeReview(selectedIds);
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
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            onStart={beginReview}
            onFinish={finishReview}
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
      <View style={s.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          accessibilityState={{ disabled: history.length === 0 }}
          disabled={history.length === 0}
          onPress={goBack}
          style={({ pressed }) => [s.backButton, history.length === 0 && s.backPlaceholder, pressed && { opacity: 0.6 }]}
        >
          {history.length > 0 && <Ionicons name="chevron-back" size={24} color={C.ink} />}
        </Pressable>
        <View style={s.topBarText}>
          <Text style={ui.eyebrow}>CARROTCLEANER</Text>
          <Text style={ui.title}>{headerTitle[screen]}</Text>
        </View>
        <View style={s.topBarSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={[ui.page, { paddingBottom: 112 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {app.message ? <Message text={app.message} /> : null}
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
        visible={confirmDelete}
        title={`Excluir ${selectedIds.length} ${selectedIds.length === 1 ? "arquivo" : "arquivos"}?`}
        text="Os arquivos serão enviados para a lixeira do celular, quando o sistema oferecer esse recurso. Essa escolha não poderá ser desfeita pelo MediaCleaner."
        confirmLabel="Excluir selecionados"
        danger
        busy={app.deleting || app.busy}
        onCancel={() => setConfirmDelete(false)}
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
        <Text style={ui.h2}>Uma pequena revisão por dia.</Text>
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
  selectedIds,
  setSelectedIds,
  onStart,
  onFinish,
}: {
  app: ReturnType<typeof useCleaner>;
  preferences: Preferences;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  onStart: () => void;
  onFinish: () => void;
}) {
  const journal = app.journal!;
  const target = journal.mission.target;
  const reviewed = Math.min(target, journal.mission.reviewed.length);
  const hasFiles = app.files.length > 0;
  const toggle = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectAll = () => setSelectedIds(selectedIds.length === app.files.length ? [] : app.files.map((file) => file.id));

  return (
    <>
      <View style={ui.header}>
        <Text style={ui.h2}>{app.demo ? "Revisão de demonstração" : "Arquivos encontrados"}</Text>
        <Text style={ui.body}>Os itens ficam selecionados por padrão. Desmarque o que deseja manter.</Text>
      </View>
      <View style={ui.card}>
        <View style={ui.between}><Text style={ui.sectionTitle}>{reviewed} de {target} revisados</Text><Text style={ui.small}>{app.files.length} nesta lista</Text></View>
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
          {app.searched && <Button label="Voltar ao início" secondary onPress={() => app.setTab("home")} />}
        </View>
      ) : (
        <>
          <View style={ui.between}>
            <Text style={ui.sectionTitle}>Selecione para excluir</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={selectedIds.length === app.files.length ? "Desmarcar todos" : "Selecionar todos"} onPress={selectAll} style={s.linkButton}>
              <Text style={s.linkText}>{selectedIds.length === app.files.length ? "Desmarcar todos" : "Selecionar todos"}</Text>
            </Pressable>
          </View>
          <View style={ui.card}>
            {app.files.map((file) => <FileRow key={file.id} file={file} selected={selectedIds.includes(file.id)} onPress={() => toggle(file.id)} />)}
          </View>
          <View style={s.reviewFooter}>
            <Text style={ui.small}>{selectedIds.length ? `${selectedIds.length} selecionado(s) para excluir` : "Nenhum arquivo será excluído"}</Text>
            <Button label={selectedIds.length ? "Excluir selecionados" : "Guardar e continuar"} danger={selectedIds.length > 0} secondary={selectedIds.length === 0} icon={selectedIds.length ? "trash-outline" : "bookmark-outline"} onPress={onFinish} disabled={app.busy || app.unsaved} />
            {app.deleting && <View style={s.deletingLine}><ActivityIndicator color={C.accent} /><Text style={ui.small}>Excluindo arquivos selecionados…</Text></View>}
          </View>
        </>
      )}
      <View style={s.quietNote}><Ionicons name="lock-closed-outline" size={16} color={C.muted} /><Text style={[ui.small, { flex: 1 }]}>Itens desmarcados ficam fora das próximas buscas até você redefinir a lista em Ajustes.</Text></View>
    </>
  );
}

function FileRow({ file, selected, onPress }: { file: MediaFile; selected: boolean; onPress: () => void }) {
  const icon: Record<MediaKind, keyof typeof Ionicons.glyphMap> = { photo: "image-outline", video: "videocam-outline", audio: "musical-notes-outline" };
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${file.filename}, ${selected ? "selecionado para excluir" : "será mantido"}`} onPress={onPress} style={({ pressed }) => [s.fileRow, selected && s.fileRowSelected, pressed && { opacity: 0.72 }]}>
      {file.kind === "photo" && file.uri ? <Image source={{ uri: file.uri }} style={s.thumb} resizeMode="cover" /> : <View style={s.thumbIcon}><Ionicons name={icon[file.kind]} size={22} color={C.accent} /></View>}
      <View style={s.fileInfo}>
        <Text style={s.fileName} numberOfLines={1}>{file.filename}</Text>
        <Text style={ui.small} numberOfLines={1}>{MEDIA_LABELS[file.kind]} · {formatRelativeDate(file.created)}</Text>
        <Text style={s.filePath} numberOfLines={1}>{file.path ? shortPath(file.path) : "Pasta não identificada"} · {formatBytes(file.bytes)}</Text>
      </View>
      <View style={[ui.checkbox, selected && ui.checkboxSelected]}>{selected && <Ionicons name="checkmark" size={19} color="#FFFFFF" />}</View>
    </Pressable>
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

function SettingsScreen({ app, preferences, onProtected, onReset, onPickTime, onCustomBatch, onOpenSystemSettings }: { app: ReturnType<typeof useCleaner>; preferences: Preferences; onProtected: () => void; onReset: () => void; onPickTime: (index: number) => void; onCustomBatch: () => void; onOpenSystemSettings: () => void }) {
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
      <Section title="Lembrete diário" detail="Escolha quantas vezes o aviso pode tocar.">
        <View style={ui.card}>
          <SwitchRow label="Ativar lembretes" value={preferences.reminder} onValueChange={(value) => app.updatePreferences({ reminder: value })} />
          {preferences.reminder && <>
            <View style={s.divider} />
            <Text style={ui.small}>Quantidade de lembretes por dia</Text>
            <View style={ui.choiceGrid}>{[1, 2, 3].map((value) => <Choice key={value} label={`${value} ${value === 1 ? "vez" : "vezes"}`} selected={preferences.reminderTimes.length === value} onPress={() => app.updatePreferences({ reminderTimes: normalizeReminderTimes(preferences.reminderTimes, value) })} />)}</View>
            {preferences.reminderTimes.map((time, index) => <Row key={`${index}-${time}`} title={`Lembrete ${index + 1}`} detail={minutesToTime(time)} icon="time-outline" onPress={() => onPickTime(index)} />)}
            <Text style={ui.small}>Horários iguais são ajustados automaticamente em intervalos de 10 minutos.</Text>
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

function Message({ text }: { text: string }) {
  return <View style={s.message}><Ionicons name="information-circle-outline" size={19} color={C.accent} /><Text style={[ui.small, { flex: 1 }]}>{text}</Text></View>;
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
  const [webTime, setWebTime] = useState(minutesToTime(value));
  useEffect(() => { if (visible) { setDraft(value); setWebTime(minutesToTime(value)); } }, [value, visible]);
  const date = new Date();
  date.setHours(Math.floor(draft / 60), draft % 60, 0, 0);
  function save() {
    const parsed = timeToMinutes(webTime);
    if (Platform.OS === "web" && parsed === null) return;
    onSave(Platform.OS === "web" ? parsed ?? draft : draft);
  }
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBackdrop}><View style={s.modalCard}><Text style={ui.h2}>Horário do lembrete</Text><Text style={ui.body}>Escolha a hora e o minuto.</Text>{Platform.OS === "web" ? <TextInput accessibilityLabel="Horário" value={webTime} onChangeText={setWebTime} placeholder="20:00" style={ui.input} keyboardType="numbers-and-punctuation" maxLength={5} /> : <DateTimePicker value={date} mode="time" display="spinner" is24Hour onChange={(_, selected) => { if (selected) setDraft(selected.getHours() * 60 + selected.getMinutes()); }} />}{Platform.OS === "web" && !timeToMinutes(webTime) && <Text style={s.errorText}>Use um horário como 08:30 ou 20:00.</Text>}<View style={s.modalActions}><Button label="Cancelar" secondary onPress={onCancel} /><Button label="Salvar horário" onPress={save} /></View></View></KeyboardAvoidingView></Modal>;
}

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
  linkButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 5 },
  linkText: { color: C.accent, fontSize: 13, fontWeight: "800" },
  fileRow: { minHeight: 76, paddingVertical: 9, gap: 10, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.border },
  fileRowSelected: { backgroundColor: C.surfaceWarm },
  thumb: { width: 52, height: 52, borderRadius: 9, backgroundColor: C.border },
  thumbIcon: { width: 52, height: 52, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: C.accentPale },
  fileInfo: { flex: 1, minWidth: 0, gap: 2 },
  fileName: { color: C.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  filePath: { color: C.muted, fontSize: 12, lineHeight: 17 },
  reviewFooter: { gap: 10 },
  deletingLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  quietNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  infoBox: { backgroundColor: C.surfaceWarm, borderRadius: 11, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 },
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
  errorText: { color: C.danger, fontSize: 13, lineHeight: 18 },
});
