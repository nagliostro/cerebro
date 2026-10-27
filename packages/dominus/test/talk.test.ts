import { describe, expect, it } from 'vitest';

import { planPrompt } from '../src/builder/prompts.ts';
import { answerPrompt, countAnswer, isQuestion, parseAnswer } from '../src/builder/talk.ts';

// The conversation with a neuron, the parts that are code: a question or a change, a count from
// its data, the answer's prompt and what comes back.

describe('a question or a change', () => {
  it('a question about how things are is answered, even with a verb of change in it', () => {
    for (const q of [
      'De onde vem a cotação?',
      'como adiciono um gasto?',
      'Quantos itens eu tenho',
      'o que acontece quando eu apago um item?',
      'Where does the rate come from?',
      'is it saved offline?',
      // As it was typed once, in quotes.
      '"De onde vêm os dados?"',
      '“quantos registros eu tenho?”',
    ])
      expect(isQuestion(q), q).toBe(true);
  });

  it('a request is a change, also when it is asked as a question; unsure, a change', () => {
    for (const c of [
      'Mostre os valores sem centavos',
      'pode mostrar o total no topo?',
      'Você pode adicionar um gráfico?',
      'troque a cor do botão',
      'can you add a chart?',
      'a chart of the month',
      'deixa o fundo azul?',
    ])
      expect(isQuestion(c), c).toBe(false);
  });
});

describe('a count, by code', () => {
  const data = [
    { name: 'gastos', count: 12 },
    { name: 'categorias', count: 1 },
  ];

  it('answers how many of a collection, by its name or its singular', () => {
    expect(countAnswer('Quantos gastos eu tenho?', data, 'pt-BR')).toBe(
      'Tenho 12 registros em gastos.',
    );
    expect(countAnswer('quantas categorias?', data, 'pt-BR')).toBe('Tenho 1 registro em categorias.');
    expect(countAnswer('How many records do I have?', data, 'en')).toBe(
      'I have 12 records in gastos, 1 record in categorias.',
    );
  });

  it('says nothing when it is not a count of its data', () => {
    expect(countAnswer('De onde vem a cotação?', data, 'pt-BR')).toBeNull();
    expect(countAnswer('quantos dias faltam para o natal?', data, 'pt-BR')).toBeNull();
    expect(countAnswer('quantos registros?', [], 'pt-BR')).toBeNull();
  });
});

describe('the answer by a model', () => {
  it('reads the map, the code, what was said lately and the question', () => {
    const p = answerPrompt({
      name: 'Gastos',
      locale: 'pt-BR',
      map: '# Gastos (gastos)',
      code: [{ path: 'app.js', text: 'x', only: ['total'] }],
      partial: true,
      conversation: ['Owner: oi', 'You: olá'],
      question: 'de onde vem o total?',
    });
    expect(p).toContain('Brazilian Portuguese');
    expect(p).toContain('You are "Gastos".');
    expect(p).toContain('Your map:\n# Gastos (gastos)');
    expect(p).toContain('--- app.js (only: total)');
    expect(p).toContain('Lately, with the owner:\nOwner: oi\nYou: olá');
    expect(p).toContain('The owner asks:\nde onde vem o total?');
  });

  it('takes the answer and whether it was a change; anything else is asked again', () => {
    expect(parseAnswer('```json\n{"answer":"Do BCB.","change":false}\n```')).toEqual({
      answer: 'Do BCB.',
      change: false,
    });
    expect(parseAnswer('{"answer":"Vou planejar.","change":true}')).toMatchObject({ change: true });
    expect(parseAnswer('not json')).toBeNull();
    expect(parseAnswer('{"answer":""}')).toBeNull();
  });

  it('the planner of an adjustment reads what was said lately too', () => {
    const p = planPrompt({
      request: 'r',
      locale: 'en',
      exchanges: [],
      neurons: [],
      conversation: ['Owner: where is the total?', 'You: at the foot.'],
    });
    expect(p).toContain('Lately, between the owner and this neuron:\nOwner: where is the total?');
  });
});
