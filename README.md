# ScenarijPro-app

ScenarijPro-app je akademski projekat za rad sa scenarijima, razvijen kao web aplikacija za kreiranje, pregled i uređivanje scenarija. Aplikacija kombinuje jednostavan frontend napravljen korištenjem HTML-a, CSS-a i vanilla JavaScript-a sa Node.js/Express backendom i MySQL bazom podataka.

Projekat je prvobitno koristio `mysql2` za rad sa bazom, a zatim je nadograđen tako da koristi `Sequelize` kao ORM sloj. Paket `mysql2` je i dalje prisutan jer služi kao MySQL driver za Sequelize.

## Tehnologije

- HTML5
- CSS3
- JavaScript
- Node.js
- Express
- MySQL
- mysql2
- Sequelize

## Funkcionalnosti

- kreiranje novih scenarija
- pregled postojećih scenarija
- otvaranje editora za pisanje scenarija
- uređivanje teksta scenarija po linijama
- zaključavanje linije tokom uređivanja
- zaključavanje i preimenovanje uloga/likova
- evidencija promjena kroz `Delta` zapise
- kreiranje checkpoint-a
- vraćanje scenarija na ranije stanje
- pomoćne tekstualne analize u editoru:
  - broj riječi
  - pregled uloga
  - detekcija potencijalno pogrešnih uloga
  - broj linija za određenu ulogu
  - grupisanje uloga

## Struktura projekta

```text
ScenarijPro-app/
|-- css/
|   |-- projects.css
|   |-- user.css
|   `-- writing.css
|-- html/
|   |-- projects.html
|   |-- user.html
|   `-- writing.html
|-- js/
|   |-- EditorTeksta.js
|   |-- editor.js
|   |-- PoziviAjaxFetch.js
|   `-- projects.js
|-- models/
|   |-- Checkpoint.js
|   |-- db.js
|   |-- Delta.js
|   |-- index.js
|   |-- Line.js
|   `-- Scenario.js
|-- package.json
`-- server.js
```

## Glavni dijelovi aplikacije

### Frontend

- [html/projects.html](./html/projects.html) prikazuje listu projekata/scenarija
- [html/writing.html](./html/writing.html) predstavlja editor za pisanje i kolaborativno uređivanje
- [html/user.html](./html/user.html) sadrži formu za korisničke postavke
- [js/PoziviAjaxFetch.js](./js/PoziviAjaxFetch.js) sadrži AJAX pozive prema REST API-ju
- [js/editor.js](./js/editor.js) povezuje editor sa alatima i backend funkcionalnostima
- [js/EditorTeksta.js](./js/EditorTeksta.js) implementira logiku obrade i formatiranja teksta

### Backend

- [server.js](./server.js) implementira Express server i REST API
- [models/](./models) sadrži Sequelize modele i relacije:
  - `Scenario`
  - `Line`
  - `Delta`
  - `Checkpoint`

## Baza podataka

Konekcija je podešena za MySQL bazu u fajlu [models/db.js](./models/db.js):

```js
const sequelize = new Sequelize("wt26", "root", "password", {
  host: "127.0.0.1",
  dialect: "mysql",
  logging: false,
});
```

Prije pokretanja aplikacije potrebno je:

1. instalirati i pokrenuti MySQL server
2. kreirati bazu podataka `wt26`
3. po potrebi izmijeniti korisničko ime, lozinku ili host u konfiguraciji

## Pokretanje projekta

1. Instalirati zavisnosti:

```bash
npm install
```

2. Pokrenuti server:

```bash
npm start
```

3. Otvoriti aplikaciju u browseru:

```text
http://localhost:3000/html/projects.html
```

## API pregled

Implementirani su sljedeći važniji endpointi:

- `POST /api/scenarios`
- `GET /api/scenarios/:scenarioId`
- `PUT /api/scenarios/:scenarioId/lines/:lineId`
- `POST /api/scenarios/:scenarioId/lines/:lineId/lock`
- `POST /api/scenarios/:scenarioId/lines/:lineId/unlock`
- `POST /api/scenarios/:scenarioId/characters/lock`
- `POST /api/scenarios/:scenarioId/characters/unlock`
- `POST /api/scenarios/:scenarioId/characters/update`
- `GET /api/scenarios/:scenarioId/deltas?since=timestamp`
- `POST /api/scenarios/:scenarioId/checkpoint`
- `GET /api/scenarios/:scenarioId/checkpoints`
- `GET /api/scenarios/:scenarioId/restore/:checkpointId`

## Važne napomene

- Server trenutno koristi `sequelize.sync({ force: true })`, što znači da se tabele brišu i ponovo kreiraju pri svakom pokretanju aplikacije.
- Prilikom starta servera se ubacuje i početni testni scenarij za potrebe demonstracije.
- Projekat je razvijan u akademske svrhe i fokus je na demonstraciji rada sa frontendom, REST servisima, konkurentnim uređivanjem i ORM pristupom bazi.

## Moguća buduća unapređenja

- autentikacija i prijava korisnika
- prava pristupa i stvarni višekorisnički rad
- trajno čuvanje podataka bez resetovanja baze pri startu
- validacija formi i bolja obrada grešaka
- automatski testovi i CI integracija

## Autor i kontekst

Ovaj projekat je rađen kao akademski projekat i predstavlja praktičnu demonstraciju razvoja jedne manje full-stack web aplikacije za upravljanje scenarijima, sa posebnim fokusom na organizaciju sadržaja, obradu teksta i rad sa bazom podataka kroz Sequelize.
