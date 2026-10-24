# Boekhouding – btw, inkomsten en kosten op je iPhone

Een eenvoudige app om je inkomsten en kosten bij te houden. Hij berekent meteen hoeveel btw je dit kwartaal moet betalen of terugkrijgt.

- **Overzicht**: in één oogopslag hoeveel btw je moet betalen of terugkrijgt, en vóór welke datum je aangifte moet doen
- **Inkomsten en kosten invoeren**: bedrag inclusief of exclusief btw, tarief 21%, 9% of 0%
- **Hulp bij de aangifte**: de bedragen per rubriek (1a, 1b, 1e, 5a, 5b), afgerond in je voordeel
- **Jaaroverzicht** met winst en btw per kwartaal
- **Bonnen inlezen**: kies foto's, PDF's, bankafschriften (PDF of CSV) of een ZIP-bestand met bonnen. Mappen in de ZIP tellen mee: *Inkomsten* (omzet), *Kosten*, *Sponsoring*, *Tanken*/*Auto* en *Bank*. De app leest bedrag, btw en datum (zoals 12-03-2026 of 12 maart 2026) en herkent het soort kosten. Daarna controleer je alles en voeg je het toe.
  - Vliegtickets: wel kosten, btw niet verrekenbaar
  - Eten en drinken in de horeca: btw niet aftrekbaar, 80% telt mee voor de inkomstenbelasting
  - Buitenlandse btw: niet aftrekbaar in je Nederlandse aangifte
  - Tankbonnen: 21% btw, ook als die op de bon niet leesbaar is
  - Motorrijtuigenbelasting: kosten zonder btw (bij een zakelijke auto)
  - Bankafschriften: afschrijvingen als kosten; betalingen aan de Belastingdienst, eigen rekening en dubbele betalingen worden herkend
  - Btw verlegd, bonnen met zowel 9% als 21% btw, en apparatuur boven € 450 (afschrijven)
- **Boekingen in één keer verwijderen**: filter op periode, soort of laatst ingelezen, kies *Selecteren* → *Alles selecteren* → *Verwijder*
- **Belasting**: een schatting van je inkomstenbelasting en de bijdrage Zorgverzekeringswet (Zvw) per jaar, met zelfstandigenaftrek, startersaftrek (automatisch bepaald aan de hand van het startjaar van je bedrijf), mkb-winstvrijstelling, heffingskortingen en eventueel loon uit loondienst. Tarieven 2025 en 2026.
- **Exporteren** naar Excel (CSV) voor je boekhouder, plus back-up en terugzetten
- Werkt offline, ondersteunt donkere modus, grotere tekst (Dynamic Type) en VoiceOver

Je gegevens en bonnen blijven alleen op je eigen iPhone; er wordt niets naar een server gestuurd. Het lezen van bonnen gebeurt ook op de telefoon zelf. Werkt op iOS 16.4 of nieuwer.

## Op je iPhone zetten

1. Zet de app online met GitHub Pages: ga in GitHub naar **Settings → Pages**, kies bij *Branch* `master` en map `/ (root)` en klik op **Save**. Na een minuut staat de app op `https://<gebruikersnaam>.github.io/boekhoudapp/`.
2. Open dat adres in **Safari** op je iPhone.
3. Tik op de deelknop en kies **Zet op beginscherm**.

Daarna open je de app gewoon via het icoon op je beginscherm.

## Testen

```
node --test tests/*.test.js
```
