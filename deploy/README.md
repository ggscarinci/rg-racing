# Publicar o RG Racing em uma VM Linux

Projeto Docker Compose **rg-racing**, volume **rg_racing_data**, porta padrão **127.0.0.1:3007**, upstream **rg-racing:3000** quando o proxy roda em Docker. Nenhum banco, usuário, runner, porta de banco ou volume de outro sistema é reutilizado.

É necessário acesso administrativo à VM, domínio/subdomínio e DNS apontando ao servidor. Endereço de rede privada exige VPN ou acesso local. Não exponha SSH nem banco para publicar o site; apenas o proxy HTTPS recebe os visitantes.

## Instalação inicial

1. Obtenha o código do novo repositório em um diretório próprio, por exemplo `/opt/rg-racing`. Para repositório privado, use uma credencial de leitura própria. Selecione o SHA testado.
2. Crie `.env` a partir de `.env.example`, com permissão `600`. Defina usuário e senha de produção, versão e porta livre. Nunca copie credenciais, `.env` ou banco de outro sistema. Guarde a senha no gerenciador de segredos.
3. Execute na pasta do RG Racing:

```sh
docker compose build
docker compose up -d
curl --fail http://127.0.0.1:3007/health
```

O volume novo recebe um evento vazio; não há pilotos ou resultados de demonstração. `ADMIN_PASSWORD` cria a conta apenas na primeira execução. Depois, a senha é alterada na interface; alterar a variável não redefine uma conta existente.

## Integrar no proxy existente

O proxy que já atende HTTPS pode receber outro bloco de domínio, preservando os blocos existentes. Não iniciar um segundo proxy nas portas 80/443.

**Se o Caddy está em Docker:** identifique a rede do proxy (sem ler ou publicar seus segredos), configure `PROXY_NETWORK` no `.env` do RG Racing e use ambos os arquivos:

```sh
docker compose -f compose.yaml -f deploy/compose.proxy.yml up -d --build
```

Adicione ao Caddy existente um bloco como [Caddyfile.example](Caddyfile.example), substituindo o domínio. O nome `rg-racing` resolve apenas na rede compartilhada com o proxy. O RG Racing mantém seu próprio volume e rede de aplicação. Valide a configuração do Caddy antes de recarregar pelo procedimento do servidor.

**Se o Caddy roda no host:** use `reverse_proxy 127.0.0.1:3007` no bloco do novo domínio; não é necessária a rede compartilhada.

O proxy deve preservar o Host original e não armazenar em cache `/api/*`. As respostas SSE precisam de entrega imediata e timeout longo. O exemplo usa `flush_interval -1`. Cookies de produção usam Secure; o login deve ser feito pelo endereço HTTPS, mesmo que `/health` seja verificado via loopback.

Crie o DNS e verifique a emissão do certificado, `/health`, login, sorteio entre dois dispositivos e reconexão. O RG Racing público pode ser visto sem conta; a organização exige sessão própria.

## Atualizações e retorno de versão

Antes da troca, faça backup e registre o SHA instalado. Ensaie o mesmo SHA em outra instalação com volume e porta próprios. Aplique a nova imagem com o mesmo volume do RG Racing. Não execute `down -v` em uma instalação com dados reais.

Para voltar o código, restaure a imagem/SHA anterior preservando o volume. Se uma versão futura alterar o formato do banco, use o procedimento de migração/recuperação daquela versão; não sobreponha um banco antigo ao atual com novas inscrições ou resultados.

O workflow fornecido é de CI e não usa o runner de outro sistema. Para automatizar a publicação nesta máquina, registre um agente próprio ou uma credencial SSH restrita ao RG Racing e configure esse novo repositório. Um runner vinculado a outro repositório não é automaticamente acessível aqui.

## Backup

O menu de configurações exporta eventos e histórico em JSON, sem senhas ou sessões. Para recuperação completa, guarde também uma cópia consistente do SQLite. O comando a seguir cria uma cópia no volume; o nome de saída precisa ser novo:

```sh
docker compose exec -T app node src/backup.mjs /app/data/race-control.sqlite /app/data/backup-antes-publicacao.sqlite
```

Copie esse arquivo para armazenamento externo protegido. Não copie apenas o `.sqlite` enquanto houver gravação: os dados podem estar no WAL. Para restaurar, pare **somente** o RG Racing, preserve a base atual, restaure o backup consistente com proprietário do usuário `node` e retome. Confirme login, eventos e sorteios em uma instalação de teste antes de substituir produção.

Banco, credenciais, backups e dados de pilotos não entram no GitHub. A rotina de cópia externa e o ensaio periódico de restauração precisam ser configurados na VM.
