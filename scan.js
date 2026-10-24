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

  let ocrWorker = null;
  async function ocr() {
    if (!ocrWorker) {
      ocrWorker = (async () => {
        await laadScript(basis + 'tesseract/tesseract.min.js');
        return window.Tesseract.createWorker('nld+eng', 1, {
          workerPath: basis + 'tesseract/worker.min.js',
          corePath: basis + 'tesseract/',
          langPath: basis + 'tesseract/lang',
          workerBlobURL: false,
        });
      })();
    }
    return ocrWorker;
  }

  async function stop() {
    if (ocrWorker) {
      const w = await ocrWorker.catch(() => null);
      ocrWorker = null;
      if (w) await w.terminate();
    }
  }

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

  // Pakt ZIP-bestanden uit (ook ZIP in ZIP) tot een platte lijst van {naam, pad, blob, soort}.
  // Het pad bevat de mappen uit de ZIP, bijv. "Inkomsten/factuur-014.pdf".
  async function verzamel(bestanden, map) {
    const uit = [];
    for (const f of bestanden) {
      const pad = (map ? map + '/' : '') + (f.pad || f.name);
      const soort = soortVan(f.name, f.type);
      if (soort === 'zip') {
        await laadScript(basis + 'jszip.min.js');
        const zip = await window.JSZip.loadAsync(f);
        const items = Object.values(zip.files).filter((z) => !z.dir && !/(^|\/)(__MACOSX|\.)/.test(z.name));
        const binnen = [];
        for (const z of items) {
          const naam = z.name.split('/').pop();
          if (!soortVan(naam)) continue;
          const blob = await z.async('blob');
          const bestand = new File([blob], naam, { type: PDF.test(naam) ? 'application/pdf' : '' });
          bestand.pad = z.name;
          binnen.push(bestand);
        }
        uit.push(...(await verzamel(binnen, pad.replace(/\.zip$/i, '').split('/').slice(0, -1).join('/'))));
      } else {
        uit.push({ naam: f.name, pad, blob: f, soort });
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
    c.width = Math.round(breedte * schaal);
    c.height = Math.round(hoogte * schaal);
    const ctx = c.getContext('2d');
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
    const bereik = Math.max(1, hoog - laag);
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.max(0, Math.min(255, ((d[i] - laag) * 255) / bereik));
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(beeld, 0, 0);
    return canvas;
  }

  // Leest tekst; lukt het niet goed (geen bedrag of btw), dan nog een keer met een andere lay-outinstelling
  async function herken(canvas, voortgang) {
    const w = await ocr();
    await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
    let tekst = (await w.recognize(canvas)).data.text;
    const eerste = window.BonLezer.lees(tekst, '');
    if (!eerste.bedrag || eerste.btwBedrag == null || !eerste.datum) {
      voortgang('Nog een keer lezen…');
      await w.setParameters({ tessedit_pageseg_mode: '6' });
      const tweede = (await w.recognize(canvas)).data.text;
      const r2 = window.BonLezer.lees(tweede, '');
      const score = (r) => (r.bedrag ? 2 : 0) + (r.btwBedrag != null ? 2 : 0) + (r.datum ? 1 : 0);
      if (score(r2) > score(eerste)) tekst = tweede;
    }
    return tekst;
  }

  async function leesAfbeelding(item, voortgang) {
    const img = await laadAfbeelding(item.blob);
    const groot = verbeterContrast(naarCanvas(img, img.naturalWidth, img.naturalHeight, 2400));
    const klein = naarCanvas(img, img.naturalWidth, img.naturalHeight, 240).toDataURL('image/jpeg', 0.7);
    voortgang('Tekst herkennen…');
    const tekst = await herken(groot, voortgang);
    return { tekst, voorbeeld: klein, ocr: true };
  }

  // Zet de tekstlaag van een PDF-pagina om naar rijen met posities (voor kolommen op bankafschriften)
  function rijenUitTekstlaag(items) {
    const rijen = [];
    items.forEach((it) => {
      if (!it.str || !it.str.trim()) return;
      const y = it.transform[5], x = it.transform[4];
      let rij = rijen.find((r) => Math.abs(r.y - y) < 3);
      if (!rij) { rij = { y, delen: [] }; rijen.push(rij); }
      rij.delen.push({ x, s: it.str });
    });
    rijen.sort((a, b) => b.y - a.y);
    rijen.forEach((r) => r.delen.sort((a, b) => a.x - b.x));
    return rijen;
  }

  async function leesPdf(item, voortgang) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await item.blob.arrayBuffer()) }).promise;
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
      let paginaTekst = rijen.map((r) => r.delen.map((d) => d.s).join(' ')).join('\n');
      if (i > 4 && !window.BankLezer.isAfschrift(tekst, item.pad)) break;
      alleRijen.push(...rijen);
      if (i === 1) {
        const vp = pagina.getViewport({ scale: 0.5 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await pagina.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        voorbeeld = c.toDataURL('image/jpeg', 0.7);
      }
      // Gescande PDF zonder tekst: pagina als afbeelding lezen
      if (paginaTekst.replace(/\s/g, '').length < 20) {
        voortgang(`Tekst herkennen (pagina ${i})…`);
        const vp = pagina.getViewport({ scale: 2 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await pagina.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        paginaTekst = await herken(verbeterContrast(c), voortgang);
        paginaTekst.split('\n').forEach((r) => alleRijen.push({ tekst: r }));
        ocrGebruikt = true;
      }
      tekst += paginaTekst + '\n';
    }
    return { tekst, voorbeeld, ocr: ocrGebruikt, rijen: alleRijen };
  }

  // Zet transacties van een bankafschrift om naar losse resultaten
  function bankResultaten(item, transacties) {
    return transacties.map((t, i) => {
      const { boeking, meenemen } = window.BankLezer.naarBoeking(t);
      return { naam: item.naam, pad: item.pad, bank: true, sleutel: item.pad + '#' + i, boeking, meenemen };
    });
  }

  // Leest alle bestanden en geeft per bon het resultaat van de BonLezer terug.
  // voortgang(tekst, klaar, totaal) houdt het scherm op de hoogte.
  async function lees(bestanden, voortgang) {
    voortgang('Bestanden openen…', 0, 0);
    const items = await verzamel(Array.from(bestanden));
    const resultaten = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const melding = (t) => voortgang(`${item.naam}: ${t}`, i, items.length);
      melding('lezen…');
      if (!item.soort) {
        resultaten.push({ naam: item.naam, pad: item.pad, fout: 'Dit bestandstype wordt niet ondersteund.' });
        continue;
      }
      try {
        const hint = window.BonLezer.hintUitPad(item.pad) || {};
        if (item.soort === 'tekst') {
          const transacties = window.BankLezer.leesCsv(await item.blob.text());
          if (!transacties.length) throw new Error('Geen transacties gevonden in dit bestand. Exporteer het afschrift als CSV uit je bankapp.');
          resultaten.push(...bankResultaten(item, transacties));
          continue;
        }
        const r = item.soort === 'pdf' ? await leesPdf(item, melding) : await leesAfbeelding(item, melding);
        if (hint.bank || window.BankLezer.isAfschrift(r.tekst, item.pad)) {
          const transacties = r.rijen ? window.BankLezer.leesRijen(r.rijen, r.tekst) : window.BankLezer.leesTekst(r.tekst);
          if (transacties.length) {
            resultaten.push(...bankResultaten(item, transacties));
            continue;
          }
        }
        const vandaag = new Date().toISOString().slice(0, 10);
        const boeking = window.BonLezer.lees(r.tekst, item.naam, { vandaag, hint });
        resultaten.push({ naam: item.naam, pad: item.pad, voorbeeld: r.voorbeeld, tekst: r.tekst, boeking, meenemen: !!boeking.bedrag });
      } catch (e) {
        resultaten.push({ naam: item.naam, pad: item.pad, fout: e.message || 'Kon dit bestand niet lezen.' });
      }
    }
    voortgang('Klaar', items.length, items.length);
    return resultaten;
  }

  window.Scanner = { lees, stop };
})();
