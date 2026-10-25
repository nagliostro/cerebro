# Cerebro

**pt-BR** · [English](#english)

O ajudante do seu cérebro: as áreas e os objetivos da sua vida, conectados. Cada área vira um
**neurônio**, uma aplicação própria; o **Dominus**, no centro, conversa com você e com a IA que
você já usa.

> Em construção, por fases. Hoje (fase 5) há a Memória: o Dominus no centro e os neurônios em 3D
> em volta, só para quem iniciou o Cerebro. O núcleo já fala com a sua IA (Claude Code, ou qualquer
> API no formato da OpenAI), mede a cota e guarda o grafo.

## Instalar

Precisa do [Node.js](https://nodejs.org) 24 ou mais novo e do
[pnpm](https://pnpm.io/installation). Para a IA, o [Claude Code](https://claude.com/claude-code)
com login feito por você (a chave de uma API entra pelas Configurações, quando elas chegarem).

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

> Under construction, in phases. Today (phase 5) there is the Memória: the Dominus at the center and
> the neurons in 3D around it, only for whoever started the Cerebro. The core already talks to your
> AI (Claude Code, or any API in the OpenAI format), measures the quota and keeps the graph.

**Install:** Node.js 24+ and pnpm, then `pnpm install`, `pnpm build`, `pnpm start` and open
the link the terminal shows (it works once, for 15 minutes; another browser gets a new link). Your data lives in the system's data folder, outside the program folder.

**License:** [AGPL-3.0](LICENSE). **Security:** [SECURITY.md](SECURITY.md).
