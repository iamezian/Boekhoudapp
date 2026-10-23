# Boekhouding – btw, inkomsten en kosten op je iPhone

Een eenvoudige app om je inkomsten en kosten bij te houden. Hij berekent meteen hoeveel btw je dit kwartaal moet betalen of terugkrijgt.

- **Overzicht**: in één oogopslag hoeveel btw je moet betalen of terugkrijgt, en vóór welke datum je aangifte moet doen
- **Inkomsten en kosten invoeren**: bedrag inclusief of exclusief btw, tarief 21%, 9% of 0%
- **Hulp bij de aangifte**: de bedragen per rubriek (1a, 1b, 1e, 5a, 5b), afgerond in je voordeel
- **Jaaroverzicht** met winst en btw per kwartaal
- **Exporteren** naar Excel (CSV) voor je boekhouder, plus back-up en terugzetten
- Werkt offline, ondersteunt donkere modus, grotere tekst (Dynamic Type) en VoiceOver

Je gegevens blijven alleen op je eigen iPhone; er wordt niets naar een server gestuurd.

## Op je iPhone zetten

1. Zet de app online met GitHub Pages: ga in GitHub naar **Settings → Pages**, kies bij *Branch* `master` en map `/ (root)` en klik op **Save**. Na een minuut staat de app op `https://<gebruikersnaam>.github.io/boekhoudapp/`.
2. Open dat adres in **Safari** op je iPhone.
3. Tik op de deelknop en kies **Zet op beginscherm**.

Daarna open je de app gewoon via het icoon op je beginscherm.

## Testen

```
node --test tests/btw.test.js
```
