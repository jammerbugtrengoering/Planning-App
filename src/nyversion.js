// Er den fane, der kører lige nu, blevet forældet?
//
// 13.9.2026. «Måned» blev lavet om til «hver 4. uge». Klokken 9.35 lå den nye regel
// ude. Klokken 9.48 og igen 13.31 dannede planen alligevel opgaver i UGERYTME på fire
// af aftalerne — syv opgaver, der ikke skulle have været der, og en af dem lå dagen
// efter og var tildelt en medarbejder.
//
// Årsagen var hverken databasen eller reglen. Det var en browserfane, der havde stået
// åben siden om morgenen og kørte den kode, den hentede DENGANG. I den kode fandtes
// «4_uger» ikke, og den ukendte værdi faldt tilbage på 1 uge. Kontoret så en helt
// almindelig ugeplan; opgaverne blev gemt i databasen som alle andre.
//
// Det er den farlige slags: planen bliver ved med at se rigtig ud, mens den skriver
// forkert. Derfor holder vi øje med, om der er kommet en nyere udgave, og lader være
// med at DANNE nye opgaver, indtil fanen er genindlæst. Se opgaver, rette tider og
// afslutte må man stadig — det er kun det at finde på nye opgaver, der stoppes.

// Filnavnet på det bundt, denne fane faktisk kører. Vite giver hver udgivelse sit eget
// navn med en indholdssum i, så to forskellige udgaver har aldrig samme navn.
function egetBundt() {
  try {
    return new URL(import.meta.url).pathname.split("/").pop() || null;
  } catch {
    return null;
  }
}

// Hvilket bundt ligger der på serveren lige nu?
//
// cache: "no-store" er ikke pynt. Uden den svarer browseren selv fra sin egen cache,
// og så sammenligner vi den gamle udgave med sig selv og finder aldrig noget.
async function bundtPaaServeren() {
  const svar = await fetch(`/index.html?t=${Date.now()}`, { cache: "no-store" });
  if (!svar.ok) return null;
  const html = await svar.text();
  const fundne = html.match(/\/assets\/[A-Za-z0-9._-]+\.js/g);
  return fundne && fundne.length ? fundne[fundne.length - 1].split("/").pop() : null;
}

export async function erFanenForaeldet() {
  // Under udvikling skifter filnavnet hele tiden, og der findes ikke noget bygget
  // index.html at sammenligne med. Så ville banneret stå der altid.
  if (import.meta.env && import.meta.env.DEV) return false;
  const mit = egetBundt();
  if (!mit || !mit.endsWith(".js")) return false;
  try {
    const derude = await bundtPaaServeren();
    // Intet svar betyder som regel, at nettet er væk et øjeblik. Det er ikke det
    // samme som en ny udgave, og må ikke standse planlægningen.
    if (!derude) return false;
    return derude !== mit;
  } catch {
    return false;
  }
}

// Kalder tilbage, første gang fanen er forældet, og holder så op med at spørge.
// Der tjekkes ved opstart, hvert kvarter, og hver gang fanen bliver den forreste igen
// — det sidste er det vigtigste: en fane, der har ligget bagest siden i morges, er
// netop den, der er forældet.
export function holdOejeMedNyVersion(naarForaeldet) {
  let stoppet = false;
  const tjek = async () => {
    if (stoppet) return;
    if (await erFanenForaeldet()) {
      stoppet = true;
      clearInterval(ur);
      document.removeEventListener("visibilitychange", vedSkift);
      naarForaeldet();
    }
  };
  const vedSkift = () => { if (document.visibilityState === "visible") tjek(); };
  const ur = setInterval(tjek, 15 * 60 * 1000);
  document.addEventListener("visibilitychange", vedSkift);
  tjek();
  return () => {
    stoppet = true;
    clearInterval(ur);
    document.removeEventListener("visibilitychange", vedSkift);
  };
}
