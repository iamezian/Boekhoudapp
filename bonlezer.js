// Haalt uit de tekst van een bon of factuur: datum, totaalbedrag, btw, soort kosten en aandachtspunten.
// Alle bedragen in centen. Werkt zowel in de browser (window.BonLezer) als in Node (tests).
(function (root) {
  'use strict';

  const MAANDEN = {
    jan: 1, januari: 1, january: 1,
    feb: 2, febr: 2, februari: 2, february: 2,
    mrt: 3, maa: 3, maart: 3, mar: 3, march: 3,
    apr: 4, april: 4,
    mei: 5, may: 5,
    jun: 6, juni: 6, june: 6,
    jul: 7, juli: 7, july: 7,
    aug: 8, augustus: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    okt: 10, oktober: 10, oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const MAAND_RE = Object.keys(MAANDEN).sort((a, b) => b.length - a.length).join('|');

  const CATEGORIEEN = {
    algemeen: 'Algemeen',
    reizen: 'Reizen & vervoer',
    horeca: 'Eten & drinken (zakelijk)',
    telefoon: 'Telefoon & internet',
    software: 'Software & abonnementen',
    kantoor: 'Kantoor & materiaal',
    inventaris: 'Apparatuur (laptop, telefoon)',
    overig: 'Overig',
  };

  const woorden = (lijst) => new RegExp('(^|[^a-z])(' + lijst.join('|') + ')([^a-z]|$)', 'i');
  const VLUCHT = woorden(['klm', 'transavia', 'ryanair', 'easyjet', 'lufthansa', 'vueling', 'corendon', 'tui fly', 'wizz ?air',
    'british airways', 'air france', 'turkish airlines', 'emirates', 'boarding ?pass', 'instapkaart', 'vlucht', 'vluchtnummer',
    'flight', 'e-ticket', 'luchthaven', 'airport', 'airline', 'schiphol']);
  const VERVOER = woorden(['ns', 'nederlandse spoorwegen', 'ov-?chipkaart', 'ovpay', 'gvb', 'ret', 'htm', 'arriva', 'connexxion',
    'qbuzz', 'trein', 'train', 'taxi', 'uber', 'bolt', 'parkeren', 'parking', 'q-park', 'parkmobile', 'yellowbrick',
    'tankstation', 'benzine', 'euro ?95', 'diesel', 'shell', 'esso', 'bp', 'tinq', 'tango', 'totalenergies', 'texaco', 'laadpaal']);
  const HORECA = woorden(['restaurant', 'café', 'cafe', 'lunchroom', 'lunch', 'diner', 'bistro', 'brasserie', 'eetcafé',
    'starbucks', 'bar', 'horeca', 'mcdonald\'?s', 'burger king', 'kfc', 'subway', 'pizzeria', 'grand ?café']);
  const TELEFOON = woorden(['kpn', 'vodafone', 'odido', 't-mobile', 'ziggo', 'simyo', 'lebara', 'tele2', 'youfone', 'delta fiber', 'telefoon', 'internet']);
  const SOFTWARE = woorden(['adobe', 'microsoft', 'google', 'apple', 'icloud', 'dropbox', 'notion', 'canva', 'github', 'openai',
    'anthropic', 'aws', 'hosting', 'transip', 'mijndomein', 'strato', 'abonnement', 'subscription', 'licentie', 'license']);
  const KANTOOR = woorden(['staples', 'office centre', 'kantoorartikelen', 'printer', 'inkt', 'papier', 'bureau', 'postnl']);
  const INVENTARIS = woorden(['laptop', 'macbook', 'iphone', 'ipad', 'monitor', 'computer', 'coolblue', 'mediamarkt']);
  const BUITENLANDSE_BTW = /(^|[^a-z])(mwst|ust\.|tva|iva|moms|mva)([^a-z]|$)/i;
  const BTW_WOORD = /(^|[^a-z])(btw|b\.t\.w|vat|tax|mwst|tva|iva)([^a-z]|$)/i;
  const VERLEGD = /btw\s*verlegd|verlegd|reverse[- ]charge|vat\s*reverse/i;
  const TOTAAL = /(totaal|total|te betalen|amount due|amount paid|betaald|bedrag|grand total|totale prijs|pinnen|pin\b|paid|to pay)/i;
  const SUBTOTAAL = /(sub\s*-?\s*tota|excl|zonder btw|ex\.? btw|netto|net amount|before tax)/i;
  const DATUM_LABEL = /(factuurdatum|factuur datum|invoice date|datum|date|besteldatum|order date|boekingsdatum|booking date|transactiedatum|aankoopdatum|issued|uitgifte)/i;
  const DATUM_NIET = /(vervaldatum|verval|due|uiterlijk|geldig tot|valid until|expir|vertrek|departure|aankomst|arrival|geboorte|periode tot)/i;

  // ---------- Datums ----------
  function geldigeDatum(j, m, d) {
    if (j < 100) j += 2000;
    if (j < 2000 || j > 2100 || m < 1 || m > 12 || d < 1) return null;
    const dagen = new Date(j, m, 0).getDate();
    if (d > dagen) return null;
    return `${j}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Vindt alle datums in een stuk tekst, numeriek (12-03-2026, 2026-03-12, 12/3/26) en met maandnaam
  // (12 maart 2026, 12 mrt. '26, March 12, 2026, 12th Mar 2026). Geeft [{datum, index, lengte}].
  function vindDatums(tekst) {
    const res = [];
    const voegToe = (datum, m) => { if (datum) res.push({ datum, index: m.index, lengte: m[0].length }); };
    let m;

    const iso = /(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g;
    while ((m = iso.exec(tekst))) voegToe(geldigeDatum(+m[1], +m[2], +m[3]), m);

    const num = /(?<![\d.,])(\d{1,2})\s?[-/.]\s?(\d{1,2})\s?[-/.]\s?(\d{4}|\d{2})(?![\d,]|\.\d)/g;
    while ((m = num.exec(tekst))) {
      let d = +m[1], mnd = +m[2];
      // Nederlandse volgorde dag-maand-jaar; alleen omdraaien als dat de enige geldige lezing is
      if (mnd > 12 && d <= 12) [d, mnd] = [mnd, d];
      voegToe(geldigeDatum(+m[3], mnd, d), m);
    }

    const dagMaand = new RegExp(`(?<!\\d)(\\d{1,2})(?:e|ste|de|st|nd|rd|th)?\\.?\\s*(?:-|\\s)\\s*(${MAAND_RE})[a-z]*\\.?\\s*[-,]?\\s*('?\\d{4}|'\\d{2}|\\d{2}(?!\\d))`, 'gi');
    while ((m = dagMaand.exec(tekst))) voegToe(geldigeDatum(+m[3].replace("'", ''), MAANDEN[m[2].toLowerCase()], +m[1]), m);

    const maandDag = new RegExp(`(?<![a-z])(${MAAND_RE})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'gi');
    while ((m = maandDag.exec(tekst))) voegToe(geldigeDatum(+m[3], MAANDEN[m[1].toLowerCase()], +m[2]), m);

    return res.sort((a, b) => a.index - b.index);
  }

  // Kiest de meest waarschijnlijke factuur-/aankoopdatum
  function kiesDatum(regels, vandaag) {
    const kandidaten = [];
    regels.forEach((regel, i) => {
      vindDatums(regel).forEach((d) => {
        let score = 0;
        const context = regel + ' ' + (regels[i - 1] || '');
        if (DATUM_LABEL.test(regel)) score += 3;
        else if (DATUM_LABEL.test(regels[i - 1] || '')) score += 2;
        if (DATUM_NIET.test(context)) score -= 4;
        if (vandaag && d.datum > vandaag) score -= 2;
        kandidaten.push({ datum: d.datum, score, volgorde: kandidaten.length });
      });
    });
    if (!kandidaten.length) return null;
    kandidaten.sort((a, b) => b.score - a.score || a.volgorde - b.volgorde);
    return kandidaten[0].datum;
  }

  // ---------- Bedragen ----------
  function zonderDatums(regel) {
    let uit = regel;
    vindDatums(regel).forEach((d) => { uit = uit.slice(0, d.index) + ' '.repeat(d.lengte) + uit.slice(d.index + d.lengte); });
    return uit.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' '); // tijden
  }

  function vindBedragen(regel) {
    const tekst = zonderDatums(regel);
    const res = [];
    const re = /(\d{1,3}(?:[.,']\d{3})+|\d+)\s?([.,])\s?(\d{2}|-{1,2})(?!\d)/g;
    let m;
    while ((m = re.exec(tekst))) {
      const voor = tekst[m.index - 1];
      if (voor && /[\d.,]/.test(voor)) continue;
      const na = tekst.slice(m.index + m[0].length, m.index + m[0].length + 3);
      if (/^\s*%/.test(na)) continue;
      const heel = parseInt(m[1].replace(/[.,']/g, ''), 10);
      const cent = /^-/.test(m[3]) ? 0 : parseInt(m[3], 10);
      // "1.234" zonder decimalen is hier al uitgesloten; "12,-" telt als hele euro's
      const negatief = /-\s*$/.test(tekst.slice(Math.max(0, m.index - 2), m.index));
      res.push({ centen: (heel * 100 + cent) * (negatief ? -1 : 1), index: m.index });
    }
    return res;
  }

  function percentagesIn(regel) {
    const res = [];
    const re = /(\d{1,2})(?:[.,]0{1,2})?\s?%/g;
    let m;
    while ((m = re.exec(regel))) res.push(+m[1]);
    return res;
  }

  function dichtBij(a, b) {
    return Math.abs(a - b) <= Math.max(2, Math.abs(b) * 0.005);
  }

  // ---------- Hoofdfunctie ----------
  function lees(tekst, bestandsnaam, opties) {
    const vandaag = (opties && opties.vandaag) || null;
    const ruw = String(tekst || '');
    const regels = ruw.split(/\r?\n/).map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const plat = regels.join(' \n ').toLowerCase();
    const notities = [];
    const r = {
      soort: 'kost',
      datum: kiesDatum(regels, vandaag),
      bedrag: null,
      inclBtw: true,
      tarief: 0,
      btwBedrag: null,
      btwAftrekbaar: true,
      categorie: 'algemeen',
      omschrijving: '',
      notities,
      zeker: true,
    };

    // Totaalbedrag
    const totalen = [];
    regels.forEach((regel, i) => {
      if (!TOTAAL.test(regel) || BTW_WOORD.test(regel) && !/incl/i.test(regel)) return;
      let bedragen = vindBedragen(regel);
      if (!bedragen.length && regels[i + 1]) bedragen = vindBedragen(regels[i + 1]);
      const sub = SUBTOTAAL.test(regel) && !/incl/i.test(regel);
      bedragen.forEach((b) => b.centen > 0 && totalen.push({ centen: b.centen, sub }));
    });
    const alle = regels.flatMap(vindBedragen).filter((b) => b.centen > 0);
    const echteTotalen = totalen.filter((t) => !t.sub);
    if (echteTotalen.length) r.bedrag = Math.max(...echteTotalen.map((t) => t.centen));
    else if (alle.length) {
      r.bedrag = Math.max(...alle.map((b) => b.centen));
      r.zeker = false;
    }

    // Btw
    const btwRegels = [];
    regels.forEach((regel, i) => {
      if (!BTW_WOORD.test(regel) && !/^\s*(hoog|laag|tarief)?\s*\d{1,2}\s?%/i.test(regel)) return;
      let bedragen = vindBedragen(regel);
      if (!bedragen.length && regels[i + 1]) bedragen = vindBedragen(regels[i + 1]);
      btwRegels.push({ regel, bedragen: bedragen.map((b) => b.centen).filter((c) => c > 0), pct: percentagesIn(regel) });
    });
    const btwGenoemd = BTW_WOORD.test(plat);
    const verlegd = VERLEGD.test(plat);

    if (r.bedrag && !verlegd) {
      const kandidaten = btwRegels.flatMap((b) => b.bedragen).filter((c) => c < r.bedrag);
      for (const tarief of [21, 9]) {
        const verwacht = Math.round((r.bedrag * tarief) / (100 + tarief));
        const hit = kandidaten.find((c) => dichtBij(c, verwacht));
        if (hit != null) { r.tarief = tarief; r.btwBedrag = hit; break; }
      }
      // Gemengde tarieven (bijv. supermarkt 9% en 21%): tel de btw per tarief op
      if (r.btwBedrag == null) {
        const perTarief = {};
        btwRegels.forEach((b) => {
          const pct = b.pct.find((p) => p === 21 || p === 9);
          if (!pct || !b.bedragen.length) return;
          const bedr = b.bedragen.filter((c) => c < r.bedrag);
          if (!bedr.length) return;
          // Op een regel "21% 10,00 2,10" is de btw het bedrag dat past bij grondslag × tarief
          let btw = Math.min(...bedr);
          bedr.forEach((g) => bedr.forEach((c) => { if (dichtBij(c, Math.round(g * pct / 100))) btw = c; }));
          perTarief[pct] = (perTarief[pct] || 0) + btw;
        });
        const som = (perTarief[21] || 0) + (perTarief[9] || 0);
        if (som > 0 && som < r.bedrag * 0.18) {
          r.tarief = (perTarief[21] || 0) >= (perTarief[9] || 0) ? 21 : 9;
          r.btwBedrag = som;
          if (perTarief[21] && perTarief[9]) notities.push('Bon met 9% én 21% btw: btw-bedragen opgeteld.');
        }
      }
      // Alleen een percentage genoemd, geen bruikbaar bedrag: reken het uit
      if (r.btwBedrag == null) {
        const pcts = btwRegels.flatMap((b) => b.pct);
        const t = pcts.includes(21) ? 21 : pcts.includes(9) ? 9 : null;
        if (t) {
          r.tarief = t;
          r.zeker = false;
          notities.push(`Btw-bedrag niet gevonden; uitgerekend met ${t}%.`);
        }
      }
    }

    if (verlegd) {
      r.tarief = 0;
      notities.push('Btw verlegd: je geeft de btw zelf aan en trekt die tegelijk af. Per saldo € 0.');
    } else if (r.tarief === 0 && r.btwBedrag == null && r.bedrag) {
      notities.push(btwGenoemd
        ? 'Btw genoemd maar niet als bedrag gevonden: gerekend zonder btw. Controleer de bon.'
        : 'Geen btw op de bon gevonden: telt wel als kosten, maar zonder btw-teruggave.');
    }

    // Soort kosten en bijzondere regels
    if (VLUCHT.test(plat)) {
      r.categorie = 'reizen';
      r.btwAftrekbaar = false;
      if (r.btwBedrag == null) notities.splice(0, notities.length, ...notities.filter((n) => !/^Geen btw op de bon/.test(n)));
      notities.push('Vliegticket: zakelijk aftrekbaar als kosten, maar de btw is niet verrekenbaar (internationale vluchten hebben 0% btw).');
    } else if (HORECA.test(plat)) {
      r.categorie = 'horeca';
      r.btwAftrekbaar = false;
      notities.push('Eten en drinken in de horeca: btw is niet aftrekbaar. Voor de inkomstenbelasting telt 80% van de kosten.');
    } else if (VERVOER.test(plat)) r.categorie = 'reizen';
    else if (TELEFOON.test(plat)) r.categorie = 'telefoon';
    else if (INVENTARIS.test(plat)) r.categorie = 'inventaris';
    else if (SOFTWARE.test(plat)) r.categorie = 'software';
    else if (KANTOOR.test(plat)) r.categorie = 'kantoor';

    if (r.btwAftrekbaar && BUITENLANDSE_BTW.test(plat) && !/(^|[^a-z])btw([^a-z]|$)/i.test(plat)) {
      r.btwAftrekbaar = false;
      notities.push('Buitenlandse btw: niet aftrekbaar in je Nederlandse aangifte. Wel kosten.');
    }

    if (r.categorie === 'inventaris' && r.bedrag) {
      const excl = r.btwBedrag != null ? r.bedrag - r.btwBedrag : r.bedrag;
      if (excl >= 45000) notities.push('Boven € 450 excl. btw: voor de inkomstenbelasting moet je dit waarschijnlijk afschrijven over een paar jaar.');
    }

    if (!r.bedrag) { r.zeker = false; notities.unshift('Bedrag niet gevonden: vul het zelf in.'); }
    if (!r.datum) { r.zeker = false; notities.unshift('Datum niet gevonden: controleer de datum.'); }

    r.omschrijving = kiesOmschrijving(regels, bestandsnaam);
    return r;
  }

  function kiesOmschrijving(regels, bestandsnaam) {
    // Meestal staat de naam van de winkel of het bedrijf bovenaan
    for (const regel of regels.slice(0, 8)) {
      const schoon = regel.replace(/[^\p{L}\d&'. -]/gu, '').trim();
      const letters = (schoon.match(/\p{L}/gu) || []).length;
      if (letters >= 3 && letters / schoon.length > 0.6 && !/^(factuur|invoice|bon|kassabon|receipt|datum|date|btw|pagina)\b/i.test(schoon)) {
        return schoon.slice(0, 60);
      }
    }
    if (bestandsnaam) return bestandsnaam.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 60);
    return '';
  }

  const api = { lees, vindDatums, vindBedragen, CATEGORIEEN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BonLezer = api;
})(this);
