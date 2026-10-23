// Rekenlogica voor btw. Alle bedragen zijn in centen (gehele getallen) om afrondingsfouten te voorkomen.
(function (root) {
  'use strict';

  const TARIEVEN = [21, 9, 0];

  // Zet een ingevoerd bedrag ("12,50", "1.234,56", "€ 12.5") om naar centen. Geeft null bij ongeldige invoer.
  function parseBedrag(tekst) {
    if (tekst == null) return null;
    let s = String(tekst).replace(/[€\s]/g, '');
    if (s === '') return null;
    const heeftKomma = s.includes(',');
    const heeftPunt = s.includes('.');
    if (heeftKomma && heeftPunt) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (heeftKomma) {
      s = s.replace(',', '.');
    } else if (heeftPunt && /^\d{1,3}(\.\d{3})+$/.test(s)) {
      // "12.500" of "1.234.567": punt als duizendtalscheiding
      s = s.replace(/\./g, '');
    }
    if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
    const [heel, dec = ''] = s.split('.');
    return parseInt(heel, 10) * 100 + parseInt((dec + '00').slice(0, 2), 10);
  }

  // Splitst een boeking in bedrag exclusief btw en het btw-bedrag.
  function splits(boeking) {
    const bedrag = boeking.bedrag;
    const tarief = boeking.tarief;
    if (!tarief) return { excl: bedrag, btw: 0, incl: bedrag };
    if (boeking.inclBtw) {
      const excl = Math.round((bedrag * 100) / (100 + tarief));
      return { excl, btw: bedrag - excl, incl: bedrag };
    }
    const btw = Math.round((bedrag * tarief) / 100);
    return { excl: bedrag, btw, incl: bedrag + btw };
  }

  function kwartaalVan(datum) {
    const jaar = parseInt(datum.slice(0, 4), 10);
    const maand = parseInt(datum.slice(5, 7), 10);
    return { jaar, kwartaal: Math.ceil(maand / 3) };
  }

  function inKwartaal(boeking, jaar, kwartaal) {
    const k = kwartaalVan(boeking.datum);
    return k.jaar === jaar && k.kwartaal === kwartaal;
  }

  // Uiterste datum voor aangifte en betaling: laatste dag van de maand na het kwartaal.
  function deadline(jaar, kwartaal) {
    return new Date(jaar, kwartaal * 3 + 1, 0);
  }

  function leegPerTarief() {
    const o = {};
    TARIEVEN.forEach((t) => (o[t] = { excl: 0, btw: 0 }));
    return o;
  }

  function overzicht(boekingen) {
    const r = {
      inkomsten: { excl: 0, btw: 0, incl: 0, perTarief: leegPerTarief(), aantal: 0 },
      kosten: { excl: 0, btw: 0, incl: 0, perTarief: leegPerTarief(), aantal: 0 },
    };
    boekingen.forEach((b) => {
      const s = splits(b);
      const doel = b.soort === 'inkomst' ? r.inkomsten : r.kosten;
      doel.excl += s.excl;
      doel.btw += s.btw;
      doel.incl += s.incl;
      doel.aantal += 1;
      if (!doel.perTarief[b.tarief]) doel.perTarief[b.tarief] = { excl: 0, btw: 0 };
      doel.perTarief[b.tarief].excl += s.excl;
      doel.perTarief[b.tarief].btw += s.btw;
    });
    // Positief = betalen aan de Belastingdienst, negatief = terugkrijgen
    r.saldoBtw = r.inkomsten.btw - r.kosten.btw;
    r.winst = r.inkomsten.excl - r.kosten.excl;
    return r;
  }

  function kwartaalOverzicht(boekingen, jaar, kwartaal) {
    return overzicht(boekingen.filter((b) => inKwartaal(b, jaar, kwartaal)));
  }

  // Bedragen voor de aangifte in hele euro's, afgerond in je voordeel (mag van de Belastingdienst):
  // omzet en btw naar beneden, voorbelasting naar boven.
  function aangifte(o) {
    const omlaag = (c) => Math.floor(c / 100);
    const omhoog = (c) => Math.ceil(c / 100);
    const r = {
      r1a: { omzet: omlaag(o.inkomsten.perTarief[21].excl), btw: omlaag(o.inkomsten.perTarief[21].btw) },
      r1b: { omzet: omlaag(o.inkomsten.perTarief[9].excl), btw: omlaag(o.inkomsten.perTarief[9].btw) },
      r1e: { omzet: omlaag(o.inkomsten.perTarief[0].excl) },
      r5b: omhoog(o.kosten.btw),
    };
    r.r5a = r.r1a.btw + r.r1b.btw;
    r.totaal = r.r5a - r.r5b;
    return r;
  }

  const api = { TARIEVEN, parseBedrag, splits, kwartaalVan, inKwartaal, deadline, overzicht, kwartaalOverzicht, aangifte };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BTW = api;
})(this);
