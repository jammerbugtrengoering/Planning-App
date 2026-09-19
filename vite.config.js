import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tidspunktet for buildet bages ind, saa appen kan vise HVILKEN udgave der koerer.
//
// Worklist har haft det laenge. Her manglede det, og det kostede os to gange paa to
// dage: et push blev afvist, og der var ingen maade at se paa skaermen, om det, man
// sad og kiggede paa, var foer eller efter rettelsen. Man kan ikke se udefra, om en
// udgivelse er naaet frem — og saa bruger man en time paa at teste gammel kode.
//
// Drift-siden viser det. Er stemplet aeldre, end du forventer, er dit sidste push
// ikke gaaet igennem hos Netlify.
const BYGGET = new Date().toISOString().slice(0, 16).replace('T', ' ')

// https://vite.dev/config/
export default defineConfig({
  define: { __BYGGET__: JSON.stringify(BYGGET) },
  plugins: [react()],
})
