# Dustio

Revisão local de fotos, vídeos e áudios para liberar espaço no aparelho, com histórico e preferências mantidos no próprio dispositivo.

## Uso

Inicie a revisão para buscar mídias antigas e decidir, uma por vez, o que manter ou excluir. A quantidade padrão é de até 10 arquivos por dia, conforme a data local. A busca preserva os mais antigos como prioridade e aplica pesos adaptativos entre fotos, vídeos e áudios quando há mais de um tipo disponível. Bibliotecas menores podem retornar menos arquivos. O histórico, a fila do dia e as preferências ficam no aparelho; arquivos já mantidos não reaparecem até a lista de ignorados ser redefinida.

Em Pastas, adicione exclusões para proteger arquivos. Proteger uma pasta também cobre suas subpastas. A lista disponível depende do que a biblioteca do sistema permite acessar. Quando há exclusões, arquivos sem caminho identificável ficam fora da revisão.

Em Ajustes, configure a quantidade por revisão, os tipos de mídia e um, dois ou três horários de lembrete. Alterações de quantidade após iniciar a revisão valem na próxima busca. O lembrete não faz varreduras em segundo plano; a busca ocorre ao abrir a revisão. A economia de bateria pode atrasar notificações alguns minutos. A fila é revalidada ao voltar ao aplicativo e imediatamente antes de excluir.

A demonstração fica somente em Ajustes, usa arquivos de exemplo e progresso temporário separado dos dados reais. Não exclui arquivos do aparelho nem precisa de rede. No navegador e no Expo Go, use esse modo para experimentar a interface.

## Executar

Requisitos: Node.js 22.13+ e npm. Projeto com Expo SDK 57 e React Native 0.86; consulte a [documentação versionada do Expo](https://docs.expo.dev/versions/v57.0.0/).

```sh
npm install
```

Para acessar a biblioteca real no Android, é necessária uma build nativa de desenvolvimento:

```sh
npx expo run:android
```

Esse comando exige Android SDK, Java e dispositivo ou emulador configurados. Nas próximas sessões, inicie o servidor com `npm start` e abra o aplicativo próprio instalado.

No Android, o módulo `expo-media-library` instalado rejeita pedidos de acesso a fotos ou vídeos dentro do Expo Go e orienta criar uma development build. Use o Expo Go somente para demonstração. Alterar `app.json` não altera o manifesto nativo do Expo Go, que já vem compilado. Mudanças em permissões, ícones ou plugins nativos exigem recompilar o aplicativo próprio.

Para abrir a demonstração no navegador:

```sh
npm run web -- --port 8091
```

## Permissões e limites

O plugin `expo-media-library` declara explicitamente `granularPermissions: ["photo", "video", "audio"]` e `isAccessMediaLocationEnabled: false`. As permissões concedidas pelo usuário e as restrições do sistema determinam quais arquivos ficam disponíveis. Veja a [referência de MediaLibrary legada do SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/media-library-legacy/).

A biblioteca do sistema não representa acesso irrestrito ao armazenamento. Pastas vazias, arquivos privados de outros aplicativos e mídias não autorizadas podem não aparecer. O foco é Android; caminhos, álbuns, permissões e exclusões no iOS precisam de validação em aparelho. O navegador não oferece acesso à biblioteca nativa nem aos lembretes locais do aplicativo.

A exclusão exige confirmação e só é registrada após sucesso informado pelo sistema. Cancelamento ou falha mantém o arquivo pendente. Não há lixeira própria nem garantia de desfazer uma exclusão concluída. O espaço recuperado soma apenas tamanhos conhecidos.

Preferências e IDs reais revisados de versões anteriores são importados; dados fictícios não são. Regras antigas de caminhos são preservadas para revisão. Quando necessário, selecione novamente as pastas reais ou remova as regras antigas antes da primeira busca. Os dados antigos no armazenamento não são apagados.

## Verificação e marca

```sh
npm run typecheck
npm test
npm run test:ui
npx expo-doctor
npx expo export --platform android --output-dir artifacts/android
```

Os testes de interface usam Playwright e esperam o servidor web em `http://localhost:8091`. As capturas ficam em `artifacts/`. Testes simulados não substituem verificar permissões, exclusão real e notificações em uma build nativa no Android.

A marca do Dustio usa uma pasta verde discreta sobre superfícies neutras. Os arquivos prontos para o Expo estão em `assets/dustio-icon.png`, `assets/dustio-icon-foreground.png` e `assets/dustio-banner.png`. Para regenerá-los a partir dos arquivos locais em `.temp`:

```sh
node scripts/prepare-dustio-assets.cjs
```

O script usa o Chromium do Playwright; se necessário, instale-o com `npx playwright install chromium`.

## Licença

MIT. Código e ilustrações originais seguem a licença do projeto. Permanecem os créditos de Gabriel, dos demais contribuidores e os avisos do template Expo e das dependências.
