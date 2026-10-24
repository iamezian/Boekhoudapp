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
    auto: 'Auto & brandstof',
    sponsoring: 'Sponsoring & reclame',
    belastingen: 'Belastingen (bijv. motorrijtuigenbelasting)',
    verzekering: 'Verzekeringen',
    bank: 'Bankkosten',
    overig: 'Overig',
  };

  const woorden = (lijst) => new RegExp('(^|[^a-z])(' + lijst.join('|') + ')([^a-z]|$)', 'i');
  const VLUCHT = woorden(['klm', 'transavia', 'ryanair', 'easyjet', 'lufthansa', 'vueling', 'corendon', 'tui fly', 'wizz ?air',
    'british airways', 'air france', 'turkish airlines', 'emirates', 'boarding ?pass', 'instapkaart', 'vlucht', 'vluchtnummer',
    'flight', 'e-ticket', 'luchthaven', 'airport', 'airline', 'schiphol']);
  const VERVOER = woorden(['ns', 'nederlandse spoorwegen', 'ov-?chipkaart', 'ovpay', 'gvb', 'ret', 'htm', 'arriva', 'connexxion',
    'qbuzz', 'trein', 'train', 'taxi', 'uber', 'bolt', 'hotel', 'booking\\.com']);
  // Brandstof: in Nederland altijd 21% btw
  const BRANDSTOF = woorden(['tankstation', 'benzine', 'euro ?95', 'euro ?98', 'e10', 'diesel', 'lpg', 'adblue', 'brandstof', 'tanken',
    'shell', 'esso', 'bp', 'tinq', 'tango', 'total ?energies', 'texaco', 'avia', 'gulf', 'q8', 'argos', 'firezone', 'lukoil',
    'ultimate', 'v-power', 'pomp', 'liter', 'ltr', 'laadpaal', 'kwh', 'fastned', 'allego', 'ionity']);
  const AUTO = woorden(['parkeren', 'parking', 'q-park', 'parkmobile', 'yellowbrick', 'easypark', 'garage', 'apk', 'wasstraat',
    'autowas', 'banden', 'anwb', 'kenteken', 'onderhoud auto', 'leaseauto', 'lease']);
  const MRB = /motorrijtuigen\s*belasting|(^|[^a-z])mrb([^a-z]|$)/i;
  const VERZEKERING = woorden(['verzekering', 'verzekeringen', 'polis', 'premie', 'assurantie', 'insurance']);
  const BANKKOSTEN = woorden(['bankkosten', 'kosten betalingsverkeer', 'betaalpakket', 'pakketkosten', 'kosten zakelijk', 'rente', 'transactiekosten']);
  const SPONSOR = woorden(['sponsor[a-z]*', 'shirtsponsor[a-z]*', 'bordsponsor[a-z]*', 'reclame', 'advertentie']);
  const HORECA = woorden(['restaurant', 'café', 'cafe', 'lunchroom', 'lunch', 'diner', 'bistro', 'brasserie', 'eetcafé',
    'starbucks', 'bar', 'horeca', 'mcdonald\'?s', 'burger king', 'kfc', 'subway', 'pizzeria', 'grand ?café']);
  const TELEFOON = woorden(['kpn', 'vodafone', 'odido', 't-mobile', 'ziggo', 'simyo', 'lebara', 'tele2', 'youfone', 'delta fiber', 'telefoon', 'internet']);
  const SOFTWARE = woorden(['adobe', 'microsoft', 'google', 'apple', 'icloud', 'dropbox', 'notion', 'canva', 'github', 'openai',
    'anthropic', 'aws', 'hosting', 'transip', 'mijndomein', 'strato', 'abonnement', 'subscription', 'licentie', 'license']);
  const KANTOOR = woorden(['staples', 'office centre', 'kantoorartikelen', 'printer', 'inkt', 'papier', 'bureau', 'postnl']);
  const INVENTARIS = woorden(['laptop', 'macbook', 'iphone', 'ipad', 'monitor', 'computer', 'coolblue', 'mediamarkt']);
  const BUITENLANDSE_BTW = /(^|[^a-z])(mwst|ust\.|tva|iva|moms|mva)([^a-z]|$)/i;
  const BTW_WOORD = /(^|[^a-z])(b\.?\s?t\.?\s?w\.?|btvv|8tw|b7w|biw|bt\s?vv|vat|tax|mwst|tva|iva)([^a-z]|$)/i;
  const VERLEGD = /btw\s*verlegd|verlegd|reverse[- ]charge|vat\s*reverse/i;
  const TOTAAL = /(totaal|total|te betalen|amount due|amount paid|betaald|bedrag|grand total|totale prijs|pinnen|pin\b|paid|to pay)/i;
  const SUBTOTAAL = /(sub\s*-?\s*tota|excl|zonder btw|ex\.? btw|netto|net amount|before tax)/i;
  const DATUM_LABEL = /(factuurdatum|factuur datum|invoice date|datum|date|besteldatum|order date|boekingsdatum|booking date|transactiedatum|aankoopdatum|dagtekening|issued|uitgifte)/i;
  const DATUM_NIET = /(vervaldatum|verval|due|uiterlijk|geldig tot|valid until|expir|vertrek|departure|aankomst|arrival|geboorte|periode|tijdvak|t\/m)/i;

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

  // ---------- Soort kosten ----------
  // Bepaalt de categorie en of er btw op hoort te zitten. Ook gebruikt voor regels van bankafschriften.
  function categoriseer(tekst) {
    const t = String(tekst || '').toLowerCase();
    if (MRB.test(t)) return { categorie: 'belastingen', geenBtw: true,
      notitie: 'Motorrijtuigenbelasting: aftrekbaar als kosten als de auto zakelijk is (op de balans van je bedrijf). Er zit geen btw op.' };
    if (VLUCHT.test(t)) return { categorie: 'reizen', aftrekbaar: false, geenBtw: true,
      notitie: 'Vliegticket: zakelijk aftrekbaar als kosten, maar de btw is niet verrekenbaar (internationale vluchten hebben 0% btw).' };
    if (SPONSOR.test(t)) return { categorie: 'sponsoring',
      notitie: 'Sponsoring: aftrekbaar als kosten als je er reclame of naamsbekendheid voor terugkrijgt. Btw op de factuur is aftrekbaar.' };
    if (HORECA.test(t)) return { categorie: 'horeca', aftrekbaar: false,
      notitie: 'Eten en drinken in de horeca: btw is niet aftrekbaar. Voor de inkomstenbelasting telt 80% van de kosten.' };
    if (VERZEKERING.test(t)) return { categorie: 'verzekering', geenBtw: true,
      notitie: 'Verzekeringen: geen btw (wel assurantiebelasting, die hoort bij de kosten).' };
    if (BANKKOSTEN.test(t)) return { categorie: 'bank', geenBtw: true, notitie: 'Bankkosten: geen btw.' };
    if (BRANDSTOF.test(t)) return { categorie: 'auto', brandstof: true,
      notitie: 'Brandstof voor je zakelijke auto: btw is aftrekbaar. Let op: aan het eind van het jaar corrigeer je de btw voor privégebruik.' };
    if (AUTO.test(t)) return { categorie: 'auto' };
    if (VERVOER.test(t)) return { categorie: 'reizen' };
    if (TELEFOON.test(t)) return { categorie: 'telefoon' };
    if (INVENTARIS.test(t)) return { categorie: 'inventaris' };
    if (SOFTWARE.test(t)) return { categorie: 'software' };
    if (KANTOOR.test(t)) return { categorie: 'kantoor' };
    return { categorie: 'algemeen' };
  }

  // Een typisch woord per categorie, om de btw-regels van een map toe te passen
  const MAP_VOORBEELD = { auto: 'brandstof', sponsoring: 'sponsoring', horeca: 'restaurant', reizen: 'trein' };

  // Map in een ZIP-bestand als hint: "Inkomsten/factuur.pdf" is omzet, "Sponsoring/..." is sponsoring
  function hintUitPad(pad) {
    const delen = String(pad || '').toLowerCase().split('/').slice(0, -1).join('/');
    if (!delen) return null;
    if (/inkomst|omzet|verkoop|opbrengst|income|sales|verstuurd|uitgaande factu/.test(delen)) return { soort: 'inkomst' };
    if (/bank|afschrift|rekeningoverzicht/.test(delen)) return { soort: 'kost', bank: true };
    if (/sponsor/.test(delen)) return { soort: 'kost', categorie: 'sponsoring' };
    if (/tank|brandstof|benzine|diesel|auto/.test(delen)) return { soort: 'kost', categorie: 'auto' };
    if (/horeca|restaurant|lunch|eten/.test(delen)) return { soort: 'kost', categorie: 'horeca' };
    if (/reis|vlucht|ticket/.test(delen)) return { soort: 'kost', categorie: 'reizen' };
    if (/kost|uitgave|inkoop|bonnen|bon/.test(delen)) return { soort: 'kost' };
    return null;
  }

  // ---------- Hoofdfunctie ----------
  // opties: { vandaag: 'JJJJ-MM-DD', hint: { soort, categorie } }
  function lees(tekst, bestandsnaam, opties) {
    const vandaag = (opties && opties.vandaag) || null;
    const hint = (opties && opties.hint) || {};
    const ruw = String(tekst || '');
    const regels = ruw.split(/\r?\n/).map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const plat = regels.join(' \n ').toLowerCase();
    const notities = [];
    const r = {
      soort: hint.soort === 'inkomst' ? 'inkomst' : 'kost',
      datum: kiesDatum(regels, vandaag),
      bedrag: null,
      inclBtw: true,
      tarief: 0,
      btwBedrag: null,
      btwAftrekbaar: true,
      categorie: null,
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

    // Btw: regels met het woord btw (ook zoals OCR het soms leest) of met 9% / 21% erin
    const btwRegels = [];
    regels.forEach((regel, i) => {
      const pct = percentagesIn(regel);
      if (!BTW_WOORD.test(regel) && !pct.some((p) => p === 21 || p === 9)) return;
      let bedragen = vindBedragen(regel);
      if (!bedragen.length && regels[i + 1]) bedragen = vindBedragen(regels[i + 1]);
      btwRegels.push({ regel, bedragen: bedragen.map((b) => b.centen).filter((c) => c > 0), pct });
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

    // Soort kosten (map in de ZIP gaat voor)
    let cat = { categorie: null };
    if (r.soort === 'kost') {
      cat = categoriseer(plat);
      if (hint.categorie && hint.categorie !== cat.categorie) {
        // De map bepaalt de soort kosten, met de btw-regels die daarbij horen
        cat = Object.assign(categoriseer(MAP_VOORBEELD[hint.categorie] || ''), { categorie: hint.categorie });
      }
      r.categorie = cat.categorie;
      if (cat.aftrekbaar === false) r.btwAftrekbaar = false;
    }

    if (verlegd) {
      r.tarief = 0;
      notities.push(r.soort === 'inkomst'
        ? 'Btw verlegd: je rekent geen btw, de klant geeft die zelf aan.'
        : 'Btw verlegd: je geeft de btw zelf aan en trekt die tegelijk af. Per saldo € 0.');
    } else if (r.tarief === 0 && r.btwBedrag == null && r.bedrag) {
      if (cat.brandstof) {
        // Brandstof in Nederland: altijd 21% btw, ook als die niet (leesbaar) op de bon staat
        r.tarief = 21;
        notities.push('Tankbon: btw niet leesbaar op de bon, gerekend met 21% (brandstof in Nederland heeft altijd 21% btw).');
      } else if (!cat.geenBtw) {
        notities.push(r.soort === 'inkomst'
          ? 'Geen btw op de factuur gevonden: gerekend zonder btw. Controleer de factuur.'
          : btwGenoemd
            ? 'Btw genoemd maar niet als bedrag gevonden: gerekend zonder btw. Controleer de bon.'
            : 'Geen btw op de bon gevonden: telt wel als kosten, maar zonder btw-teruggave.');
      }
    }
    if (cat.notitie) notities.push(cat.notitie);

    if (r.soort === 'kost' && r.btwAftrekbaar && BUITENLANDSE_BTW.test(plat) && !/(^|[^a-z])btw([^a-z]|$)/i.test(plat)) {
      r.btwAftrekbaar = false;
      notities.push('Buitenlandse btw: niet aftrekbaar in je Nederlandse aangifte. Wel kosten.');
    }

    if (r.categorie === 'inventaris' && r.bedrag) {
      const excl = r.btwBedrag != null ? r.bedrag - r.btwBedrag : r.bedrag;
      if (excl >= 45000) notities.push('Boven € 450 excl. btw: voor de inkomstenbelasting moet je dit waarschijnlijk afschrijven over een paar jaar.');
    }

    if (!r.bedrag) { r.zeker = false; notities.unshift('Bedrag niet gevonden: vul het zelf in.'); }
    if (!r.datum) { r.zeker = false; notities.unshift('Datum niet gevonden: controleer de datum.'); }

    r.omschrijving = r.soort === 'inkomst' ? omschrijvingFactuur(regels, bestandsnaam) : kiesOmschrijving(regels, bestandsnaam);
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

  // Eigen verkoopfactuur: "Factuur 2026-014 – Klantnaam"
  function omschrijvingFactuur(regels, bestandsnaam) {
    const plat = regels.join('\n');
    const nr = plat.match(/(?:factuur|invoice)\s*(?:nummer|nr\.?|no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/.]{1,20})/i);
    let klant = null;
    for (let i = 0; i < regels.length && !klant; i++) {
      const m = regels[i].match(/^(?:factuur aan|aan|klant|debiteur|t\.?a\.?v\.?|bill to|to)\s*:?\s*(.*)$/i);
      if (m) klant = (m[1] && m[1].length > 2 ? m[1] : regels[i + 1] || '').trim();
    }
    const delen = [nr ? 'Factuur ' + nr[1] : null, klant].filter(Boolean);
    return delen.length ? delen.join(' – ').slice(0, 60) : kiesOmschrijving(regels, bestandsnaam);
  }

  const api = { lees, vindDatums, vindBedragen, categoriseer, hintUitPad, CATEGORIEEN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BonLezer = api;
})(this);
