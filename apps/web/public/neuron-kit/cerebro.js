// The bridge between a neuron's application and the Cerebro. The application runs isolated
// (sandboxed, no cookies, no storage, no network of its own): everything goes through messages to the
// Cerebro page that holds it, which checks and forwards them. There is no way here to change
// permissions or reach anything but this neuron's data and what the owner allowed.
(() => {
  let next = 0;
  const waiting = new Map();

  addEventListener('message', (e) => {
    if (e.source !== parent || e.data?.cerebro !== 'reply') return;
    const w = waiting.get(e.data.requestId);
    if (!w) return;
    waiting.delete(e.data.requestId);
    if (e.data.ok) w.resolve(e.data.result);
    else w.reject(new Error(e.data.error ?? 'failed'));
  });

  function ask(message) {
    const requestId = ++next;
    return new Promise((resolve, reject) => {
      waiting.set(requestId, { resolve, reject });
      // The page is the Cerebro's; the application's own origin is opaque, so "*" is the only
      // target it can name. The page answers only to this frame.
      parent.postMessage({ cerebro: 'request', requestId, ...message }, '*');
    });
  }

  const collection = (name) => ({
    list: () => ask({ kind: 'data', collection: name, op: 'list' }),
    get: (id) => ask({ kind: 'data', collection: name, op: 'get', input: { id } }),
    create: (data) => ask({ kind: 'data', collection: name, op: 'create', input: { data } }),
    update: (id, data) =>
      ask({ kind: 'data', collection: name, op: 'update', input: { id, data } }),
    delete: (id) => ask({ kind: 'data', collection: name, op: 'delete', input: { id } }),
  });

  const say = (kind) => (title, description) =>
    parent.postMessage(
      {
        cerebro: 'notify',
        kind,
        text: String(title),
        description: description == null ? undefined : String(description),
      },
      '*',
    );
  const notify = Object.assign(say('message'), {
    success: say('success'),
    error: say('error'),
    warning: say('warning'),
    info: say('info'),
  });
  Object.freeze(notify);

  window.cerebro = Object.freeze({
    /** The language of the Cerebro's screen ("en", "pt-BR"): the one the owner chose, else the browser's. */
    locale: new URLSearchParams(location.search).get('locale') || navigator.language,
    /** This neuron's own data, by collection: cerebro.data('gastos').create({...}). */
    data: collection,
    /** Asks another neuron, through its contract: cerebro.neurons.call('agenda', 'eventos.list'). */
    neurons: Object.freeze({
      call: (target, operation, input) => ask({ kind: 'call', target, operation, input }),
    }),
    /**
     * Live data from a public site the owner allowed for this neuron (its plan lists them):
     * cerebro.net.get(url) → { status, type, body }. Only GET, only those sites; one not allowed
     * yet asks the owner (in the globe) and fails until they allow it.
     */
    net: Object.freeze({
      get: (url, why) => ask({ kind: 'net', url: String(url), why: why ? String(why) : '' }),
    }),
    /**
     * A notice of the Cerebro (a toast at the top of the screen), the same as its own screens use:
     * a title that says what happened and, when it helps, a description with the detail.
     * cerebro.notify.success('Gasto salvo', 'R$ 32,00 em Mercado') · .error · .warning · .info;
     * cerebro.notify('text') is a plain one.
     */
    notify,
  });
})();
