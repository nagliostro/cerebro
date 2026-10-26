// The language of a request, so the plan and the application come in the language the owner
// wrote in, whatever the browser announces. Only the two languages the Cerebro speaks; words
// common in one and rare in the other decide, and accents count for Portuguese. Unsure: null,
// and the screen's language is kept.

const PT = new Set(
  'de que para uma um não nao com do da dos das em no na nos nas meu minha meus minhas preciso quero faça faca crie criar copie copiar neurônio neuronio função funcao você voce isso esse essa este esta pelo pela também tambem como mais muito sem'.split(
    ' ',
  ),
);
const EN = new Set(
  'the and for with of to make create copy need want my this that these please from into which what how app track keep list about would should could'.split(
    ' ',
  ),
);

export function requestLocale(text: string): 'pt-BR' | 'en' | null {
  const words =
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .match(/\p{L}+/gu) ?? [];
  let pt = (text.match(/[ãõçáéíóúâêô]/gi)?.length ?? 0) * 2;
  let en = 0;
  for (const w of words) {
    if (PT.has(w)) pt++;
    if (EN.has(w)) en++;
  }
  if (pt === en) return null;
  return pt > en ? 'pt-BR' : 'en';
}
