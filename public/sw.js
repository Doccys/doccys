/* Doccys' service worker — bevidst minimal.
 *
 * Formålet er udelukkende at gøre siden installérbar: Chrome/Edge
 * (Android + desktop) viser kun "Installér app"-prompten, når der
 * er registreret en service worker MED en fetch-listener. Den her
 * griber aldrig noget — alle requests går lige gennem netværket som
 * uden den. Det er et bevidst valg: en streamingtjeneste med
 * betalingsflow og realtime-opdateringer skal ikke have en cache,
 * der kan vise forældet indhold eller blande sig i betalinger.
 * (Offline-støtte kan bygges senere — se PROJEKTSTATUS.)
 */
self.addEventListener("install", () => {
  // Tag strax over, så en ny version ikke venter på, at gamle
  // faner lukker.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Overtag åbne faner med det samme (ingen andre SW'ere findes,
  // der er intet at rydde op efter).
  event.waitUntil(self.clients.claim());
});

// Findes, men gør ingenting — det er selve eksistensen af denne
// listener, der opfylder Chromes installationskriterium.
self.addEventListener("fetch", () => {});