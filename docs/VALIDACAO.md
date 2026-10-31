# Validação da versão 0.1.0

Executada em 31/10/2026, com Node.js 24 e Chromium, usando exclusivamente dados e volumes de teste.

| Verificação | Resultado |
| --- | --- |
| `npm run check` | Sintaxe aprovada |
| `npm test` | 18 testes aprovados |
| `node tests/browser.mjs` com Playwright/Chromium | Fluxo completo aprovado |
| `docker build -t rg-racing:validation .` | Imagem construída |
| `bash tests/container.sh` | Inicialização e persistência aprovadas |

O teste de navegador usa gestão e TV em contextos separados. Confere formação, sorteio real com cinco segundos, pedido na janela, pausa/retomada, pedido tardio com motivo, sorteio das trocas, karts sem repetição, liberação para a pista, encerramento, publicação manual de resultados e classificação. Também verifica reconexão, ausência de controles de gestão na TV e largura de seis páginas em tela de celular de 390 px. Nenhum erro de JavaScript foi observado.

O teste do container roda em produção, sem dados de demonstração, com volume descartável, usuário sem root, raiz somente leitura, sem rede externa e com cookies Secure. Grava um piloto, reinicia o container e confere a preservação do registro. O teste de backup restaura uma cópia consistente incluindo transações em WAL e recusa sobrescrever backups existentes.

As capturas geradas ficam em `artifacts/`, fora do Git. Os testes não representam uma conexão real de cronometragem, ensaio de carga ou validação do regulamento esportivo. Certificado HTTPS, DNS e comunicação com dispositivos na rede do evento precisam ser conferidos na implantação real.
