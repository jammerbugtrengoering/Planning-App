// SLUKKET 3.10.2026. Denne funktion var en MIDLERTIDIG probe: kan man slaa en
// faktura op i Dinero paa nummeret alene? Svaret blev fundet under opbygningen, og
// funktionen stod derefter aaben med adgang til Dinero-noeglerne og kunne hente
// fakturaer med kundenavne, uden at noget i appen brugte den. Samme behandling som
// dinero-omsaetning-probe. Den oprindelige kode ligger i git-historikken.
Deno.serve(() => new Response(JSON.stringify({ slukket: true }), { status: 410, headers: { "Content-Type": "application/json" } }));
