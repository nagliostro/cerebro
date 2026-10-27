// Runs before the page's scripts (root layout): keeps the browser's offer to install the Cerebro
// ("beforeinstallprompt", often sent before React is up) and says when it changes, for
// components/install.ts. The browser's own first invitation is left as it is (no preventDefault).
export const KEEP_INSTALL_OFFER = `addEventListener('beforeinstallprompt',function(e){window.__cbOffer=e;dispatchEvent(new Event('cb-install'))});addEventListener('appinstalled',function(){window.__cbOffer=null;window.__cbInstalled=true;dispatchEvent(new Event('cb-install'))});`;
