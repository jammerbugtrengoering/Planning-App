// SLUKKET. Denne funktion var en MIDLERTIDIG probe brugt til at undersoege Dineros
// /invoices-endpoint (paginering, filtre, felter) foer bygningen af den rigtige
// natlige synkronisering ("dinero-omsaetning-sync"). Formaalet er opfyldt, og
// funktionen svarer nu ingenting for ikke at staa aaben med adgang til Dinero-noeglerne.
Deno.serve(() => new Response(JSON.stringify({ slukket: true }), { status: 410, headers: { "Content-Type": "application/json" } }));
