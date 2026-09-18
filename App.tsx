import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, palette as C, Progress, Row, ui } from "./src/components/ui";
import { MediaPreview } from "./src/components/MediaPreview";
import { isProtected, MediaFile, protect, shortPath } from "./src/core/model";
import { Tab, useCleaner } from "./src/core/useCleaner";
import { formatBytes, formatRelativeDate } from "./src/utils/formatters";

const tabs: {
  key: Tab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "home", label: "Início", icon: "home-outline" },
  { key: "mission", label: "Revisão", icon: "images-outline" },
  { key: "folders", label: "Pastas", icon: "shield-checkmark-outline" },
  { key: "more", label: "Ajustes", icon: "options-outline" },
];
export default function App() {
  return (
    <SafeAreaProvider>
      <Cleaner />
    </SafeAreaProvider>
  );
}
function Cleaner() {
  const window = useWindowDimensions();
  const compact = window.width < 360 || window.height < 740;
  const insets = useSafeAreaInsets(),
    app = useCleaner();
  const {
    journal,
    tab,
    setTab,
    demo,
    granted,
    reduced,
    busy,
    message,
    setMessage,
    files,
    searched,
    deleting,
    libraryUnavailable,
    folders,
    folderLoading,
    folderError,
    unsaved,
    retrySave,
    initialize,
    access,
    startMission,
    decide,
    updatePreferences,
    loadFolders,
    switchDemo,
  } = app;
  const [confirm, setConfirm] = useState<MediaFile | null>(null),
    [picker, setPicker] = useState(false),
    [query, setQuery] = useState(""),
    [time, setTime] = useState("20:00");
  const [replacing, setReplacing] = useState<string | null>(null);
  useEffect(() => {
    if (journal) setTime(journal.preferences.time);
  }, [journal?.preferences.time, demo]);
  const closePicker = () => {
    setPicker(false);
    app.cancelFolders();
  };
  const openPicker = (legacyPath: string | null = null) => {
    setReplacing(legacyPath);
    setPicker(true);
    setQuery("");
    loadFolders();
  };
  if (!journal)
    return (
      <View
        style={[s.shell, { padding: 32, justifyContent: "center", gap: 24 }]}
      >
        
        <Text style={ui.h2}>MediaCleaner</Text>
        {message ? (
          <>
            <Text style={ui.body}>{message}</Text>
            <Button label="Tentar novamente" onPress={initialize} />
          </>
        ) : (
          <ActivityIndicator color={C.blue} />
        )}
      </View>
    );
  const p = journal.preferences,
    mission = journal.mission,
    done = mission.reviewed.length,
    completed = done >= mission.target;
  const current = files[0], motion = p.motion && !reduced;
  return (
    <View style={[s.shell, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      {demo && (
        <View style={s.demo}>
          <Text style={s.demoText}>DEMONSTRAÇÃO · nenhum arquivo real</Text>
          <Pressable
            accessibilityRole="button"
            onPress={switchDemo}
            disabled={busy}
            style={{ padding: 10, minHeight: 48, justifyContent: "center" }}
          >
            <Text style={[s.demoText, { textDecorationLine: "underline" }]}>
              Sair
            </Text>
          </Pressable>
        </View>
      )}
      <ScrollView
        key={tab}
        contentContainerStyle={[ui.page, compact && { padding: 18, gap: 18 }]}
        keyboardShouldPersistTaps="handled"
      >
        {message !== "" && (
          <View accessibilityLiveRegion="polite" style={s.notice}>
            <Text style={[ui.small, { flex: 1 }]}>{message}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar aviso"
              onPress={() => setMessage("")}
              style={{ padding: 10 }}
            >
              <Ionicons name="close" size={20} color={C.ink} />
            </Pressable>
          </View>
        )}
        {deleting && <View style={s.notice}><ActivityIndicator color={C.blue} /><Text accessibilityLiveRegion="polite" style={ui.body}>Aguardando a exclusão do arquivo…</Text></View>}
        {unsaved && <Button label="Salvar novamente" onPress={retrySave} />}
        {tab === "home" && <>
          <View style={{ gap: 6 }}><Text accessibilityRole="header" style={ui.title}>MediaCleaner</Text><Text style={ui.body}>Revise suas mídias e libere espaço.</Text></View>
          <View style={ui.card}>
            <Text style={ui.h2}>Revisão de hoje</Text>
            <Text style={ui.body}>{completed ? "Revisão diária concluída. Novos arquivos amanhã." : `Até ${mission.target} arquivos, começando pelos mais antigos.`}</Text>
            <Text style={ui.small}>{done} de {mission.target} revisados</Text>
            <Progress value={done / mission.target} label={`${done} de ${mission.target} arquivos revisados`} />
            <Button label={completed ? "Ver resumo" : done ? "Continuar revisão" : "Iniciar revisão"} icon="arrow-forward" disabled={busy || unsaved}
              onPress={() => { setTab("mission"); if (!completed && (granted || demo) && !files.length && (!libraryUnavailable || demo)) startMission(); }} />
          </View>
          <View style={s.stats}>
            <View style={s.stat}><Text style={s.statValue}>{formatBytes(journal.bytes)}</Text><Text style={ui.small}>espaço contabilizado</Text></View>
            <View style={s.stat}><Text style={s.statValue}>{journal.deleted}</Text><Text style={ui.small}>arquivos excluídos</Text></View>
          </View>
          <Text style={ui.small}>{demo ? "Estatísticas simuladas." : "Exclusões confirmadas. Tamanhos indisponíveis não entram na soma."}</Text>
          <View><Row icon="shield-checkmark-outline" title="Pastas protegidas" detail={`${p.protectedPaths.length} pastas fora da busca`} onPress={() => setTab("folders")} />
          <Row icon="notifications-outline" title="Lembrete diário" detail={p.reminder ? `Ativado às ${p.time}` : "Desativado"} onPress={() => setTab("more")} /></View>
        </>}
        {tab === "mission" && (
          <>
            <View style={{ gap: 10 }}>
              
              <Text style={ui.title}>Revisão de hoje</Text>
              <Text style={ui.body}>
                Decida quais arquivos manter ou excluir.
              </Text>
            </View>
            <View style={ui.between}>
              <Text style={s.label}>
                {done} de {mission.target} revisados
              </Text>

            </View>
            <Progress
              motion={motion}
              value={done / mission.target}
              label="Progresso da revisão"
            />
            {libraryUnavailable && !demo ? (
              <View style={ui.card}><Text style={ui.h2}>Acesso indisponível neste aplicativo</Text><Text style={ui.body}>{libraryUnavailable}</Text><Button label="Experimentar demonstração" onPress={switchDemo} disabled={busy || unsaved} /></View>
            ) : !granted && !demo ? (
              <View style={ui.card}>
                
                <Text style={ui.h2}>
                  {Platform.OS === "web"
                    ? "Revisão no celular"
                    : "Acesso à biblioteca"}
                </Text>
                <Text style={ui.body}>
                  {Platform.OS === "web"
                    ? "A limpeza usa a biblioteca de mídias do celular. Aqui no navegador, você pode experimentar uma revisão com arquivos fictícios."
                    : "Permita o acesso para buscar mídias antigas. Cada exclusão depende da sua confirmação."}
                </Text>
                {Platform.OS !== "web" && (
                  <>
                    <Button
                      label="Permitir acesso"
                      onPress={access}
                      disabled={busy}
                    />
                    <Button
                      secondary
                      label="Abrir ajustes do celular"
                      onPress={() => Linking.openSettings().catch(() => setMessage("Abra as configurações do aplicativo no celular."))}
                    />
                  </>
                )}
                <Button
                  secondary
                  label="Experimentar demonstração"
                  onPress={switchDemo}
                />
              </View>
            ) : completed ? (
              <View style={[ui.card, { alignItems: "center" }]}>
                
                <Text style={ui.h2}>Resumo de hoje</Text>
                <Text style={[ui.body, { textAlign: "center" }]}>
                  {mission.deleted} excluídos · {done - mission.deleted}{" "}
                  guardados{"\n"}
                  {formatBytes(mission.bytes)} recuperados
                </Text>

                <Text style={[ui.body, { textAlign: "center" }]}>
                  A próxima revisão estará disponível amanhã.
                </Text>
                <Button
                  label="Voltar ao início"
                  onPress={() => setTab("home")}
                />
              </View>
            ) : busy && !current ? (
              <View style={[ui.card, { alignItems: "center" }]}>
                
                <ActivityIndicator color={C.blue} />
                <Text style={ui.h2}>Procurando suas mídias…</Text>
                <Text style={ui.body}>As mais antigas vêm primeiro.</Text>
                <Button
                  secondary
                  label="Cancelar busca"
                  onPress={app.cancelScan}
                />
              </View>
            ) : current ? (
              <>
                <View style={[ui.card, { padding: 0, overflow: "hidden" }]}>
                  <MediaPreview key={current.id} file={current} />
                  <View style={{ padding: 20, gap: 9 }}>
                    <Text style={ui.eyebrow}>
                      {current.kind === "photo"
                        ? "FOTO"
                        : current.kind === "video"
                          ? "VÍDEO"
                          : "ÁUDIO"}{" "}
                      ·{" "}
                      {current.bytes === undefined
                        ? "TAMANHO INDISPONÍVEL"
                        : formatBytes(current.bytes)}
                    </Text>
                    <Text style={ui.h2}>{current.filename}</Text>
                    <Text style={ui.small}>
                      {formatRelativeDate(current.created)}
                    </Text>
                    <Text style={ui.small}>
                      {current.path
                        ? shortPath(current.path)
                        : "Biblioteca de mídias"}
                    </Text>
                  </View>
                </View>
                <View style={{ gap: 12 }}>
                  <Button
                    label="Manter arquivo"
                    icon="checkmark-outline"
                    secondary
                    onPress={() => decide(current, false)}
                    disabled={busy || unsaved}
                  />
                  <Button
                    label="Excluir arquivo…"
                    icon="trash-outline"
                    onPress={() => setConfirm(current)}
                    disabled={busy || unsaved}
                  />
                </View>
                <Text style={[ui.small, { textAlign: "center" }]}>
                  Os arquivos guardados não voltam nas próximas revisões.
                </Text>
              </>
            ) : (
              <View style={ui.card}>
                <Text style={ui.h2}>
                  {searched
                    ? "Nenhuma mídia disponível"
                    : "Buscar arquivos para revisar"}
                </Text>
                <Text style={[ui.body, { textAlign: "center" }]}>
                  {searched
                    ? "Nenhum arquivo disponível com as perrevisões, pastas e filtros atuais."
                    : `Serão selecionados até ${Math.max(0, mission.target - done)} arquivos antigos para você.`}
                </Text>
                <Button
                  label={searched ? "Buscar novamente" : "Buscar arquivos"}
                  onPress={startMission}
                  disabled={busy || unsaved}
                />
                {searched && (
                  <Button
                    secondary
                    label="Conferir pastas e filtros"
                    onPress={() => setTab("more")}
                  />
                )}
              </View>
            )}
            {!libraryUnavailable && granted && !demo && Platform.OS !== "web" && <View><Row icon="refresh-outline" title="Atualizar acesso" onPress={access} disabled={busy || unsaved} /><Row icon="settings-outline" title="Permissões nos ajustes do celular" onPress={() => Linking.openSettings().catch(() => setMessage("Abra as configurações do aplicativo no celular."))} /></View>}
          </>
        )}
        {tab === "folders" && (
          <>
            <View style={{ gap: 12 }}>
              <Text style={ui.eyebrow}>VOCÊ ESCOLHE O QUE FICA DE FORA</Text>
              <Text style={ui.title}>Pastas protegidas</Text>
              <Text style={ui.body}>
                Todas as mídias acessíveis entram na busca. Proteja aqui as
                pastas que devem ficar fora da busca.
              </Text>
            </View>
            <View style={s.info}>
              <Ionicons
                name="shield-checkmark-outline"
                size={27}
                color={C.blue}
              />
              <Text style={[ui.body, { flex: 1 }]}>
                Proteger uma pasta também protege todas as subpastas, inclusive
                as novas.
              </Text>
            </View>
            <Button
              label="Proteger uma pasta"
              icon="add"
              onPress={() => openPicker()}
              disabled={busy || unsaved}
            />
            {!p.protectedPaths.length ? (
              <View
                style={[ui.card, { alignItems: "center", paddingVertical: 35 }]}
              >
                <View style={s.emptyIcon}>
                  <Ionicons
                    name="folder-open-outline"
                    size={34}
                    color={C.blue}
                  />
                </View>
                <Text style={ui.h2}>Nenhuma pasta protegida</Text>
                <Text style={[ui.body, { textAlign: "center" }]}>
                  Sua coleção de músicas, por exemplo, pode ficar fora das
                  revisões.
                </Text>
              </View>
            ) : (
              p.protectedPaths.map((path) => (
                <View key={path} style={ui.card}>
                  <View style={ui.between}>
                    <Ionicons name="folder-outline" size={28} color={C.blue} />
                    <Text style={s.pillText}>{p.legacyPaths?.includes(path) ? 'CONFERIR PASTA ANTIGA' : 'PROTEGIDA'}</Text>
                  </View>
                  <Text style={ui.h2}>{path.split("/").pop()}</Text>
                  <Text style={ui.small}>
                    {shortPath(path)}
                    {"\n"}Inclui todas as subpastas.
                  </Text>
                  <Button
                    secondary
                    label={p.legacyPaths?.includes(path) ? 'Remover regra antiga' : 'Incluir nas próximas revisões'}
                    onPress={() =>
                      updatePreferences({
                        protectedPaths: p.protectedPaths.filter(
                          (v) => v !== path,
                        ),
                        legacyPaths: p.legacyPaths?.filter(v => v !== path),
                      })
                    }
                    disabled={busy || unsaved}
                  />
                  {p.legacyPaths?.includes(path) && <>
                    <Text style={ui.body}>A versão antiga alterava os nomes das pastas. Escolha a pasta real para continuar protegendo seus arquivos.</Text>
                    <Button label="Escolher pasta real" onPress={() => openPicker(path)} disabled={busy || unsaved} />
                  </>}
                </View>
              ))
            )}
            <Text style={ui.small}>
              As pastas só aparecem para escolher quando você toca em “Proteger
              uma pasta”. Nenhum arquivo é movido ou apagado aqui.
            </Text>
          </>
        )}
        {tab === "more" && (
          <>
            <View style={{ gap: 12 }}>
              <Text style={ui.eyebrow}>DO SEU JEITO</Text>
              <Text style={ui.title}>Ajustes</Text>
              <Text style={ui.body}>Preferências de revisão e notificações.</Text>
            </View>
            <View style={ui.card}>
              <Text style={ui.h2}>Arquivos por dia</Text>
              <Text style={ui.body}>Quantos arquivos por dia?</Text>
              <View style={s.choices}>
                {[5, 10, 15, 20].map((n) => (
                  <Pressable
                    key={n}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: p.batchSize === n,
                      disabled: busy || unsaved,
                    }}
                    disabled={busy || unsaved}
                    onPress={() => updatePreferences({ batchSize: n })}
                    style={[s.choice, p.batchSize === n && s.selected]}
                  >
                    <Text
                      style={[
                        s.choiceText,
                        p.batchSize === n && { color: "white" },
                      ]}
                    >
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {done > 0 && (
                <Text style={ui.small}>
                  A nova quantidade vale a partir de amanhã.
                </Text>
              )}
            </View>
            <View style={ui.card}>
              <Text style={ui.h2}>O que revisar</Text>
              {(["photo", "video", "audio"] as const).map((kind, i) => (
                <View style={ui.between} key={kind}>
                  <Text style={ui.body}>
                    {["Fotos", "Vídeos", "Áudios"][i]}
                  </Text>
                  <Switch
                    accessibilityLabel={
                      ["Incluir fotos", "Incluir vídeos", "Incluir áudios"][i]
                    }
                    disabled={busy || unsaved}
                    value={p.types.includes(kind)}
                    onValueChange={(enabled) => {
                      const types = enabled
                        ? [...p.types, kind]
                        : p.types.filter((t) => t !== kind);
                      if (!types.length) {
                        setMessage(
                          "Deixe pelo menos um tipo de mídia selecionado.",
                        );
                        return;
                      }
                      updatePreferences({ types });
                    }}
                    trackColor={{ true: "#285CA8", false: "#DDE2E9" }}
                  />
                </View>
              ))}
            </View>
            <View style={ui.card}>
              <View style={ui.between}>
                <Text style={[ui.h2, { flex: 1 }]}>Lembrete diário</Text>
                <Switch
                  accessibilityLabel="Lembrete diário"
                  value={p.reminder}
                  disabled={busy || unsaved || Platform.OS === "web"}
                  onValueChange={(reminder) => updatePreferences({ reminder })}
                  trackColor={{ true: "#285CA8" }}
                />
              </View>
              <Text style={ui.body}>
                {Platform.OS === "web"
                  ? "Disponível no aplicativo para celular."
                  : "Uma notificação no horário escolhido."}
              </Text>
              <Text style={s.label}>Horário (24 horas)</Text>
              <TextInput
                accessibilityLabel="Horário do lembrete"
                value={time}
                onChangeText={setTime}
                placeholder="20:00"
                maxLength={5}
                keyboardType="numbers-and-punctuation"
                style={ui.input}
              />
              <Button
                secondary
                label="Salvar horário"
                disabled={busy || unsaved}
                onPress={() => {
                  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
                    setMessage("Use um horário como 08:30 ou 20:00.");
                    return;
                  }
                  updatePreferences({ time });
                }}
              />
              <Text style={ui.small}>
                O lembrete convida você a abrir o app. A busca acontece ao
                iniciar a revisão.
              </Text>
            </View>
            <View>
              <Row
                icon="shield-checkmark-outline"
                title="Pastas protegidas"
                onPress={() => setTab("folders")}
              />
              <Row
                icon="flask-outline"
                title={
                  demo ? "Sair da demonstração" : "Experimentar demonstração"
                }
                detail="Uma revisão de exemplo, sem arquivos reais"
                onPress={switchDemo}
              />
            </View>
            <View style={{ alignItems: "center", gap: 8, paddingVertical: 16 }}>
              
              <Text style={s.label}>MediaCleaner</Text>
              <Text style={[ui.small, { textAlign: "center" }]}>
                Sem conta e sem anúncios. Preferências e histórico ficam neste aparelho.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
      <View style={[s.nav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: tab === t.key, disabled: deleting }}
            disabled={deleting}
            onPress={() => setTab(t.key)}
            style={s.tab}
          >
            <View
              style={[s.tabIcon, tab === t.key && { backgroundColor: C.soft }]}
            >
              <Ionicons
                name={t.icon}
                size={24}
                color={tab === t.key ? C.blue : C.muted}
              />
            </View>
            <Text
              style={[
                s.tabLabel,
                tab === t.key && { color: C.blue, fontWeight: "800" },
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Modal
        visible={!!confirm}
        transparent
        animationType={motion ? "fade" : "none"}
        onRequestClose={() => setConfirm(null)}
      >
        <View style={s.scrim}>
          <View accessibilityViewIsModal style={s.dialog}>
            <Text style={ui.h2}>Excluir arquivo?</Text>
            <Text style={ui.body}>{confirm?.filename}</Text>
            <Text style={ui.body}>
              {demo ? "Exclusão simulada. Nenhum arquivo real será alterado." : "O arquivo será excluído do celular. Confirme apenas se não precisar mais dele."}
            </Text>
            <Button
              danger
              disabled={busy || unsaved}
              label="Confirmar exclusão"
              icon="trash-outline"
              onPress={() => {
                if (confirm) {
                  const file = confirm;
                  setConfirm(null);
                  decide(file, true);
                }
              }}
            />
            <Button label="Cancelar" secondary onPress={() => setConfirm(null)} />
          </View>
        </View>
      </Modal>
      <Modal
        visible={picker}
        animationType={motion ? "slide" : "none"}
        onRequestClose={closePicker}
      >
        <View
          style={[
            s.shell,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={ui.page}
          >
            <View style={ui.between}>
              <Text style={[ui.h2, { flex: 1 }]}>Escolher pasta</Text>
              <Pressable
                accessibilityLabel="Fechar seleção de pastas"
                accessibilityRole="button"
                onPress={closePicker}
                style={{ padding: 14 }}
              >
                <Ionicons name="close" size={26} color={C.ink} />
              </Pressable>
            </View>
            <Text style={ui.body}>
              Toque na pasta que deseja proteger. Todas as subpastas ficam
              protegidas também.
            </Text>
            <TextInput
              style={ui.input}
              accessibilityLabel="Buscar pasta"
              placeholder="Buscar por nome ou caminho"
              value={query}
              onChangeText={setQuery}
            />
            {folderLoading ? (
              <>
                <ActivityIndicator color={C.blue} />
                <Text style={ui.body}>
                  Buscando pastas com mídias acessíveis…
                </Text>
              </>
            ) : libraryUnavailable && !demo ? (
              <><Text style={ui.body}>{libraryUnavailable}</Text><Button label="Experimentar demonstração" onPress={() => { closePicker(); switchDemo(); }} disabled={busy || unsaved} /></>
            ) : folderError ? (
              <>
                <Text style={ui.body}>{folderError}</Text>
                {!granted && !demo && Platform.OS !== "web" && (
                  <Button label="Permitir acesso" onPress={access} />
                )}
                <Button label="Tentar novamente" onPress={loadFolders} />
              </>
            ) : (
              <>
                {folders
                  .filter((f) =>
                    shortPath(f.path)
                      .toLocaleLowerCase()
                      .includes(query.toLocaleLowerCase()),
                  )
                  .map((f) => (
                    <Row
                      disabled={busy || unsaved}
                      key={f.path}
                      title={f.path.split("/").pop() || f.path}
                      detail={`${shortPath(f.path)} · ${f.count} mídias${isProtected(f.path, p.protectedPaths) ? " · protegida" : ""}`}
                      icon={
                        isProtected(f.path, p.protectedPaths)
                          ? "shield-checkmark-outline"
                          : "folder-outline"
                      }
                      onPress={() => {
                        if (!busy && !unsaved) {
                          updatePreferences({
                            protectedPaths: protect(p.protectedPaths.filter(v => v !== replacing), f.path),
                            legacyPaths: p.legacyPaths?.filter(v => v !== replacing),
                          });
                          setPicker(false);
                        }
                      }}
                    />
                  ))}
                {!folders.some((f) =>
                  shortPath(f.path).toLowerCase().includes(query.toLowerCase()),
                ) && (
                  <Text style={ui.body}>
                    Nenhuma pasta encontrada. Só mostramos pastas com mídias que
                    o sistema permite acessar.
                  </Text>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: C.bg },
  label: { fontSize: 15, color: C.ink, fontWeight: "600" },
  pillText: { fontSize: 13, color: C.muted, flexShrink: 1 },
  stats: { flexDirection: "row", gap: 16 },
  stat: { flex: 1, gap: 4 },
  statValue: { color: C.ink, fontSize: 24, fontWeight: "600" },
  nav: { backgroundColor: C.paper, borderTopWidth: 1, borderColor: C.line, flexDirection: "row", paddingTop: 8, paddingHorizontal: 8, width: "100%", maxWidth: 680, alignSelf: "center" },
  tab: { flex: 1, alignItems: "center", gap: 3, minHeight: 52 },
  tabIcon: { width: 44, height: 28, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  tabLabel: { color: C.muted, fontSize: 13, fontWeight: "500" },
  notice: { backgroundColor: C.soft, padding: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  demo: { backgroundColor: C.soft, minHeight: 48, paddingLeft: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  demoText: { fontSize: 13, color: C.muted, flexShrink: 1 },
  info: { backgroundColor: C.soft, borderRadius: 12, padding: 16, flexDirection: "row", gap: 12, alignItems: "center" },
  emptyIcon: { padding: 8 },
  choices: { flexDirection: "row", gap: 8 },
  choice: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  selected: { backgroundColor: C.blue },
  choiceText: { fontSize: 15, fontWeight: "600", color: C.ink },
  scrim: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "center", padding: 20 },
  dialog: { backgroundColor: C.paper, padding: 20, borderRadius: 12, gap: 16, width: "100%", maxWidth: 480, alignSelf: "center" },
});
