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

  window.cerebro = Object.freeze({
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
    /** A short notice at the foot of the Cerebro's screen. */
    notify: (text) => parent.postMessage({ cerebro: 'notify', text: String(text) }, '*'),
  });
})();
