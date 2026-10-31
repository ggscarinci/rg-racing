# Integração futura de cronometragem

Esta versão não consome Race Monitor nem outra API de tempos. Primeiro confirmar fornecedor, contrato de API, autenticação, identificadores e licença de uso. Não usar coleta de páginas como substituto silencioso da integração.

Um adaptador de servidor deve converter a fonte em registros internos: evento, bateria, sessão de cronometragem, kart, transponder, piloto, volta, passagem, tempo em milissegundos e momento da leitura. Guardar também identificador original, revisão e horário de recebimento. Credenciais ficam no ambiente do servidor, nunca no navegador.

O vínculo piloto/kart depende da atribuição final após as trocas. A organização confere a relação entre bateria operacional e sessão da fonte antes de publicar resultados. Passagens duplicadas devem ser idempotentes; correções da cronometragem geram revisão, preservando a origem e o histórico. A publicação de tempos não pode alterar o sorteio já registrado.

Manter separados o resultado provisório, o resultado oficial, os ajustes dos comissários e a regra de pontuação do campeonato. A classificação atual usa lançamento manual e um critério simples de descarte/desempate, que precisa representar o regulamento aprovado antes da automação oficial.

O ranking dos karts exige método validado: tempos comparáveis, mesma sessão/condição, volta válida, lastro, piloto, manutenção e tamanho de amostra. Exibir origem e cobertura; nunca atribuir um índice quando faltarem medições. Dashboard do piloto e fichas de prova devem conservar o vínculo com evento e bateria históricos.

Antes de ativar o adaptador: testar com dados de ensaio, concorrência de revisões, desconexão, reprocessamento de passagens, penalidades, resultados oficiais e ausência da fonte. A operação de sorteio deve continuar funcionando se a cronometragem estiver indisponível.
