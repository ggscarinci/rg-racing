# RG Racing

Sistema independente para campeonatos de kart indoor. Repositório, serviço, autenticação e banco próprios. Pode compartilhar uma máquina e o proxy HTTPS com outros sistemas.

A identidade visual usa azul, branco e preto da RG Racing, com a [logomarca original](public/assets/README.md). Portal, painéis do piloto, classificação e TVs usam fundo branco. A gestão oferece o botão **Tema claro / Tema escuro** no cabeçalho e na tela de login; a preferência fica neste navegador e não altera a transmissão para a TV.

A primeira versão atende cadastro de pilotos e frota, formação de baterias, sorteio, trocas antes da corrida, tela pública para TV, cronograma, resultados manuais, classificação e painel do piloto. A integração com cronometragem/Race Monitor e o ranking de performance dos karts ficam para a próxima etapa.

## Executar em demonstração

Requer **Node.js 24**. Não há dependências de produção para instalar.

```sh
npm run dev
```

Abra `http://localhost:3000`. Gestão em `/admin`: **operador / kart-demo-2026**. O modo demonstração cria dados de exemplo apenas em um banco novo. Nunca use esse modo em produção; o servidor recusa `DEMO_MODE=1` com `NODE_ENV=production`.

Para testar sem gravar no banco de desenvolvimento, use outro `DATA_DIR`. Não apague bancos de eventos reais para carregar exemplos.

## Como operar

1. Acesse a gestão e crie um evento. Cada evento tem inscrições, frota e baterias independentes, preservando os eventos anteriores.
2. Em **Pilotos**, cadastre nomes em lote, um por linha: `Nome;UF`. Em **Frota de karts**, informe os números e a disponibilidade.
3. Crie uma bateria com categoria, série, número e horário. Em **Configurar bateria**, escolha os pilotos e os karts, incluindo reservas para trocas. A disponibilidade é novamente validada pelo servidor.
4. Defina nas configurações a janela (padrão **5 segundos**), o avanço automático e se o kart devolvido volta ao sorteio. Essas regras ficam congeladas por bateria ao preparar o sorteio.
5. **Embaralhar e preparar** organiza os nomes alfabeticamente e embaralha, separadamente, pilotos e karts com aleatoriedade criptográfica. A ordem é persistida; atualizar a página não refaz o sorteio. Não há botão para reembaralhar uma bateria preparada.
6. Abra **Abrir TV** em outro dispositivo e inicie o sorteio. Cada kart é revelado na vez do piloto; a lista pública não entrega números futuros. O servidor controla os cinco segundos, mesmo se a TV for atualizada ou desconectar.
7. **Solicitar troca** registra o pedido durante a janela. Ao terminar o sorteio inicial, **Sortear as trocas** embaralha a fila de pedidos e atribui os karts reserva. O piloto nunca recebe o próprio kart na troca. Sem reserva, o sorteio espera um novo kart, que a gestão pode cadastrar e adicionar.
8. **Gerenciar troca** permite incluir na fila fora do prazo ou realizar uma troca administrativa aleatória imediata, antes de ir à pista. Exige motivo; operador, horário e motivo entram no histórico interno. Trocas em andamento podem gerar uma nova rodada para pedidos tardios.
9. **Liberar para a pista** exige sorteio e trocas encerrados e registra a largada real. Na área **Resultados**, encerre a bateria e lance posição, pontos, ajuste/penalidade, observação e melhor volta opcional. A classificação pública é atualizada imediatamente.

O cronograma calcula a previsão das próximas baterias pelo desvio da última largada real. A organização controla os estados da prova. Nenhum tempo de volta é inventado. O som da contagem na TV exige clicar no ícone de som, conforme a regra de reprodução dos navegadores.

## Endereços

| Rota | Uso |
| --- | --- |
| `/` | Portal e links configuráveis da organização |
| `/admin` | Gestão autenticada |
| `/tv` | Último, atual e próximo piloto; timer, fila, trocas e atribuições |
| `/tv?modo=cronograma` | TV com na pista, em sorteio e parque fechado |
| `/cronograma` | Horários, estados, formação e pesquisa de piloto |
| `/ranking` | Resultados por bateria, classificação com/sem descarte |
| `/piloto` | Dashboard público de baterias, karts e resultados do piloto |
| `/karts` | Disponibilidade da frota; performance aguarda cronometragem |
| `/health` | Verificação de serviço |

O parâmetro `evento=<id>` fixa o evento e `bateria=<id>` fixa a bateria na TV. Sem esses parâmetros, a TV acompanha a seleção ativa da organização. A área do piloto é pública e não inclui dados de contato.

Pontuação e regras são preliminares: pontos e ajustes entram manualmente; o descarte remove os menores resultados lançados por piloto, mantendo ao menos uma bateria. Desempate por pontos, vitórias, melhor posição e nome. Confirmar o regulamento de cada campeonato antes do uso oficial.

## Arquitetura e dados

- Node.js 24, HTTP e SQLite nativos. Interface HTML/CSS/JavaScript, sem CDN.
- Banco `DATA_DIR/race-control.sqlite`, WAL, gravação atômica do estado e histórico de operações com hashes encadeados. O registro ajuda a conferir alterações; não substitui backups externos nem protege contra um administrador com controle total do servidor.
- Uma única instância/processo de aplicação por banco. Não subir réplicas ou compartilhar o arquivo por NFS. Para escala horizontal futura, migrar o armazenamento e o agendamento para um banco transacional e um coordenador de sorteio.
- Atualizações por Server-Sent Events, reconexão automática e alerta de conexão perdida. A TV recebe somente o estado público. Motivos de autorização, pool futuro e ordem dos karts ficam na API interna.
- Senhas com scrypt, sessão em cookie HttpOnly/SameSite, proteção de origem, limite de login, controle de revisão e idempotência nas escritas. Sessões persistem por 12 horas; trocar a senha encerra as sessões da conta.
- Ao reiniciar após um prazo vencido, o servidor encerra aquele turno e dá a janela completa ao próximo; não pula pilotos sem exibir seu kart. A operação deve acompanhar o indicador de conexão nas telas.

## Verificar

```sh
npm run check
npm test
```

Para conferir também a imagem de produção com volume temporário: `docker build -t rg-racing:validation .` e `bash tests/container.sh`. O teste inicia um container sem rede externa, com raiz somente leitura, verifica login e gravação e reinicia para conferir a persistência. Remove apenas seu próprio container e volume de ensaio.

A suíte usa exclusivamente bancos temporários. Testa sorteio sem repetição, prazo, pausa/retomada, fila e troca tardia, política de devolução, reservas esgotadas, conflito de frota, descarte, autenticação, proteção de origem, concorrência, idempotência, SSE, persistência e troca de senha.

O teste de navegador usa `playwright-core` e Chromium já instalados (ou instalados apenas no ambiente de desenvolvimento). Não são dependências do servidor:

```sh
PLAYWRIGHT_MODULE=/caminho/para/playwright-core/index.mjs CHROMIUM_PATH=/caminho/para/chromium node tests/browser.mjs
```

Ele abre operação e TV em contextos separados, sorteia três pilotos com a janela real de cinco segundos, solicita trocas na janela e fora do prazo, lança resultados, confere a classificação, a reconexão e seis rotas no celular. Capturas em `artifacts/`, fora do Git.

## Hospedagem

Instruções de implantação isolada, HTTPS, backup e recuperação em [deploy/README.md](deploy/README.md). O workflow do GitHub verifica o código e a imagem. Push não modifica servidores nem bancos existentes.

## Próxima integração

O documento [docs/integracao-cronometragem.md](docs/integracao-cronometragem.md) descreve o limite entre dados operacionais e uma futura fonte de tempos. Não há chamada de Race Monitor ou promessa de disponibilidade de uma API nesta versão.
