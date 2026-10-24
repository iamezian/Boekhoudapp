// Schatting inkomstenbelasting (box 1) en inkomensafhankelijke bijdrage Zvw voor een ondernemer (eenmanszaak / zzp),
// voor mensen onder de AOW-leeftijd. Bedragen in centen, parameters in euro's.
(function (root) {
  'use strict';

  const PARAMETERS = {
    2025: {
      schijven: [{ tot: 38441, pct: 35.82 }, { tot: 76817, pct: 37.48 }, { tot: Infinity, pct: 49.5 }],
      ahk: { max: 3068, afbouwVanaf: 28406, afbouwPct: 6.337 },
      ak: [
        { tot: 12169, vast: 0, pct: 8.053, vanaf: 0 },
        { tot: 26288, vast: 980, pct: 30.03, vanaf: 12169 },
        { tot: 43071, vast: 5220, pct: 2.258, vanaf: 26288 },
        { tot: 124934, vast: 5599, pct: -6.51, vanaf: 43071 },
      ],
      zelfstandigenaftrek: 2470,
      startersaftrek: 2123,
      mkbPct: 12.7,
      zvw: { pct: 5.26, max: 75864 },
    },
    2026: {
      schijven: [{ tot: 38883, pct: 35.75 }, { tot: 78426, pct: 37.56 }, { tot: Infinity, pct: 49.5 }],
      ahk: { max: 3115, afbouwVanaf: 29736, afbouwPct: 6.398 },
      ak: [
        { tot: 11965, vast: 0, pct: 8.324, vanaf: 0 },
        { tot: 25845, vast: 996, pct: 31.009, vanaf: 11965 },
        { tot: 45592, vast: 5300, pct: 1.95, vanaf: 25845 },
        { tot: 132920, vast: 5685, pct: -6.51, vanaf: 45592 },
      ],
      zelfstandigenaftrek: 1200,
      startersaftrek: 2123,
      mkbPct: 12.7,
      zvw: { pct: 4.85, max: 79409 },
    },
  };

  function parametersVoor(jaar) {
    if (PARAMETERS[jaar]) return { jaar, p: PARAMETERS[jaar], benadering: false };
    const jaren = Object.keys(PARAMETERS).map(Number);
    const dichtst = jaar > Math.max(...jaren) ? Math.max(...jaren) : Math.min(...jaren);
    return { jaar: dichtst, p: PARAMETERS[dichtst], benadering: true };
  }

  const E = 100; // centen per euro

  function belastingOverSchijven(inkomen, schijven) {
    let rest = Math.max(0, inkomen), onder = 0, totaal = 0;
    for (const s of schijven) {
      const grens = s.tot === Infinity ? Infinity : s.tot * E;
      const deel = Math.min(rest, grens - onder);
      totaal += (deel * s.pct) / 100;
      rest -= deel;
      onder = grens;
      if (rest <= 0) break;
    }
    return Math.round(totaal);
  }

  function algemeneHeffingskorting(inkomen, ahk) {
    const max = ahk.max * E;
    if (inkomen <= ahk.afbouwVanaf * E) return max;
    return Math.max(0, Math.round(max - ((inkomen - ahk.afbouwVanaf * E) * ahk.afbouwPct) / 100));
  }

  function arbeidskorting(arbeidsinkomen, ak) {
    if (arbeidsinkomen <= 0) return 0;
    for (const t of ak) {
      if (arbeidsinkomen <= t.tot * E) {
        return Math.max(0, Math.round(t.vast * E + ((arbeidsinkomen - t.vanaf * E) * t.pct) / 100));
      }
    }
    return 0;
  }

  // Recht op startersaftrek: in de 5 jaar ervoor hooguit 2 keer zelfstandigenaftrek gehad en minstens 1 jaar geen ondernemer.
  // Uitgaande van zelfstandigenaftrek in elk jaar sinds de start komt dat neer op de eerste 3 jaar van je bedrijf.
  // eerderZonderAftrek: aantal jaren sinds de start waarin je níet aan het urencriterium voldeed.
  function starterStatus(jaar, startjaar, eerderZonderAftrek) {
    if (!startjaar || startjaar > jaar) return { recht: false, jaarNummer: null, keer: 0 };
    const jaarNummer = jaar - startjaar + 1;
    const eerderGebruikt = Math.max(0, jaarNummer - 1 - (eerderZonderAftrek || 0));
    const recht = jaarNummer <= 5 && eerderGebruikt <= 2;
    return { recht, jaarNummer, keer: recht ? eerderGebruikt + 1 : 0 };
  }

  // invoer: { jaar, winst (centen, omzet − kosten excl. btw), horecaKosten (centen), urencriterium, starter,
  //          loon (centen, ander inkomen uit loondienst), ingehoudenLoonheffing (centen) }
  function bereken(invoer) {
    const { jaar, p, benadering } = parametersVoor(invoer.jaar);
    const loon = Math.max(0, invoer.loon || 0);

    // Eten en drinken in de horeca: 20% telt niet mee als kosten (80%-regeling)
    const nietAftrekbaarHoreca = Math.round((invoer.horecaKosten || 0) * 0.2);
    const fiscaleWinst = invoer.winst + nietAftrekbaarHoreca;

    let zelfstandigenaftrek = 0, startersaftrek = 0;
    if (invoer.urencriterium && fiscaleWinst > 0) {
      zelfstandigenaftrek = Math.min(fiscaleWinst, p.zelfstandigenaftrek * E);
      if (invoer.starter) startersaftrek = Math.min(fiscaleWinst - zelfstandigenaftrek, p.startersaftrek * E);
    }
    const ondernemersaftrek = zelfstandigenaftrek + startersaftrek;
    const naOndernemersaftrek = fiscaleWinst - ondernemersaftrek;
    const mkb = Math.round((naOndernemersaftrek * p.mkbPct) / 100);
    const belastbareWinst = naOndernemersaftrek - mkb;

    const belastbaarInkomen = Math.max(0, loon + belastbareWinst);
    const belastingVoorKorting = belastingOverSchijven(belastbaarInkomen, p.schijven);

    // Aftrekbeperking: ondernemersaftrek en mkb-winstvrijstelling leveren hooguit het tarief van schijf 2 op
    const aftrek = Math.max(0, ondernemersaftrek + mkb);
    const grens2 = p.schijven[1].tot * E;
    const aftrekInTopschijf = Math.min(aftrek, Math.max(0, belastbaarInkomen + aftrek - grens2));
    const aftrekbeperking = Math.round((aftrekInTopschijf * (p.schijven[2].pct - p.schijven[1].pct)) / 100);

    const belasting = belastingVoorKorting + aftrekbeperking;
    const ahk = algemeneHeffingskorting(belastbaarInkomen, p.ahk);
    const ak = arbeidskorting(loon + Math.max(0, belastbareWinst), p.ak);
    const kortingen = Math.min(belasting, ahk + ak);
    const inkomstenbelasting = belasting - kortingen;
    const ingehouden = Math.max(0, invoer.ingehoudenLoonheffing || 0);
    const nogTeBetalen = inkomstenbelasting - ingehouden;

    // Zvw over de belastbare winst; het maximum geldt voor loon en winst samen
    const zvwGrondslag = Math.max(0, Math.min(belastbareWinst, p.zvw.max * E - loon));
    const zvw = Math.round((zvwGrondslag * p.zvw.pct) / 100);

    return {
      jaar, benadering, parameters: p,
      winst: invoer.winst, nietAftrekbaarHoreca, fiscaleWinst,
      zelfstandigenaftrek, startersaftrek, mkb, belastbareWinst,
      loon, belastbaarInkomen, belastingVoorKorting, aftrekbeperking,
      ahk: Math.min(ahk, kortingen), ak: Math.max(0, kortingen - Math.min(ahk, kortingen)),
      inkomstenbelasting, ingehouden, nogTeBetalen,
      zvwGrondslag, zvw,
      totaal: nogTeBetalen + zvw,
    };
  }

  const api = { bereken, starterStatus, PARAMETERS, parametersVoor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IB = api;
})(this);
