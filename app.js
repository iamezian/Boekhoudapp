(function () {
  'use strict';

  const OPSLAG_SLEUTEL = 'boekhouding.v1';
  const FOUTEN_SLEUTEL = 'boekhouding.fouten';
  const $ = (id) => document.getElementById(id);

  // ---------- Foutmeldingen ----------
  // Onverwachte fouten worden onthouden (laatste 20), zodat je ze via Meer kunt delen. De app werkt daarna gewoon verder.
  function leesFouten() {
    try { return JSON.parse(localStorage.getItem(FOUTEN_SLEUTEL)) || []; } catch (e) { return []; }
  }
  function logFout(bericht) {
    const fouten = leesFouten();
    let scherm = '';
    try { scherm = ui.view; } catch (e) { /* tijdens het opstarten */ }
    fouten.push({ tijd: new Date().toISOString(), bericht: String(bericht).slice(0, 500), scherm });
    try { localStorage.setItem(FOUTEN_SLEUTEL, JSON.stringify(fouten.slice(-20))); } catch (e) { /* opslag vol */ }
    setTimeout(() => {
      try { toast('Er ging iets mis, maar je gegevens zijn veilig.'); renderFouten(); } catch (e) { /* app nog niet geladen */ }
    }, 0);
  }
  window.addEventListener('error', (e) => logFout(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => logFout('Fout: ' + (e.reason && (e.reason.message || e.reason))));

  const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
  const heleEuro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 });
  const fmt = (centen) => euro.format(centen / 100);
  const datumLang = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const datumKop = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

  // ---------- Opslag ----------
  function laad() {
    try {
      const data = JSON.parse(localStorage.getItem(OPSLAG_SLEUTEL));
      if (data && Array.isArray(data.boekingen)) {
        const voor = data.boekingen.length;
        data.boekingen = data.boekingen.map(schoonBoeking).filter(Boolean);
        if (data.boekingen.length < voor) logFout(`${voor - data.boekingen.length} beschadigde boeking(en) overgeslagen bij het laden`);
        return data;
      }
    } catch (e) { /* lege of beschadigde opslag */ }
    return { boekingen: [] };
  }

  // Controleert een boeking (uit opslag of back-up) en repareert wat kan; geeft null als hij onbruikbaar is.
  // Eén kapotte boeking mag nooit de hele app laten vastlopen.
  function schoonBoeking(b) {
    if (!b || typeof b !== 'object' || (b.soort !== 'inkomst' && b.soort !== 'kost')) return null;
    const bedrag = Math.round(Number(b.bedrag));
    if (!Number.isFinite(bedrag) || bedrag < 0) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.datum || ''));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    const uit = Object.assign({}, b, {
      id: b.id ? String(b.id) : nieuweId(),
      bedrag,
      tarief: [0, 9, 21].includes(Number(b.tarief)) ? Number(b.tarief) : 0,
      inclBtw: b.inclBtw !== false,
      omschrijving: typeof b.omschrijving === 'string' ? b.omschrijving : '',
    });
    const btw = b.btwBedrag == null || b.btwBedrag === '' ? null : Math.round(Number(b.btwBedrag));
    uit.btwBedrag = Number.isFinite(btw) && btw >= 0 && (!uit.inclBtw || btw <= bedrag) ? btw : null;
    return uit;
  }
  function bewaar() {
    try {
      localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(state));
    } catch (e) {
      toast('Opslaan mislukt. Maak een back-up via Meer.');
    }
  }
  // Vraag iOS om de gegevens niet automatisch op te ruimen
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const state = laad();
  state.instellingen = Object.assign({ urencriterium: true, startjaar: null, zonderUren: 0, starterPerJaar: {}, loon: 0, ingehouden: 0 }, state.instellingen);
  delete state.instellingen.starter; // vervangen door startjaar
  const vandaag = new Date();
  const ui = {
    view: 'overzicht',
    jaar: vandaag.getFullYear(),
    kwartaal: Math.ceil((vandaag.getMonth() + 1) / 3),
    filter: 'alle',
    periode: 'kwartaal',
    categorie: '',
    selectie: null, // Set met id's als je boekingen aan het selecteren bent
    bewerkId: null,
  };

  // Welke periode de pijltjes bovenin bedienen
  function periodeModus() {
    if (ui.view === 'belasting') return 'jaar';
    if (ui.view === 'boekingen') return ui.periode;
    return 'kwartaal';
  }

  function nieuweId() {
    return (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function vandaagISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseISO(s) {
    const [j, m, d] = s.split('-').map(Number);
    return new Date(j, m - 1, d);
  }

  // ---------- Navigatie ----------
  const TITELS = { overzicht: 'Overzicht', boekingen: 'Boekingen', belasting: 'Belasting', meer: 'Meer' };

  function toonView(naam) {
    ui.view = naam;
    ui.selectie = null;
    document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== 'view-' + naam));
    document.querySelectorAll('.tabbar button').forEach((b) => {
      if (b.dataset.view === naam) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('titel').textContent = TITELS[naam];
    window.scrollTo(0, 0);
    render();
  }

  function wisselKwartaal(stap) {
    // Op het tabblad Belasting (of bij "heel jaar") bladeren de pijltjes per jaar
    const modus = periodeModus();
    if (modus === 'alles') return;
    if (modus === 'jaar') { ui.jaar += stap; render(); return; }
    ui.kwartaal += stap;
    if (ui.kwartaal < 1) { ui.kwartaal = 4; ui.jaar -= 1; }
    if (ui.kwartaal > 4) { ui.kwartaal = 1; ui.jaar += 1; }
    render();
  }

  // ---------- Weergave ----------
  function render() {
    const modus = periodeModus();
    const perJaar = modus === 'jaar';
    $('kwartaalLabel').textContent = modus === 'alles' ? 'Alles' : perJaar ? String(ui.jaar) : `Q${ui.kwartaal} ${ui.jaar}`;
    $('kwartaalLabel').setAttribute('aria-label', modus === 'alles' ? 'Alle jaren' : perJaar ? `Jaar ${ui.jaar}` : `Kwartaal ${ui.kwartaal} van ${ui.jaar}`);
    $('vorigKwartaal').disabled = $('volgendKwartaal').disabled = modus === 'alles';
    $('vorigKwartaal').setAttribute('aria-label', perJaar ? 'Vorig jaar' : 'Vorig kwartaal');
    $('volgendKwartaal').setAttribute('aria-label', perJaar ? 'Volgend jaar' : 'Volgend kwartaal');
    // In "Meer" kies je met de pijltjes het jaar via het kwartaal
    try {
      if (ui.view === 'overzicht') renderOverzicht();
      if (ui.view === 'boekingen') renderLijst();
      if (ui.view === 'belasting') renderBelasting();
      if (ui.view === 'meer') { renderJaar(); renderFouten(); }
    } catch (e) {
      logFout(`Scherm ${ui.view}: ${e.message}`);
    }
  }

  function boekingenVanJaar(jaar) {
    return state.boekingen.filter((b) => b.datum.startsWith(String(jaar)));
  }

  function centenNaarInvoer(c) {
    return c ? (c / 100).toFixed(2).replace('.', ',').replace(/,00$/, '') : '';
  }

  function renderBelasting() {
    const inst = state.instellingen;
    $('urencriterium').checked = inst.urencriterium;
    if (document.activeElement !== $('startjaar')) $('startjaar').value = inst.startjaar || '';
    $('zonderUren').value = String(inst.zonderUren || 0);
    const starter = starterVoorJaar(ui.jaar);
    $('starter').checked = starter.toepassen;
    $('starter').disabled = !inst.urencriterium;
    $('starterLabel').firstChild.textContent = `Startersaftrek toepassen in ${ui.jaar} `;
    $('zonderUrenVeld').hidden = !(starter.status.jaarNummer >= 2);
    $('starterUitleg').hidden = !starter.uitleg;
    $('starterUitleg').textContent = starter.uitleg;
    if (document.activeElement !== $('loon')) $('loon').value = centenNaarInvoer(inst.loon);
    if (document.activeElement !== $('ingehouden')) $('ingehouden').value = centenNaarInvoer(inst.ingehouden);

    const o = BTW.overzicht(boekingenVanJaar(ui.jaar));
    const r = IB.bereken({
      jaar: ui.jaar, winst: o.winst, horecaKosten: o.kosten.horeca,
      urencriterium: inst.urencriterium, starter: starter.toepassen,
      loon: inst.loon, ingehoudenLoonheffing: inst.ingehouden,
    });

    $('ibJaar').textContent = ui.jaar;
    $('ibTotaal').textContent = fmt(Math.max(0, r.totaal));
    const maand = Math.max(0, Math.round(r.totaal / 12));
    $('ibSub').textContent = o.inkomsten.aantal + o.kosten.aantal === 0
      ? 'Nog geen boekingen in dit jaar.'
      : r.totaal > 0 ? `Zet ongeveer ${fmt(maand)} per maand apart` : 'Je hoeft naar verwachting niets bij te betalen';

    const p = r.parameters;
    const rijen = $('ibRijen');
    rijen.innerHTML = '';
    const voeg = (label, waarde, klasse) => { const d = rij(label, waarde); if (klasse) d.className = klasse; rijen.appendChild(d); };
    // Aftrekposten met het juiste teken, ook bij verlies
    const af = (c) => (c >= 0 ? '− ' : '+ ') + fmt(Math.abs(c));
    voeg('Inkomsten (excl. btw)', fmt(o.inkomsten.excl));
    voeg('Kosten (excl. btw)', '− ' + fmt(o.kosten.excl));
    voeg(r.winst >= 0 ? 'Winst' : 'Verlies', fmt(Math.abs(r.winst)), 'sub');
    if (r.nietAftrekbaarHoreca) voeg('Eten & drinken: 20% niet aftrekbaar', '+ ' + fmt(r.nietAftrekbaarHoreca), 'min');
    if (r.zelfstandigenaftrek) voeg(`Zelfstandigenaftrek`, af(r.zelfstandigenaftrek), 'min');
    if (r.startersaftrek) voeg('Startersaftrek', af(r.startersaftrek), 'min');
    if (r.mkb) voeg(`Mkb-winstvrijstelling (${String(p.mkbPct).replace('.', ',')}%)`, af(r.mkb), 'min');
    voeg(r.belastbareWinst >= 0 ? 'Belastbare winst' : 'Fiscaal verlies', fmt(Math.abs(r.belastbareWinst)), 'sub');
    if (r.loon) voeg('Ander inkomen', '+ ' + fmt(r.loon), 'min');
    voeg('Inkomstenbelasting vóór kortingen', fmt(r.belastingVoorKorting + r.aftrekbeperking));
    voeg('Algemene heffingskorting', '− ' + fmt(r.ahk), 'min');
    voeg('Arbeidskorting', '− ' + fmt(r.ak), 'min');
    if (r.ingehouden) voeg('Al ingehouden loonheffing', '− ' + fmt(r.ingehouden), 'min');
    voeg(r.nogTeBetalen >= 0 ? 'Inkomstenbelasting te betalen' : 'Inkomstenbelasting terug', fmt(Math.abs(r.nogTeBetalen)), 'sub');
    voeg(`Bijdrage Zvw (${String(p.zvw.pct).replace('.', ',')}% van ${fmt(r.zvwGrondslag)})`, fmt(r.zvw), 'sub');
    voeg('Totaal', fmt(r.totaal), 'totaal');

    const basis = 'Dit is een schatting voor ondernemers onder de AOW-leeftijd. Toeslagen, hypotheekrente, box 2 en 3, afschrijvingen en de kleinschaligheidsinvesteringsaftrek zijn niet meegenomen. Je voorlopige aanslag kan anders zijn.';
    $('ibVoetnoot').textContent = (r.benadering ? `Let op: voor ${ui.jaar} zijn nog geen tarieven bekend, gerekend met die van ${r.jaar}. ` : `Tarieven ${r.jaar}. `) + basis;
  }

  $('urencriterium').addEventListener('change', (e) => { state.instellingen.urencriterium = e.target.checked; bewaar(); renderBelasting(); });
  // Bepaalt of de startersaftrek geldt in een jaar: automatisch op basis van het startjaar, tenzij je het zelf hebt aangepast
  function starterVoorJaar(jaar) {
    const inst = state.instellingen;
    const status = IB.starterStatus(jaar, inst.startjaar, inst.zonderUren);
    const handmatig = inst.starterPerJaar[jaar];
    const toepassen = inst.urencriterium && (handmatig != null ? handmatig : status.recht);
    const bedrag = fmt(IB.parametersVoor(jaar).p.startersaftrek * 100);
    let uitleg = '';
    if (!inst.startjaar) uitleg = '';
    else if (!status.jaarNummer) uitleg = `In ${jaar} was je bedrijf nog niet gestart.`;
    else if (!inst.urencriterium) uitleg = `${jaar} is je ${status.jaarNummer}e jaar als ondernemer, maar zonder urencriterium krijg je geen startersaftrek.`;
    else if (status.recht) uitleg = `${jaar} is je ${status.jaarNummer}e jaar als ondernemer: je hebt recht op startersaftrek (${bedrag}). Dit is de ${status.keer}e keer${status.keer === 3 ? ' en de laatste keer' : ''}.`;
    else if (status.jaarNummer <= 5) uitleg = `${jaar} is je ${status.jaarNummer}e jaar als ondernemer. Je hebt de startersaftrek al 3 keer gehad, dus in ${jaar} geen recht meer.`;
    else uitleg = `Je bedrijf bestaat in ${jaar} langer dan 5 jaar: geen startersaftrek meer.`;
    if (inst.startjaar && handmatig != null && handmatig !== status.recht) uitleg += ' Je hebt dit zelf aangepast.';
    return { status, toepassen, uitleg };
  }

  $('starter').addEventListener('change', (e) => {
    const inst = state.instellingen;
    const auto = IB.starterStatus(ui.jaar, inst.startjaar, inst.zonderUren).recht;
    // Alleen onthouden als het afwijkt van wat de app zelf berekent
    if (e.target.checked === auto) delete inst.starterPerJaar[ui.jaar];
    else inst.starterPerJaar[ui.jaar] = e.target.checked;
    bewaar();
    renderBelasting();
  });
  $('startjaar').addEventListener('input', (e) => {
    const j = parseInt(e.target.value, 10);
    state.instellingen.startjaar = j >= 1950 && j <= 2100 ? j : null;
    bewaar();
    renderBelasting();
  });
  $('zonderUren').addEventListener('change', (e) => { state.instellingen.zonderUren = Number(e.target.value); bewaar(); renderBelasting(); });
  [['loon', 'loon'], ['ingehouden', 'ingehouden']].forEach(([id, sleutel]) => {
    $(id).addEventListener('input', (e) => {
      const c = BTW.parseBedrag(e.target.value);
      state.instellingen[sleutel] = c == null ? 0 : c;
      bewaar();
      renderBelasting();
    });
  });

  function renderOverzicht() {
    const o = BTW.kwartaalOverzicht(state.boekingen, ui.jaar, ui.kwartaal);
    const saldo = o.saldoBtw;
    const betalen = saldo >= 0;
    const deadline = BTW.deadline(ui.jaar, ui.kwartaal);

    const kaart = $('resultaat');
    kaart.classList.toggle('betalen', saldo > 0);
    kaart.classList.toggle('terug', saldo < 0);
    $('resultaatLabel').textContent = saldo === 0 ? 'Btw dit kwartaal' : betalen ? 'Btw te betalen' : 'Btw terug te krijgen';
    $('resultaatBedrag').textContent = fmt(Math.abs(saldo));

    const aantal = o.inkomsten.aantal + o.kosten.aantal;
    $('resultaatSub').textContent = aantal === 0
      ? 'Nog geen boekingen in dit kwartaal.'
      : `Aangifte doen vóór ${datumLang.format(deadline)}`;

    $('btwOntvangen').textContent = fmt(o.inkomsten.btw);
    $('btwBetaald').textContent = '− ' + fmt(o.kosten.btw);
    $('saldoLabel').textContent = betalen ? 'Te betalen' : 'Terug te krijgen';
    $('saldo').textContent = fmt(Math.abs(saldo));

    $('inkomstenExcl').textContent = fmt(o.inkomsten.excl);
    $('kostenExcl').textContent = fmt(o.kosten.excl);
    $('winstLabel').textContent = o.winst >= 0 ? 'Winst' : 'Verlies';
    $('winst').textContent = fmt(Math.abs(o.winst));

    const a = BTW.aangifte(o);
    const he = (e) => heleEuro.format(e);
    $('r1a').textContent = `${he(a.r1a.omzet)} · btw ${he(a.r1a.btw)}`;
    $('r1b').textContent = `${he(a.r1b.omzet)} · btw ${he(a.r1b.btw)}`;
    $('r1e').textContent = he(a.r1e.omzet);
    $('r5a').textContent = he(a.r5a);
    $('r5b').textContent = he(a.r5b);
    $('rTotaalLabel').textContent = a.totaal >= 0 ? 'Totaal te betalen' : 'Totaal terug te krijgen';
    $('rTotaal').textContent = he(Math.abs(a.totaal));
  }

  function gefilterdeBoekingen() {
    const laatsteImport = Math.max(0, ...state.boekingen.map((b) => b.importId || 0));
    return state.boekingen
      .filter((b) => ui.periode === 'alles' || (ui.periode === 'jaar' ? b.datum.startsWith(String(ui.jaar)) : BTW.inKwartaal(b, ui.jaar, ui.kwartaal)))
      .filter((b) => ui.filter === 'alle' || b.soort === ui.filter)
      .filter((b) => !ui.categorie ||
        (ui.categorie === '__laatste' ? laatsteImport && b.importId === laatsteImport
          : ui.categorie === '__bank' ? b.bank : b.categorie === ui.categorie))
      .sort((a, b) => b.datum.localeCompare(a.datum) || (b.aangemaakt || 0) - (a.aangemaakt || 0));
  }

  function renderLijst() {
    const lijst = $('lijst');
    lijst.innerHTML = '';
    document.querySelectorAll('.filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === ui.filter)));
    $('periode').value = ui.periode;
    $('filterCategorie').value = ui.categorie;

    const items = gefilterdeBoekingen();
    const selecteren = !!ui.selectie;
    if (selecteren) {
      // Alleen zichtbare boekingen blijven geselecteerd
      const zichtbaar = new Set(items.map((b) => b.id));
      ui.selectie.forEach((id) => { if (!zichtbaar.has(id)) ui.selectie.delete(id); });
    }
    lijst.classList.toggle('selecteren', selecteren);
    $('leeg').hidden = items.length > 0;
    $('leeg').innerHTML = state.boekingen.length && !items.length
      ? 'Geen boekingen met deze filters.'
      : 'Nog niets ingevoerd in dit kwartaal.<br>Tik op <strong>Inkomsten</strong> of <strong>Kosten</strong> om te beginnen.';

    const som = items.reduce((t, b) => t + (b.soort === 'inkomst' ? 1 : -1) * BTW.splits(b).incl, 0);
    $('lijstTelling').textContent = items.length
      ? `${items.length} ${items.length === 1 ? 'boeking' : 'boekingen'} · saldo ${som < 0 ? '−' : '+'} ${fmt(Math.abs(som))}`
      : '';
    $('selecteerModus').setAttribute('aria-pressed', String(selecteren));
    $('selecteerModus').textContent = selecteren ? 'Klaar' : 'Selecteren';
    $('selecteerModus').hidden = !items.length && !selecteren;
    $('selectieActies').hidden = !selecteren;
    if (selecteren) {
      const n = ui.selectie.size;
      const alles = n > 0 && n === items.length;
      $('selecteerAlles').textContent = alles ? 'Niets selecteren' : `Alles selecteren (${items.length})`;
      $('verwijderSelectie').textContent = n ? `Verwijder ${n}` : 'Verwijder';
      $('verwijderSelectie').disabled = !n;
    }

    let huidigeDatum = null;
    items.forEach((b) => {
      if (b.datum !== huidigeDatum) {
        huidigeDatum = b.datum;
        const kop = document.createElement('li');
        kop.className = 'datumkop';
        const d = parseISO(b.datum);
        kop.textContent = ui.periode === 'kwartaal' ? datumKop.format(d) : datumLang.format(d);
        lijst.appendChild(kop);
      }
      const s = BTW.splits(b);
      const isInkomst = b.soort === 'inkomst';
      const li = document.createElement('li');
      const knop = document.createElement('button');
      knop.type = 'button';

      const badge = document.createElement('span');
      badge.className = 'badge ' + b.soort;
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = isInkomst ? '+' : '−';

      const midden = document.createElement('span');
      const oms = document.createElement('span');
      oms.className = 'oms';
      oms.textContent = b.omschrijving || (isInkomst ? 'Inkomsten' : 'Kosten');
      const det = document.createElement('span');
      det.className = 'det';
      det.textContent = s.nietAftrekbaar ? `Btw ${fmt(s.nietAftrekbaar)} niet aftrekbaar`
        : s.btw ? `${b.tarief}% btw: ${fmt(s.btw)}` : 'Geen btw';
      midden.append(oms, det);

      const bedrag = document.createElement('span');
      bedrag.className = 'bedrag ' + b.soort;
      bedrag.textContent = (isInkomst ? '+ ' : '− ') + fmt(s.incl);

      const beschrijving = `${isInkomst ? 'Inkomsten' : 'Kosten'}: ${oms.textContent}, ${fmt(s.incl)} inclusief btw, ${det.textContent}`;
      if (selecteren) {
        const gekozen = ui.selectie.has(b.id);
        knop.setAttribute('role', 'checkbox');
        knop.setAttribute('aria-checked', String(gekozen));
        knop.setAttribute('aria-label', beschrijving);
        const vink = document.createElement('span');
        vink.className = 'vink';
        vink.setAttribute('aria-hidden', 'true');
        vink.textContent = gekozen ? '✓' : '';
        knop.append(vink);
        knop.addEventListener('click', () => {
          if (ui.selectie.has(b.id)) ui.selectie.delete(b.id); else ui.selectie.add(b.id);
          renderLijst();
          const terug = document.querySelector(`#lijst [data-id="${b.id}"]`);
          if (terug) terug.focus();
        });
      } else {
        knop.setAttribute('aria-label', beschrijving + '. Tik om te wijzigen.');
        knop.addEventListener('click', () => openForm(b.soort, b));
      }
      knop.dataset.id = b.id;
      knop.append(badge, midden, bedrag);
      li.appendChild(knop);
      lijst.appendChild(li);
    });
  }

  $('selecteerModus').addEventListener('click', () => {
    ui.selectie = ui.selectie ? null : new Set();
    renderLijst();
  });
  $('selecteerAlles').addEventListener('click', () => {
    const items = gefilterdeBoekingen();
    if (ui.selectie.size === items.length) ui.selectie.clear();
    else items.forEach((b) => ui.selectie.add(b.id));
    renderLijst();
  });
  $('verwijderSelectie').addEventListener('click', () => {
    const n = ui.selectie.size;
    if (!n || !confirm(`${n === 1 ? '1 boeking' : n + ' boekingen'} verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    state.boekingen = state.boekingen.filter((b) => !ui.selectie.has(b.id));
    bewaar();
    ui.selectie = null;
    toast(n === 1 ? '1 boeking verwijderd' : `${n} boekingen verwijderd`);
    renderLijst();
  });
  $('periode').addEventListener('change', (e) => { ui.periode = e.target.value; render(); });
  $('filterCategorie').addEventListener('change', (e) => { ui.categorie = e.target.value; renderLijst(); });
  // Soorten kosten ook als filter
  Object.entries(BonLezer.CATEGORIEEN).forEach(([waarde, label]) => {
    const o = document.createElement('option');
    o.value = waarde;
    o.textContent = label;
    $('filterCategorie').appendChild(o);
  });

  function renderJaar() {
    $('jaarLabel').textContent = ui.jaar;
    const rijen = $('jaarRijen');
    rijen.innerHTML = '';
    let totaalBtw = 0;
    for (let k = 1; k <= 4; k++) {
      const o = BTW.kwartaalOverzicht(state.boekingen, ui.jaar, k);
      totaalBtw += o.saldoBtw;
      rijen.appendChild(rij(`Q${k}: btw ${o.saldoBtw >= 0 ? 'betalen' : 'terug'}`, fmt(Math.abs(o.saldoBtw))));
    }
    const jaar = BTW.overzicht(state.boekingen.filter((b) => b.datum.startsWith(String(ui.jaar))));
    rijen.appendChild(rij('Inkomsten (excl. btw)', fmt(jaar.inkomsten.excl)));
    rijen.appendChild(rij('Kosten (excl. btw)', fmt(jaar.kosten.excl)));
    rijen.appendChild(rij(jaar.winst >= 0 ? 'Winst' : 'Verlies', fmt(Math.abs(jaar.winst)), true));
    rijen.appendChild(rij(`Btw heel jaar ${totaalBtw >= 0 ? 'betalen' : 'terug'}`, fmt(Math.abs(totaalBtw)), true));
  }

  function rij(label, waarde, totaal) {
    const div = document.createElement('div');
    if (totaal) div.className = 'totaal';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = waarde;
    div.append(dt, dd);
    return div;
  }

  // ---------- Formulier ----------
  const dialog = $('formDialog');
  const form = $('form');

  // Vul de keuzelijst met soorten kosten
  Object.entries(BonLezer.CATEGORIEEN).forEach(([waarde, label]) => {
    const o = document.createElement('option');
    o.value = waarde;
    o.textContent = label;
    $('categorie').appendChild(o);
  });

  // opties.concept: een ingelezen bon die nog niet is opgeslagen; opties.bijBewaren krijgt de gewijzigde boeking
  let formOpties = null;

  function openForm(soort, boeking, opties) {
    form.reset();
    formOpties = opties || null;
    const concept = !!(opties && opties.concept);
    ui.bewerkId = boeking && !concept ? boeking.id : null;
    $('formTitel').textContent = concept ? 'Bon controleren' : boeking ? 'Boeking wijzigen' : 'Nieuwe boeking';
    $('verwijder').hidden = !boeking || concept;
    $('bedrag').removeAttribute('aria-invalid');
    $('bedragFout').hidden = true;

    form.soort.value = boeking ? boeking.soort : soort;
    $('bedrag').value = boeking && boeking.bedrag ? (boeking.bedrag / 100).toFixed(2).replace('.', ',') : '';
    form.incl.value = boeking ? (boeking.inclBtw ? 'ja' : 'nee') : 'ja';
    form.tarief.value = String(boeking ? boeking.tarief : 21);
    $('btwBedrag').value = boeking && boeking.btwBedrag != null ? (boeking.btwBedrag / 100).toFixed(2).replace('.', ',') : '';
    $('categorie').value = (boeking && boeking.categorie) || 'algemeen';
    $('btwAftrekbaar').checked = !boeking || boeking.btwAftrekbaar !== false;
    $('omschrijving').value = boeking ? boeking.omschrijving : '';
    $('datum').value = boeking && boeking.datum ? boeking.datum : standaardDatum();

    const notities = concept && boeking.notities && boeking.notities.length ? boeking.notities : null;
    $('formNotities').hidden = !notities;
    $('formNotities').textContent = notities ? notities.join(' ') : '';

    updateBerekening();
    openDialoog(dialog);
    if (!boeking) $('bedrag').focus();
  }

  // Nieuwe boeking: vandaag, of de eerste dag van het gekozen kwartaal als je een ander kwartaal bekijkt
  function standaardDatum() {
    const nu = vandaagISO();
    const k = BTW.kwartaalVan(nu);
    if (k.jaar === ui.jaar && k.kwartaal === ui.kwartaal) return nu;
    return `${ui.jaar}-${String((ui.kwartaal - 1) * 3 + 1).padStart(2, '0')}-01`;
  }

  function leesForm() {
    const soort = form.soort.value;
    return {
      soort,
      bedrag: BTW.parseBedrag($('bedrag').value),
      inclBtw: form.incl.value === 'ja',
      tarief: Number(form.tarief.value),
      btwBedrag: BTW.parseBedrag($('btwBedrag').value),
      categorie: soort === 'kost' ? $('categorie').value : null,
      btwAftrekbaar: soort === 'kost' ? $('btwAftrekbaar').checked : true,
      omschrijving: $('omschrijving').value.trim(),
      datum: $('datum').value,
    };
  }

  function updateBerekening() {
    const b = leesForm();
    $('kostVelden').hidden = b.soort !== 'kost';
    const el = $('berekening');
    if (b.bedrag == null || b.bedrag === 0) { el.textContent = ''; return; }
    const s = BTW.splits(b);
    el.innerHTML = '';
    const btwLabel = b.btwBedrag != null ? 'Btw' : `Btw ${b.tarief}%`;
    const delen = s.nietAftrekbaar
      ? [['Kosten', s.excl], ['waarvan btw (niet aftrekbaar)', s.nietAftrekbaar]]
      : [['Excl. btw', s.excl], [btwLabel, s.btw], ['Incl. btw', s.incl]];
    delen.forEach(([label, w], i) => {
      if (i) el.append(' · ');
      el.append(label + ' ');
      const st = document.createElement('strong');
      st.textContent = fmt(w);
      el.append(st);
    });
  }

  function sluitForm() {
    dialog.close();
    ui.bewerkId = null;
    formOpties = null;
  }

  // Horeca: btw standaard niet aftrekbaar
  $('categorie').addEventListener('change', (e) => { $('btwAftrekbaar').checked = e.target.value !== 'horeca'; });
  form.addEventListener('input', updateBerekening);
  form.addEventListener('change', updateBerekening);
  $('annuleer').addEventListener('click', sluitForm);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const b = leesForm();
    if (b.bedrag == null || b.bedrag <= 0) {
      $('bedrag').setAttribute('aria-invalid', 'true');
      $('bedragFout').hidden = false;
      $('bedrag').focus();
      return;
    }
    if (!b.datum) b.datum = vandaagISO();

    if (formOpties && formOpties.bijBewaren) {
      const terug = formOpties.bijBewaren;
      sluitForm();
      terug(b);
      return;
    }

    if (ui.bewerkId) {
      const i = state.boekingen.findIndex((x) => x.id === ui.bewerkId);
      if (i >= 0) state.boekingen[i] = Object.assign({}, state.boekingen[i], b);
      toast('Wijziging bewaard');
    } else {
      state.boekingen.push(Object.assign({ id: nieuweId(), aangemaakt: Date.now() }, b));
      toast(b.soort === 'inkomst' ? 'Inkomsten toegevoegd' : 'Kosten toegevoegd');
    }
    bewaar();
    // Spring naar het kwartaal van de boeking, zodat je hem meteen terugziet
    const k = BTW.kwartaalVan(b.datum);
    ui.jaar = k.jaar;
    ui.kwartaal = k.kwartaal;
    sluitForm();
    render();
  });

  $('verwijder').addEventListener('click', () => {
    if (!confirm('Weet je zeker dat je deze boeking wilt verwijderen?')) return;
    state.boekingen = state.boekingen.filter((x) => x.id !== ui.bewerkId);
    bewaar();
    sluitForm();
    toast('Boeking verwijderd');
    render();
  });

  // ---------- Exporteren & back-up ----------
  async function deelBestand(naam, inhoud, type) {
    const blob = new Blob([inhoud], { type });
    const bestand = new File([blob], naam, { type });
    if (navigator.canShare && navigator.canShare({ files: [bestand] })) {
      try {
        await navigator.share({ files: [bestand], title: naam });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = naam;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csv(boekingen) {
    const getal = (c) => (c / 100).toFixed(2).replace('.', ',');
    const tekst = (t) => '"' + String(t).replace(/"/g, '""') + '"';
    const regels = [['Datum', 'Soort', 'Omschrijving', 'Categorie', 'Bedrag excl. btw', 'Btw-tarief', 'Btw', 'Niet-aftrekbare btw', 'Bedrag incl. btw'].join(';')];
    boekingen
      .slice()
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .forEach((b) => {
        const s = BTW.splits(b);
        regels.push([b.datum, b.soort === 'inkomst' ? 'Inkomsten' : 'Kosten', tekst(b.omschrijving || ''),
          tekst(b.categorie ? BonLezer.CATEGORIEEN[b.categorie] || '' : ''),
          getal(s.excl), b.tarief + '%', getal(s.btw), getal(s.nietAftrekbaar), getal(s.incl)].join(';'));
      });
    // BOM zodat Excel de euro- en accenttekens goed leest
    return '﻿' + regels.join('\r\n');
  }

  $('csvKwartaal').addEventListener('click', () => {
    const items = state.boekingen.filter((b) => BTW.inKwartaal(b, ui.jaar, ui.kwartaal));
    deelBestand(`boekhouding-${ui.jaar}-Q${ui.kwartaal}.csv`, csv(items), 'text/csv');
  });
  $('csvJaar').addEventListener('click', () => {
    const items = state.boekingen.filter((b) => b.datum.startsWith(String(ui.jaar)));
    deelBestand(`boekhouding-${ui.jaar}.csv`, csv(items), 'text/csv');
  });

  $('backup').addEventListener('click', () => {
    const data = JSON.stringify({ app: 'boekhouding', versie: 1, gemaakt: new Date().toISOString(), boekingen: state.boekingen }, null, 2);
    deelBestand(`boekhouding-backup-${vandaagISO()}.json`, data, 'application/json');
  });

  $('herstelBestand').addEventListener('change', async (e) => {
    const bestand = e.target.files[0];
    e.target.value = '';
    if (!bestand) return;
    try {
      const data = JSON.parse(await bestand.text());
      if (!data || !Array.isArray(data.boekingen)) throw new Error('ongeldig');
      const geldig = data.boekingen.map(schoonBoeking).filter(Boolean);
      const kapot = data.boekingen.length - geldig.length;
      if (!confirm(`Back-up met ${geldig.length} boekingen terugzetten?${kapot ? ` (${kapot} beschadigde worden overgeslagen.)` : ''} Je huidige gegevens worden vervangen.`)) return;
      state.boekingen = geldig;
      bewaar();
      render();
      toast('Back-up teruggezet');
    } catch (err) {
      toast('Dit bestand is geen geldige back-up');
    }
  });

  $('allesWissen').addEventListener('click', () => {
    if (!confirm('Alle boekingen wissen? Dit kan niet ongedaan worden gemaakt.')) return;
    if (!confirm('Echt alles wissen? Maak eventueel eerst een back-up.')) return;
    state.boekingen = [];
    bewaar();
    render();
    toast('Alle gegevens gewist');
  });

  // ---------- Bonnen inlezen ----------
  const scanDialog = $('scanDialog');
  let scanItems = [];

  function scanStap(stap) {
    $('scanKiezen').hidden = stap !== 'kiezen';
    $('scanBezig').hidden = stap !== 'bezig';
    $('scanResultaat').hidden = stap !== 'resultaat';
  }

  function openScan() {
    scanItems = [];
    scanStap('kiezen');
    openDialoog(scanDialog);
  }

  // Loopt er een inleesactie? Dan bevat dit het stopsignaal; er kan er maar één tegelijk lopen.
  let scanSignaal = null;

  async function startScan(bestanden) {
    if (!bestanden || !bestanden.length || scanSignaal) return;
    const signaal = scanSignaal = { gestopt: false };
    scanStap('bezig');
    const balk = $('scanVoortgang');
    try {
      const resultaten = await Scanner.lees(bestanden, (tekst, klaar, totaal) => {
        $('scanStatus').textContent = totaal ? `${tekst} (${Math.min(klaar + 1, totaal)} van ${totaal})` : tekst;
        if (totaal) { balk.max = totaal; balk.value = klaar; } else balk.removeAttribute('value');
      });
      if (signaal.gestopt) return;
      scanItems = resultaten.map((r) => Object.assign(r, { meenemen: !r.fout && r.meenemen !== false && !!(r.boeking && r.boeking.bedrag) }));
      markeerDubbel(scanItems);
      renderScan();
      scanStap('resultaat');
      $('scanSamenvatting').setAttribute('tabindex', '-1');
      $('scanSamenvatting').focus();
    } catch (e) {
      if (signaal.gestopt) return;
      logFout('Inlezen: ' + (e.message || e));
      toast('Inlezen mislukt: ' + (e.message || 'onbekende fout'));
      scanStap('kiezen');
    } finally {
      if (scanSignaal === signaal) scanSignaal = null;
    }
  }

  // Zelfde bedrag, zelfde soort en binnen 7 dagen: waarschijnlijk dezelfde uitgave (bijv. tankbon én de betaling op het bankafschrift,
  // of een ZIP die je twee keer inleest). Die worden standaard niet meegenomen.
  function markeerDubbel(items) {
    const dagen = (a, b) => Math.abs(parseISO(a) - parseISO(b)) / 864e5;
    const zelfde = (a, b) => a.soort === b.soort && a.datum && b.datum && dagen(a.datum, b.datum) <= 7 &&
      BTW.splits(a).incl === BTW.splits(b).incl;
    const bonnen = items.filter((i) => !i.fout && !i.bank);
    items.forEach((item) => {
      if (item.fout || !item.boeking.bedrag) return;
      const b = item.boeking;
      const bestaand = state.boekingen.find((x) => zelfde(x, b));
      const alsBon = item.bank && bonnen.find((x) => x.boeking.bedrag && zelfde(x.boeking, b));
      if (bestaand) {
        item.meenemen = false;
        b.notities.unshift(`Staat al in je boekingen: "${bestaand.omschrijving}" (${datumLang.format(parseISO(bestaand.datum))}).`);
      } else if (alsBon) {
        item.meenemen = false;
        b.notities.unshift(`Dezelfde betaling als de bon "${alsBon.boeking.omschrijving}" hierboven: niet dubbel tellen.`);
      }
    });
  }

  function renderScan() {
    const lijst = $('scanLijst');
    lijst.innerHTML = '';
    const goed = scanItems.filter((i) => !i.fout);
    const aantalMee = scanItems.filter((i) => i.meenemen).length;
    const letOp = goed.filter((i) => !i.boeking.zeker).length;
    const bestanden = new Set(scanItems.map((i) => i.pad || i.naam)).size;
    const fout = scanItems.filter((i) => i.fout).length;
    $('scanSamenvatting').textContent = `${bestanden} ${bestanden === 1 ? 'bestand' : 'bestanden'} gelezen, ${goed.length} ${goed.length === 1 ? 'boeking' : 'boekingen'} gevonden.` +
      (fout ? ` ${fout} ${fout === 1 ? 'bestand' : 'bestanden'} kon niet worden gelezen.` : '') +
      (letOp ? ` Bij ${letOp} is iets niet zeker gevonden; controleer die even (oranje rand).` : ' Controleer de gegevens en tik op Toevoegen.');
    $('scanToevoegen').textContent = aantalMee === 1 ? '1 boeking toevoegen' : `${aantalMee} boekingen toevoegen`;
    $('scanToevoegen').disabled = aantalMee === 0;

    scanItems.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'scankaart' + (item.fout ? ' fout' : !item.boeking.zeker ? ' let-op' : '') + (item.meenemen ? '' : ' uit');

      if (item.voorbeeld) {
        const img = document.createElement('img');
        img.src = item.voorbeeld;
        img.alt = '';
        li.appendChild(img);
      } else {
        const g = document.createElement('div');
        g.className = 'geenbeeld';
        g.setAttribute('aria-hidden', 'true');
        g.textContent = item.fout ? '⚠️' : item.bank ? '🏦' : '📄';
        li.appendChild(g);
      }

      const info = document.createElement('div');
      const h = document.createElement('h3');
      const b = item.boeking;
      h.textContent = item.fout ? item.naam : b.omschrijving || item.naam;
      info.appendChild(h);

      if (item.fout) {
        const p = document.createElement('p');
        p.className = 'det';
        p.textContent = item.fout;
        info.appendChild(p);
      } else {
        const s = b.bedrag ? BTW.splits(b) : null;
        const kern = document.createElement('p');
        kern.className = 'kerngetallen';
        const sterk = document.createElement('strong');
        sterk.textContent = s ? fmt(s.incl) : 'Bedrag onbekend';
        kern.append(b.soort === 'inkomst' ? 'Inkomsten ' : 'Kosten ', sterk);
        const det = document.createElement('p');
        det.className = 'det';
        const btwTekst = !s ? '' : s.nietAftrekbaar ? `btw ${fmt(s.nietAftrekbaar)} niet aftrekbaar` : s.btw ? `btw ${fmt(s.btw)} (${b.tarief}%)` : 'geen btw';
        det.textContent = [b.datum ? datumLang.format(parseISO(b.datum)) : 'Datum onbekend', btwTekst, BonLezer.CATEGORIEEN[b.categorie],
          item.bank ? 'bankafschrift' : null, item.pad && item.pad.includes('/') ? 'map ' + item.pad.split('/').slice(-2, -1)[0] : null].filter(Boolean).join(' · ');
        info.append(kern, det);
        if (b.notities.length) {
          const ul = document.createElement('ul');
          ul.className = 'notities';
          b.notities.forEach((n) => { const nl = document.createElement('li'); nl.textContent = n; ul.appendChild(nl); });
          info.appendChild(ul);
        }
      }
      li.appendChild(info);

      if (!item.fout) {
        const rijKnoppen = document.createElement('div');
        rijKnoppen.className = 'knoppenrij';
        const lab = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = item.meenemen;
        cb.addEventListener('change', () => { item.meenemen = cb.checked; renderScan(); });
        lab.append(cb, 'Toevoegen');
        const wijzig = document.createElement('button');
        wijzig.type = 'button';
        wijzig.className = 'knopklein';
        wijzig.textContent = 'Controleer / wijzig';
        wijzig.setAttribute('aria-label', `Controleer of wijzig ${h.textContent}`);
        wijzig.addEventListener('click', () => {
          openForm(b.soort, b, {
            concept: true,
            bijBewaren: (nieuw) => {
              item.boeking = Object.assign({}, b, nieuw, { zeker: true, notities: b.notities.filter((n) => !/niet gevonden/.test(n)) });
              item.meenemen = true;
              renderScan();
            },
          });
        });
        rijKnoppen.append(lab, wijzig);
        li.appendChild(rijKnoppen);
      }
      lijst.appendChild(li);
    });
  }

  $('scanToevoegen').addEventListener('click', () => {
    const mee = scanItems.filter((i) => i.meenemen && !i.fout);
    const zonderBedrag = mee.filter((i) => !i.boeking.bedrag);
    if (zonderBedrag.length) {
      toast('Vul eerst het bedrag in bij: ' + zonderBedrag.map((i) => i.boeking.omschrijving || i.naam).join(', '));
      return;
    }
    let laatste = null;
    const importId = Date.now();
    mee.forEach((i) => {
      const b = i.boeking;
      const boeking = {
        id: nieuweId(), aangemaakt: Date.now(), importId,
        soort: b.soort, bedrag: b.bedrag, inclBtw: b.inclBtw, tarief: b.tarief,
        btwBedrag: b.btwBedrag, btwAftrekbaar: b.btwAftrekbaar, categorie: b.soort === 'kost' ? b.categorie : null,
        omschrijving: b.omschrijving || i.naam, datum: b.datum || vandaagISO(), bron: i.pad || i.naam,
      };
      if (i.bank) boeking.bank = true;
      state.boekingen.push(boeking);
      laatste = boeking;
    });
    bewaar();
    if (laatste) {
      const k = BTW.kwartaalVan(laatste.datum);
      ui.jaar = k.jaar;
      ui.kwartaal = k.kwartaal;
    }
    scanDialog.close();
    Scanner.stop();
    toast(mee.length === 1 ? '1 boeking toegevoegd' : `${mee.length} boekingen toegevoegd`);
    // Laat precies zien wat er is toegevoegd (over alle periodes), zodat je het ook in één keer kunt terugdraaien
    ui.periode = 'alles';
    ui.categorie = '__laatste';
    ui.filter = 'alle';
    toonView('boekingen');
  });

  ['scanBestanden', 'scanCamera'].forEach((id) => $(id).addEventListener('change', (e) => {
    const bestanden = Array.from(e.target.files || []);
    e.target.value = '';
    startScan(bestanden);
  }));
  $('scanOpnieuw').addEventListener('click', () => scanStap('kiezen'));
  [['scanAllesAan', true], ['scanAllesUit', false]].forEach(([id, aan]) => $(id).addEventListener('click', () => {
    scanItems.forEach((i) => { if (!i.fout) i.meenemen = aan; });
    renderScan();
  }));
  function sluitScan() {
    if (scanSignaal) {
      if (!confirm('Het inlezen is nog bezig. Stoppen?')) return;
      scanSignaal.gestopt = true;
      scanSignaal = null;
    } else if (scanItems.some((i) => i.meenemen) && !$('scanResultaat').hidden &&
      !confirm('De ingelezen bonnen zijn nog niet toegevoegd. Toch sluiten?')) return;
    scanDialog.close();
    Scanner.stop();
  }
  $('scanSluit').addEventListener('click', sluitScan);
  // Sluiten met een veeggebaar of Esc gaat via dezelfde vraag
  scanDialog.addEventListener('cancel', (e) => { e.preventDefault(); sluitScan(); });
  document.querySelectorAll('[data-scan]').forEach((b) => b.addEventListener('click', openScan));

  // ---------- Overig ----------
  function openDialoog(d) {
    if (d.open) return;
    d.dataset.geopend = String(Date.now());
    d.showModal();
  }
  // Een dubbeltik op een knop mag niet meteen iets aantikken in het scherm dat net openging
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => {
    if (Date.now() - Number(d.dataset.geopend || 0) < 350) { e.preventDefault(); e.stopPropagation(); }
  }, true));

  function renderFouten() {
    const fouten = leesFouten();
    $('foutenBlok').hidden = !fouten.length;
    $('foutenAantal').textContent = fouten.length === 1 ? '1 foutmelding' : `${fouten.length} foutmeldingen`;
  }
  $('foutenDelen').addEventListener('click', () => {
    const tekst = [`Boekhouding foutmeldingen (${navigator.userAgent})`, '']
      .concat(leesFouten().map((f) => `${f.tijd} [${f.scherm}] ${f.bericht}`)).join('\n');
    deelBestand('boekhouding-foutmeldingen.txt', tekst, 'text/plain');
  });
  $('foutenWissen').addEventListener('click', () => {
    try { localStorage.removeItem(FOUTEN_SLEUTEL); } catch (e) { /* niets */ }
    renderFouten();
  });
  let toastTimer;
  function toast(tekst) {
    const t = $('toast');
    t.textContent = tekst;
    t.classList.add('zichtbaar');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('zichtbaar'), 2200);
  }

  document.querySelectorAll('[data-nieuw]').forEach((b) => b.addEventListener('click', () => openForm(b.dataset.nieuw)));
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => toonView(b.dataset.view)));
  document.querySelectorAll('.filter button').forEach((b) => b.addEventListener('click', () => { ui.filter = b.dataset.filter; renderLijst(); }));
  $('vorigKwartaal').addEventListener('click', () => wisselKwartaal(-1));
  $('volgendKwartaal').addEventListener('click', () => wisselKwartaal(1));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  render();
})();
