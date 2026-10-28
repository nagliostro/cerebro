# Identidade visual

Fonte de verdade do visual do Cerebro. Quando um padrão muda, mude aqui, no CSS e nas instruções do
Construtor (`packages/dominus/src/builder/prompts.ts`), juntos.

## Caixa de conversa (uma só)

Todo lugar onde o dono escreve para o Cerebro usa o **mesmo componente**, a `DominusBox`
(`apps/web/components/dominus-box.tsx`): pedir ao Dominus, ajustar um neurônio, responder ou
mudar um plano. Só muda o contexto, ou seja, o nome dentro do campo, o rótulo da seta de enviar e
para onde o texto vai. Nunca crie outro campo de conversa.

- Moldura fina com a luz correndo enquanto o Dominus trabalha. O foco acende a moldura inteira,
  nunca um contorno retangular no texto.
- Clipe à esquerda: imagens e textos (até 6), também por Ctrl+V e arrastando, com miniatura e "x".
- A seta de enviar só aparece com algo para enviar. Enquanto o Dominus trabalha, ela vira o
  "parar" (Esc faz o mesmo). Enter envia, Shift+Enter quebra a linha, ↑ ↓ trazem pedidos
  anteriores.
- Ações próprias do contexto (Voltar, Rejeitar) ficam fora da caixa, como botões de texto.

## Botões (um só)

Todo botão com texto usa o mesmo tamanho (`apps/web/components/button.ts`; nos neurônios, `.cb-botao`
e `.cb-botao-sec` do kit). Nunca crie um botão com altura, largura ou cantos próprios.

- Pílula de **44px de altura**, texto numa linha só, 20px de respiro de cada lado.
- **Largura mínima de 96px:** uma palavra curta ("Bom", "Ruim") continua pílula, nunca vira oval.
- **Largura máxima de 280px:** um texto longo não estica o botão pela tela; reescreva o texto.
- Quatro aparências, mesmo tamanho:
  - **Principal** (`BTN_PRIMARY`): branco, texto escuro. Uma por grupo.
  - **Secundário** (`BTN_SOFT`): branco a 8%, clareia no hover.
  - **Texto** (`BTN_PLAIN`): sem fundo (Fechar, Voltar, Rejeitar).
  - **Opção de uma escolha** (`btnOption`): contorno fino; a escolhida fica preenchida em branco
    (profundidade, idioma, papel, permissões, nota do resultado).
- Só ícone: círculo de 44px (fora desta regra).
- **Texto que pode não caber num botão nunca vai num botão.** Uma opção que é uma frase (a função
  a copiar, uma resposta sugerida) é uma **caixa de seleção** (`choiceBox`): largura toda,
  retângulo de cantos de 10px com contorno fino, o texto em quantas linhas precisar, um círculo à
  esquerda; a escolhida acende o contorno e preenche o círculo. Nada é cortado.

## Avisos (toasts)

Todo aviso de como uma operação terminou, em qualquer tela e em qualquer neurônio, passa por um
lugar só: `notify` de `apps/web/lib/toast.ts`, desenhado pelo **Sonner** (`components/toaster.tsx`,
o mesmo da Vercel e do shadcn/ui). Nada importa o Sonner direto (o ESLint recusa). Nos neurônios,
`cerebro.notify.success(título, detalhe)` do kit chega ao mesmo aviso. Nunca crie uma faixa,
`alert()` ou texto de "Salvo." solto na tela.

- **Lugar:** no topo, ao centro, abaixo do menu (como o iOS e o macOS), longe da caixa do Dominus
  e das legendas do pé. No celular, largura toda com 16px de margem. No máximo 3 à vista; o resto
  empilha. Passar o mouse abre a pilha; arrastar ou o "x" dispensa.
- **Aparência:** vidro escuro (como os painéis), contorno fino, cantos de 10px, uma sombra só,
  suave. Texto do Cerebro: título em branco, detalhe a 55%. Só o ícone (Lucide, 16px) tem a cor do
  tipo, em tom calmo: verde (sucesso), vermelho (erro), amarelo (atenção), azul-ardósia (info).
- **Texto:** o título diz o que aconteceu, curto ("Celular pareado", "Não deu para renomear o
  neurônio"); o detalhe, quando ajuda, dá o motivo ou o próximo passo ("Motivo: …", "Nada mudou.
  Tente de novo em instantes."). Nunca só "Erro". Os textos ficam em `toast` no i18n.
- **Tempo:** sucesso 4s, info 5s, atenção 7s, erro 8s. Trabalho demorado: `notify.loading` ou
  `notify.promise`, que vira sucesso ou erro no mesmo lugar.
- **Quando:** sucesso depois de salvar, excluir, enviar ou terminar algo; erro sempre que uma ação
  do dono falha (`notifyFailure(título, erro, textos)` escreve o motivo). Não para o que a tela já
  mostra mudando (uma permissão marcada, uma aba). O mesmo `id` substitui o aviso em vez de empilhar.
- **Uma ação, no máximo** ("Desfazer", "Tentar de novo"), numa pílula branca pequena.
- O andamento do Dominus (a legenda do pé) e o "Como ficou?" não são avisos: ficam onde estão.

## Link do GitHub

Um link de repositório (github.com/dono/nome) não abre o Navegador. O plano pergunta "Criar um
neurônio com ele?": o nome do repositório como título de seção, o resumo de duas ou três frases
(modelo barato), uma linha de fatos (linguagem · licença · estrelas · versão · link "GitHub") e,
quando for o caso, um aviso de licença não livre ou de repositório arquivado. Abaixo, "De que
tipo", com duas caixas de seleção de título e descrição: **Produção** (ferramenta que o Dominus e
os neurônios usam) e **Aplicação** (uma tela para o dono). Principal: Continuar; texto: Rejeitar.

**Produção** vira um plano de instalação, sem IA. Em "O que será instalado" aparecem a versão e a
data, o arquivo escolhido para este computador (link, tamanho, sistema), a licença livre e o
SHA-256 (do GitHub ou do autor). Em "Como é instalado", uma lista numerada: só esse arquivo, sem
compilar; confere o SHA-256; roda uma vez com --version; desinstalar é remover o neurônio. No pé,
"Instalar não usa IA", principal **Instalar** e texto Rejeitar. Não tem Alterar: um programa é
instalado como o autor publicou. Sem licença livre, versão, arquivo para este computador ou
checksum, o plano termina dizendo o motivo.

O neurônio de Produção não tem aplicação. A tela dele mostra "Programa instalado": uma lista de
nome e valor (origem, versão, arquivo, programa, o que respondeu, licença, SHA-256, data) e o
caminho para desinstalar em Configurações → Neurônios.

## Conversa com o neurônio

O lápis abre a conversa com o neurônio (`apps/web/components/adjust-panel.tsx`), no padrão dos apps
de chat (ChatGPT, Claude, Gemini):

- Cabeçalho: o ponto na cor do neurônio e o nome; "x" para fechar.
- O que o dono disse fica à direita, num balão suave (branco a 8%, cantos de 14px).
- O que o neurônio diz fica à esquerda, em texto simples, depois do seu ponto, na primeira pessoa
  ("Feito. …", "Desfiz esse ajuste…"). Abaixo, discreto: data, como respondeu ("resposta
  direta", "sem IA") e o custo na cor de custo.
- Vazio, o neurônio se apresenta. O trabalho em andamento é a última fala dele (passos, custo,
  "Como ficou?", Desfazer). Enquanto ele pensa numa resposta, "Pensando…" pulsa no lugar dela.
- Uma pergunta recebe resposta direta, sem plano. Uma mudança vira um plano **dentro do fio**,
  num cartão de contorno fino, sem repetir o pedido nem o nome do neurônio; Ajustar e Rejeitar
  ficam no cartão.
- A caixa no pé é a mesma `DominusBox`: "Fale com X"; com um plano aberto, ela responde às
  perguntas dele ("Respostas") ou muda o plano ("O que mudar no plano"). `?demo` mostra uma
  conversa de exemplo com os tipos de resposta.

## Nota do resultado

Quando um neurônio fica pronto ou é ajustado, a legenda pergunta "Como ficou?" com três pílulas
(Ruim, Razoável, Bom), no botão de opção (`btnOption`). A escolhida fica preenchida em branco; dá
para trocar. A nota alimenta o
afinamento do Dominus (`packages/dominus/src/tuning/tuner.ts`), sem gastar tokens.

## Neurônios (o kit)

Toda aplicação de neurônio usa o kit em `apps/web/public/neuron-kit/` (`base.css`, `icons.js`,
`cerebro.js`). O neurônio não define fontes, tamanhos, cores de texto, fundos nem sombras próprias.

### Base

- **Fundo:** transparente. O céu do Cerebro aparece por trás. Sem cards, bordas, gradientes ou
  sombras próprias.
- **Texto:** um estilo só: Geist Mono 500, 12px, altura de linha 1.6, branco a 55%.
  - `.cb-forte` é branco puro e serve para os poucos destaques.
  - `.cb-destaque` é o número principal da tela: 28px, branco, no máximo um por tela.
- **Cor do neurônio** (`--cb-cor`): só em detalhes pequenos: `.cb-ponto`, `.cb-barra > i` e o
  último ponto do gráfico.
- **Largura:** `<main>` centralizado, até 760px, com 16px de margem lateral no celular.

### Controles: um tamanho só

Todo controle clicável tem a mesma altura, o mesmo texto e o mesmo recuo. Assim, uma linha de
botões e abas fica alinhada.

| Medida                     | Valor                                  |
| -------------------------- | -------------------------------------- |
| Altura                     | 44px (alvo de toque mínimo)            |
| Texto                      | 12px, igual ao resto, sem negrito      |
| Recuo do texto até a borda | 20px                                   |
| Cantos                     | pílula (999px)                         |
| Espaço entre controles     | 8px na mesma ação, 12px em `.cb-linha` |

| Peça            | Classe                               | Aparência                                                                                                                   | Hover                        |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Ação principal  | `.cb-botao`                          | pílula branca, texto preto                                                                                                  | brilho branco suave em volta |
| Ação secundária | `.cb-botao-sec`                      | pílula branca a 8%                                                                                                          | fundo a 12%, texto branco    |
| Só ícone        | `.cb-botao-icone`                    | círculo de 44px, sem fundo                                                                                                  | fundo a 8%, ícone branco     |
| Abas            | `.cb-abas` + `button[aria-selected]` | barra de 44px a 6%; a aba escolhida é uma pílula branca de 36px dentro dela (4px de folga + 16px = os mesmos 20px de recuo) | texto branco                 |
| Desativado      | `:disabled`                          | 40% de opacidade, sem brilho                                                                                                | —                            |

Regras:

- **Uma ação principal por tela ou por grupo.** O resto é secundário ou ícone.
- **Nunca mudar** altura, recuo ou margem de um controle no CSS do neurônio. Os botões de uma
  linha ficam na mesma altura, lado a lado.
- **Ícone sozinho** sempre com `aria-label`.
- As abas seguem o controle segmentado da Apple: a barra tem a altura de um botão, e a aba
  escolhida fica dentro dela.

### Campos

- `.cb-campo`: retângulo de 52px, cantos de 10px, nome do campo dentro (label flutuante,
  `placeholder=" "`). Serve para input, select e textarea.
- O select tem a seta do kit, e o texto longo termina em "…".
- Números não têm as setinhas de subir e descer: são digitados.
- `.cb-dupla`: dois campos lado a lado. O primeiro cresce, o segundo fica com 128px ou 42%
  (valor + moeda ou unidade).

### Outras peças

- `.cb-linha`: uma linha com espaço entre os itens. Ela quebra no celular.
- `.cb-lista > li`: uma lista com linhas finas entre os itens.
- `.cb-barra > i`: uma barra fina na cor do neurônio, com a largura em %.
- `<svg class="cb-grafico">`: um gráfico pequeno, com linha branca e o último ponto na cor do neurônio.
- **Gráficos completos** (circular, linhas, barras): desenhados por biblioteca (Chart.js; os
  rótulos pelo chartjs-plugin-datalabels), nunca à mão, vestidos como o kit:
  - texto de 12px branco a 55%, grade branca a 6%, sem borda nos eixos;
  - balões de vidro escuro com cantos de 10px;
  - eixo de valores curto ("R$ 3 mil"), valor exato no balão.
  - Cada série tem uma cor fixa pela sua posição na lista, nunca pelo tamanho: `#3987e5`
    `#d95926` `#199e70` `#c98500` `#d55181` `#008300`. Da sétima em diante, branco a 35%. A
    paleta foi validada para daltonismo e contraste no céu escuro.
  - A cor nunca é o único nome: um rótulo curto no gráfico (iniciais dentro da fatia, no fim da
    linha, sob a barra) e uma legenda com essas iniciais, que mostra o nome inteiro ao passar o
    mouse ou focar, com o valor.
  - Circular com 2px entre as fatias, barras com topo arredondado de 4px, linhas de 2px sem
    pontos até o hover.
  - Tamanho mínimo: qualquer valor acima de zero aparece e pode ser apontado (fatia de pelo menos
    4% do círculo, barra de pelo menos 8px). O balão e a legenda mostram o valor exato.
  - Mostra o período da tela (o mês aberto), a menos que o dono peça a evolução.
- `<dialog>`: já tem o estilo do kit (vidro escuro, 10px de canto).
- **Ícones:** `<i data-icon="nome">` (Lucide, 1.75 de traço, na cor do texto).
