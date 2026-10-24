# Cerebro

**pt-BR** · [English](#english)

O ajudante do seu cérebro: as áreas e os objetivos da sua vida, conectados. Cada área vira um
**neurônio**, uma aplicação própria; o **Dominus**, no centro, conversa com você e com a IA que
você já usa.

> Em construção, por fases. Hoje (fase 1) há só o esqueleto: a tela vazia com o Dominus.

## Instalar

Precisa do [Node.js](https://nodejs.org) 24 ou mais novo e do
[pnpm](https://pnpm.io/installation).

```sh
git clone https://github.com/nagliostro/cerebro.git
cd cerebro
pnpm install
pnpm build
pnpm start
```

Abra http://localhost:3000. Seus dados ficam na pasta de dados do sistema (no Windows,
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

> Under construction, in phases. Today (phase 1) there is only the skeleton: the empty screen
> with the Dominus.

**Install:** Node.js 24+ and pnpm, then `pnpm install`, `pnpm build`, `pnpm start` and open
http://localhost:3000. Your data lives in the system's data folder, outside the program folder.

**License:** [AGPL-3.0](LICENSE). **Security:** [SECURITY.md](SECURITY.md).
