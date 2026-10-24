// Leest bonnen in: ZIP-bestanden, PDF's en foto's. Alles gebeurt op je eigen telefoon; er gaat niets naar internet.
(function () {
  'use strict';

  const basis = new URL('vendor/', location.href).href;
  const geladen = {};

  function laadScript(src) {
    if (!geladen[src]) {
      geladen[src] = new Promise((ok, fout) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = ok;
        s.onerror = () => fout(new Error('Kon ' + src + ' niet laden'));
        document.head.appendChild(s);
      });
    }
    return geladen[src];
  }

  async function pdfjs() {
    await laadScript(basis + 'pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = basis + 'pdf.worker.min.js';
    return window.pdfjsLib;
  }

  // Elke inleesactie ("run") heeft een eigen tekstherkenning. Stoppen breekt alles af wat nog wacht,
  // zodat een afgebroken run nooit blijft hangen of een nieuwe run in de weg zit.
  function maakRun() {
    const run = { worker: null, gebruik: 0, gestopt: false };
    run.afgebroken = new Promise((_, nee) => { run.breekAf = () => { run.gestopt = true; nee(new Error('Gestopt')); }; });
    run.afgebroken.catch(() => {});
    return run;
  }
  let huidigeRun = null;

  // Wacht op iets, tenzij de run wordt gestopt
  const wacht = (run, belofte) => Promise.race([belofte, run.afgebroken]);

  // De tekstherkenning gebruikt steeds meer geheugen; na een aantal foto's starten we hem opnieuw,
  // anders sluit iOS de app af bij grote stapels bonnen.
  const HERSTART_NA = 10;
  async function ocr(run) {
    if (run.worker && run.gebruik >= HERSTART_NA) await stopWorker(run);
    run.gebruik++;
    if (!run.worker) {
      run.worker = (async () => {
        await laadScript(basis + 'tesseract/tesseract.min.js');
        return window.Tesseract.createWorker('nld+eng', 1, {
          workerPath: basis + 'tesseract/worker.min.js',
          corePath: basis + 'tesseract/',
          langPath: basis + 'tesseract/lang',
          workerBlobURL: false,
        });
      })();
    }
    return wacht(run, run.worker);
  }

  async function stopWorker(run) {
    run.gebruik = 0;
    if (run.worker) {
      const bezig = run.worker;
      run.worker = null;
      const w = await bezig.catch(() => null);
      if (w) await w.terminate().catch(() => {});
    }
  }

  // Stopt de lopende inleesactie (bijv. als je het scherm sluit)
  function stop() {
    const run = huidigeRun;
    huidigeRun = null;
    if (!run) return;
    run.breekAf();
    stopWorker(run);
  }

  // iOS geeft het geheugen van een canvas pas vrij als je hem verkleint tot 0
  function vrij(...canvassen) {
    canvassen.forEach((c) => { if (c) { c.width = 0; c.height = 0; } });
  }

  const pauze = () => new Promise((ok) => setTimeout(ok, 30));

  const AFBEELDING = /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i;
  const PDF = /\.pdf$/i;
  const ZIP = /\.zip$/i;
  const TEKST = /\.(csv|txt|tab)$/i;

  function soortVan(naam, type) {
    if (PDF.test(naam) || type === 'application/pdf') return 'pdf';
    if (ZIP.test(naam) || /zip/.test(type || '')) return 'zip';
    if (TEKST.test(naam) || /^text\//.test(type || '')) return 'tekst';
    if (AFBEELDING.test(naam) || /^image\//.test(type || '')) return 'afbeelding';
    return null;
  }

  // Maakt een platte lijst van {naam, pad, soort, laad} van losse bestanden en ZIP-bestanden (ook ZIP in ZIP).
  // Bestanden in een ZIP worden pas uitgepakt als ze aan de beurt zijn, zodat er nooit alles tegelijk in het geheugen staat.
  // Het pad bevat de mappen uit de ZIP, bijv. "Inkomsten/factuur-014.pdf".
  async function verzamel(bestanden, map) {
    const uit = [];
    for (const f of bestanden) {
      const pad = (map ? map + '/' : '') + (f.pad || f.name);
      const soort = soortVan(f.name, f.type);
      if (soort === 'zip') {
        await laadScript(basis + 'jszip.min.js');
        let zip;
        try {
          zip = await window.JSZip.loadAsync(f.laad ? await f.laad() : f);
        } catch (e) {
          uit.push({ naam: f.name, pad, soort: null, fout: 'Dit ZIP-bestand is beschadigd of kan niet worden geopend.' });
          continue;
        }
        const binnen = Object.values(zip.files)
          .filter((z) => !z.dir && !/(^|\/)(__MACOSX|\.)/.test(z.name))
          .map((z) => {
            const naam = z.name.split('/').pop();
            return { name: naam, pad: z.name, type: PDF.test(naam) ? 'application/pdf' : '', laad: () => z.async('blob') };
          })
          .filter((z) => soortVan(z.name));
        uit.push(...(await verzamel(binnen, pad.replace(/\.zip$/i, '').split('/').slice(0, -1).join('/'))));
      } else {
        uit.push({ naam: f.name, pad, soort, laad: f.laad || (async () => f) });
      }
    }
    return uit;
  }

  function laadAfbeelding(blob) {
    return new Promise((ok, fout) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); fout(new Error('Deze afbeelding kan niet worden geopend')); };
      img.src = url;
    });
  }

  function naarCanvas(bron, breedte, hoogte, max) {
    const schaal = Math.min(1, max / Math.max(breedte, hoogte));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(breedte * schaal));
    c.height = Math.max(1, Math.round(hoogte * schaal));
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Te weinig geheugen om deze foto te lezen. Sluit andere apps en probeer het opnieuw.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bron, 0, 0, c.width, c.height);
    return c;
  }

  // Grijs maken en contrast oprekken: vervaagde kassabonnen (thermisch papier) worden zo beter leesbaar
  function verbeterContrast(canvas) {
    const ctx = canvas.getContext('2d');
    const beeld = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = beeld.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
      d[i] = g;
      hist[g]++;
    }
    const totaal = d.length / 4;
    let laag = 0, hoog = 255, som = 0;
    while (laag < 255 && (som += hist[laag]) < totaal * 0.02) laag++;
    som = 0;
    while (hoog > 0 && (som += hist[hoog]) < totaal * 0.02) hoog--;
    // Het papier wordt wit. Bij weinig tekst op een grote foto valt "laag" ook op het papier;
    // houd daarom altijd minstens 60 grijstinten bereik, anders verdwijnt de tekst in ruis.
    laag = Math.max(0, Math.min(laag, hoog - 60));
    const bereik = Math.max(1, hoog - laag);
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.max(0, Math.min(255, ((d[i] - laag) * 255) / bereik));
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(beeld, 0, 0);
    return canvas;
  }

  // Leest tekst; lukt het niet goed (geen bedrag of btw), dan nog een keer met een andere lay-outinstelling
  async function herken(run, canvas, voortgang) {
    const w = await ocr(run);
    await wacht(run, w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' }));
    let tekst = (await wacht(run, w.recognize(canvas))).data.text;
    const eerste = window.BonLezer.lees(tekst, '');
    if (!eerste.bedrag || eerste.btwBedrag == null || !eerste.datum) {
      voortgang('Nog een keer lezen…');
      await wacht(run, w.setParameters({ tessedit_pageseg_mode: '6' }));
      const tweede = (await wacht(run, w.recognize(canvas))).data.text;
      const r2 = window.BonLezer.lees(tweede, '');
      const score = (r) => (r.bedrag ? 2 : 0) + (r.btwBedrag != null ? 2 : 0) + (r.datum ? 1 : 0);
      if (score(r2) > score(eerste)) tekst = tweede;
    }
    return tekst;
  }

  async function leesAfbeelding(run, blob, voortgang) {
    const img = await laadAfbeelding(blob);
    let groot = null, klein = null;
    try {
      klein = naarCanvas(img, img.naturalWidth, img.naturalHeight, 240);
      const voorbeeld = klein.toDataURL('image/jpeg', 0.7);
      vrij(klein);
      // 2000 pixels is ruim genoeg voor een bon en blijft binnen het geheugen van een iPhone
      groot = verbeterContrast(naarCanvas(img, img.naturalWidth, img.naturalHeight, 2000));
      img.src = '';
      voortgang('Tekst herkennen…');
      const tekst = await herken(run, groot, voortgang);
      return { tekst, voorbeeld, ocr: true };
    } finally {
      vrij(groot, klein);
    }
  }

  // Zet de tekstlaag van een PDF-pagina om naar rijen met posities (voor kolommen op bankafschriften).
  // Stukjes tekst op (bijna) dezelfde hoogte vormen één rij; tussen stukjes die tegen elkaar aan staan komt geen spatie,
  // anders krijg je "T otaalbedr ag" of een bedrag dat over twee regels valt ("€ 75," en "00").
  function rijenUitTekstlaag(items) {
    const stukken = items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], b: it.width || 0, h: Math.abs(it.height || it.transform[3] || 10), s: it.str }));
    const rijen = [];
    stukken.forEach((st) => {
      let rij = rijen.find((r) => Math.abs(r.y - st.y) <= Math.max(2, Math.min(r.h, st.h) * 0.5));
      if (!rij) { rij = { y: st.y, h: st.h, stukken: [] }; rijen.push(rij); }
      rij.stukken.push(st);
    });
    rijen.sort((a, b) => b.y - a.y);
    // Kleine, iets hoger geplaatste tekst (centen in superscript, zoals "€75,⁰⁰") hoort bij de regel eronder
    for (let i = rijen.length - 2; i >= 0; i--) {
      const klein = rijen[i], onder = rijen[i + 1];
      const hKlein = Math.max(...klein.stukken.map((st) => st.h));
      if (hKlein < onder.h * 0.85 && klein.y - onder.y < onder.h) {
        onder.stukken.push(...klein.stukken);
        rijen.splice(i, 1);
      }
    }
    return rijen.map((r) => {
      r.stukken.sort((a, b) => a.x - b.x);
      // Aan elkaar plakken tot "delen" (woorden/kolommen) met hun x-positie
      const delen = [];
      let huidig = null, eind = 0;
      r.stukken.forEach((st) => {
        const gat = st.x - eind;
        if (huidig && gat < st.h * 0.25) {
          huidig.s += st.s;
        } else if (huidig && gat < st.h * 1.5) {
          huidig.s += ' ' + st.s;
        } else {
          huidig = { x: st.x, s: st.s };
          delen.push(huidig);
        }
        eind = st.x + st.b;
      });
      delen.forEach((d) => { d.s = d.s.replace(/\s+/g, ' ').trim(); });
      return { y: r.y, delen };
    });
  }

  async function leesPdf(run, item, blob, voortgang) {
    const lib = await pdfjs();
    const taak = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
    let doc;
    try {
      doc = await taak.promise;
    } catch (e) {
      await taak.destroy().catch(() => {});
      throw new Error(/password/i.test(e.name || e.message) ? 'Deze PDF is beveiligd met een wachtwoord.' : 'Deze PDF is beschadigd of kan niet worden geopend.');
    }
    try {
      return await leesPdfPaginas(run, item, doc, voortgang);
    } finally {
      // Zonder dit blijft elke PDF in het geheugen staan
      await doc.destroy().catch(() => {});
    }
  }

  async function leesPdfPaginas(run, item, doc, voortgang) {
    // Bankafschriften kunnen lang zijn; bonnen en facturen lezen we tot 4 pagina's
    const paginas = Math.min(doc.numPages, 30);
    let tekst = '';
    let voorbeeld = null;
    let ocrGebruikt = false;
    const alleRijen = [];
    for (let i = 1; i <= paginas; i++) {
      const pagina = await doc.getPage(i);
      const inhoud = await pagina.getTextContent();
      const rijen = rijenUitTekstlaag(inhoud.items);
      let paginaTekst = rijen.map((r) => r.delen.map((d) => d.s).join('  ')).join('\n');
      if (i > 4 && !window.BankLezer.isAfschrift(tekst, item.pad)) break;
      alleRijen.push(...rijen);
      if (i === 1) {
        const vp = pagina.getViewport({ scale: 0.4 });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        try {
          await pagina.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          voorbeeld = c.toDataURL('image/jpeg', 0.7);
        } catch (e) { /* zonder voorbeeld gaat het ook */ }
        vrij(c);
      }
      // Gescande PDF zonder tekst: pagina als afbeelding lezen (hooguit 4 pagina's, anders duurt het te lang)
      if (paginaTekst.replace(/\s/g, '').length < 20 && i <= 4) {
        voortgang(`Tekst herkennen (pagina ${i})…`);
        const basisVp = pagina.getViewport({ scale: 1 });
        const vp = pagina.getViewport({ scale: Math.min(2, 2000 / Math.max(basisVp.width, basisVp.height)) });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        try {
          const ctx = c.getContext('2d');
          if (!ctx) throw new Error('Te weinig geheugen om deze PDF te lezen. Sluit andere apps en probeer het opnieuw.');
          await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
          paginaTekst = await herken(run, verbeterContrast(c), voortgang);
        } finally {
          vrij(c);
        }
        paginaTekst.split('\n').forEach((r) => alleRijen.push({ tekst: r }));
        ocrGebruikt = true;
      }
      pagina.cleanup();
      tekst += paginaTekst + '\n';
    }
    return { tekst, voorbeeld, ocr: ocrGebruikt, rijen: alleRijen };
  }

  // Zet transacties van een bankafschrift om naar losse resultaten
  function bankResultaten(item, transacties, hint) {
    return transacties.map((t, i) => {
      const { boeking, meenemen } = window.BankLezer.naarBoeking(t, hint);
      return { naam: item.naam, pad: item.pad, bank: true, sleutel: item.pad + '#' + i, boeking, meenemen };
    });
  }

  // Leest alle bestanden en geeft per bon het resultaat van de BonLezer terug.
  // voortgang(tekst, klaar, totaal) houdt het scherm op de hoogte.
  // Controles over alle bestanden samen:
  // - een regel die in veel documenten staat (je eigen bedrijfsnaam of adres) is nooit de leverancier
  // - datums buiten het kwartaal uit de mapnaam ("Facturen Q3 2026") zijn verdacht
  function naverwerk(resultaten) {
    const metTekst = resultaten.filter((r) => r.tekst && r.boeking);
    if (metTekst.length >= 3) {
      const telling = new Map();
      metTekst.forEach((r) => {
        // Per kolom ("Aan  Mijn Bedrijf" → "mijn bedrijf"), zonder labels als Aan/Naam/Contractant
        new Set(r.tekst.split(/\n|\s{2,}/)
          .map((l) => l.replace(/\s+/g, ' ').trim().toLowerCase().replace(/^(aan|naam|contractant|klant|t\.?a\.?v\.?)\s*:?\s+/, ''))
          .filter((l) => l.length >= 4 && l.length <= 40 && /\p{L}{3,}/u.test(l)))
          .forEach((l) => telling.set(l, (telling.get(l) || 0) + 1));
      });
      const eigenNamen = new Set([...telling].filter(([, n]) => n >= Math.max(3, metTekst.length * 0.3)).map(([l]) => l));
      if (eigenNamen.size) {
        metTekst.forEach((r) => {
          if (r.boeking.soort === 'kost' && eigenNamen.has(r.boeking.omschrijving.toLowerCase())) {
            r.boeking.omschrijving = window.BonLezer.lees(r.tekst, r.naam, { eigenNamen }).omschrijving;
          }
        });
      }
    }
    resultaten.forEach((r) => {
      const hint = window.BonLezer.hintUitPad(r.pad);
      if (!r.boeking || !r.boeking.datum || !hint || !hint.kwartaal) return;
      const k = window.BTW.kwartaalVan(r.boeking.datum);
      if (k.jaar !== hint.jaar || k.kwartaal !== hint.kwartaal) {
        r.boeking.zeker = false;
        r.boeking.notities.unshift(`Datum valt buiten Q${hint.kwartaal} ${hint.jaar} (de map): controleer de datum. Klopt hij, dan telt de boeking mee in Q${k.kwartaal} ${k.jaar}.`);
      }
    });
  }

  // Met Scanner.stop() breek je het inlezen af; de resultaten van een afgebroken run zijn dan onvolledig.
  async function lees(bestanden, voortgang) {
    stop(); // er kan maar één run tegelijk lopen
    const run = huidigeRun = maakRun();
    voortgang('Bestanden openen…', 0, 0);
    const items = await wacht(run, verzamel(Array.from(bestanden)));
    const resultaten = [];
    for (let i = 0; i < items.length; i++) {
      if (run.gestopt) break;
      const item = items[i];
      const melding = (t) => { if (!run.gestopt) voortgang(`${item.naam}: ${t}`, i, items.length); };
      melding('lezen…');
      if (!item.soort) {
        resultaten.push({ naam: item.naam, pad: item.pad, fout: item.fout || 'Dit bestandstype wordt niet ondersteund.' });
        continue;
      }
      await pauze(); // geef de telefoon even lucht om geheugen op te ruimen
      try {
        const hint = window.BonLezer.hintUitPad(item.pad) || {};
        const blob = await item.laad();
        if (item.soort === 'tekst') {
          const transacties = window.BankLezer.leesCsv(await blob.text());
          if (!transacties.length) throw new Error('Geen transacties gevonden in dit bestand. Exporteer het afschrift als CSV uit je bankapp.');
          resultaten.push(...bankResultaten(item, transacties));
          continue;
        }
        const r = item.soort === 'pdf' ? await leesPdf(run, item, blob, melding) : await leesAfbeelding(run, blob, melding);
        // Losse betaling uit de bankapp (één transactie per PDF of schermafbeelding)
        const bewijs = window.BankLezer.leesTransactieBewijs(r.tekst);
        if (bewijs) {
          const [res] = bankResultaten(item, [bewijs], hint);
          res.voorbeeld = r.voorbeeld;
          resultaten.push(res);
          continue;
        }
        if (hint.bank || window.BankLezer.isAfschrift(r.tekst, item.pad)) {
          const transacties = r.rijen ? window.BankLezer.leesRijen(r.rijen, r.tekst) : window.BankLezer.leesTekst(r.tekst);
          if (transacties.length) {
            resultaten.push(...bankResultaten(item, transacties, hint));
            continue;
          }
        }
        const vandaag = new Date().toISOString().slice(0, 10);
        const boeking = window.BonLezer.lees(r.tekst, item.naam, { vandaag, hint });
        resultaten.push({ naam: item.naam, pad: item.pad, voorbeeld: r.voorbeeld, tekst: r.tekst, boeking, meenemen: !!boeking.bedrag && !boeking.prive });
      } catch (e) {
        if (run.gestopt) break;
        resultaten.push({ naam: item.naam, pad: item.pad, fout: e.message || 'Kon dit bestand niet lezen.' });
        // Na een fout (bijv. geheugen) beginnen we met een schone tekstherkenning
        await stopWorker(run);
      }
    }
    await stopWorker(run);
    if (huidigeRun === run) huidigeRun = null;
    naverwerk(resultaten);
    voortgang('Klaar', items.length, items.length);
    return resultaten;
  }

  window.Scanner = { lees, stop };
})();
