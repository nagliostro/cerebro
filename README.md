# Cerebro

**pt-BR** · [English](#english)

O ajudante do seu cérebro: as áreas e os objetivos da sua vida, conectados. Cada área vira um
**neurônio**, uma aplicação própria; o **Dominus**, no centro, conversa com você e com a IA que
você já usa.

> Em construção, por fases. Hoje (fase 9) há a Memória: o Dominus no centro e os neurônios em 3D
> em volta, só para quem iniciou o Cerebro. Peça um neurônio ao Dominus: ele planeja (com o custo
> antes), você aceita e ele constrói a aplicação, isolada. Para copiar uma função de um site,
> mande o link: o Navegador observa o original, lê o que existe sobre ele e monta um gabarito, e a
> aplicação só fica pronta quando bate com ele. Os neurônios conversam só pelo contrato,
> com a sua permissão. O núcleo fala com a sua IA (Claude Code, ou qualquer API no formato da
> OpenAI), mede a cota e guarda o grafo.

## Instalar

Precisa do [Node.js](https://nodejs.org) 24 ou mais novo e do
[pnpm](https://pnpm.io/installation). Para a IA, o [Claude Code](https://claude.com/claude-code)
com login feito por você, ou a chave de uma API (OpenAI, Anthropic, Gemini, OpenRouter, Ollama…)
em **Configurações → Conexões**, guardada no cofre de senhas do sistema.
Para pesquisar sites, o Edge ou o Chrome já instalado (no Windows, o Edge sempre está); nada é
baixado.

```sh
git clone https://github.com/nagliostro/cerebro.git
cd cerebro
pnpm install
pnpm build
pnpm start
```

O terminal mostra um link para entrar (`http://localhost:3000/?key=...`). Abra-o no navegador:
ele vale uma vez, por 15 minutos, e deixa aquele navegador conectado. Para outro navegador, abra
http://localhost:3000 nele e use o novo link que aparece no terminal. Seus dados ficam na pasta de dados do sistema (no Windows,
`%APPDATA%\Cerebro`), fora da pasta do programa: atualizar ou reinstalar não apaga nada.

## No celular

O Cerebro abre no celular pela sua própria rede do [Tailscale](https://tailscale.com/download)
(grátis para uso pessoal): nada fica aberto na internet. Instale o Tailscale neste computador e
no celular, entre com a mesma conta nos dois e, no Cerebro, abra **Configurações → Aparelhos** → **Ligar o
acesso remoto** → **Parear um celular**. A câmera do celular lê o código e ele entra; para usar
como aplicativo, adicione à tela de início. Em Aparelhos você vê e revoga cada um.

## Desenvolver

`pnpm dev` (http://localhost:3000), `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:e2e` (Chromium, Firefox e WebKit, em 390, 820 e 1440 px), `pnpm format`.

## Licença

[AGPL-3.0](LICENSE). Quem oferecer o Cerebro como serviço precisa publicar as mudanças.
Segurança: [SECURITY.md](SECURITY.md).

---

## English

Your brain's helper: the areas and goals of your life, connected. Each area becomes a
**neuron**, an application of its own; the **Dominus**, at the center, talks to you and to the
AI you already use.

> Under construction, in phases. Today (phase 9) there is the Memória: the Dominus at the center and
> the neurons in 3D around it, only for whoever started the Cerebro. Ask the Dominus for a neuron:
> it plans (with the cost up front), you accept and it builds the application, isolated. To copy a
> feature from a site, send the link: the Navegador observes the original, reads what is written
> about it and builds an answer key, and the application is ready only when it matches. Neurons
> talk only through the contract, with your permission. The core talks to your AI (Claude Code, or
> any API in the OpenAI format), measures the quota and keeps the graph.

**Phone:** install [Tailscale](https://tailscale.com/download) on this computer and on the
phone (same account), then in the Cerebro open **Settings → Devices** → **Turn on remote access** → **Pair a
phone** and scan the code. Nothing is opened to the internet.

**Install:** Node.js 24+ and pnpm (and Edge or Chrome, already installed, to research sites), then `pnpm install`, `pnpm build`, `pnpm start` and open
the link the terminal shows (it works once, for 15 minutes; another browser gets a new link). Your data lives in the system's data folder, outside the program folder.

**License:** [AGPL-3.0](LICENSE). **Security:** [SECURITY.md](SECURITY.md).
