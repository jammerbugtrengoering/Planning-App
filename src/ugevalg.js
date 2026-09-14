// Hvilke uger vises i «Ikke tildelt»?
//
// Listen kan vise den uge, man står i, ugerne efter, ugerne før, eller det hele.
// «Før denne uge» er den, oprydningen sker fra: en opgave, ingen nåede at tage,
// bliver liggende, og den falder ikke i øjnene, når man kun kigger på den uge,
// man er i gang med.
//
// Alt måles mod den VISTE uge og ikke mod dagens dato. «Denne uge» har altid
// betydet den uge, man står i, og bladrer man frem til uge 40, ville det være
// underligt, om «før» så stadig talte fra i dag.
//
// Ændrer du noget her, så ret ugevalg.test.mjs i samme ombæring.

// År og uge lagt sammen til ét tal, så to uger kan sammenlignes direkte.
//
// Året SKAL med. Uge 2 i 2027 ligger efter uge 37 i 2026, og uden året ville den
// lande under «før denne uge» hver gang planlæggeren stod i efteråret — en fejl,
// der kun ville vise sig omkring nytår, og som ingen ville lede efter dér.
//
// Det tæller ikke galt ved årsskiftet: `year` på en opgave er ISO-året, altså det
// år, ugenummeret hører til, og ikke det år, datoen tilfældigvis ligger i.
export const ugeNoegle = (aar, uge) => aar * 100 + uge;

export function filtrerUgevalg(opgaver, valg, visesAar, visesUge) {
  if (valg === "all") return opgaver;
  const vist = ugeNoegle(visesAar, visesUge);
  return (opgaver || []).filter((t) => {
    const n = ugeNoegle(t.year, t.week);
    if (valg === "efter") return n > vist;
    if (valg === "foer") return n < vist;
    return n === vist;
  });
}
