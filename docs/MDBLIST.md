# MDBList integration — requirements (not implemented)

Documented scope only. Nothing in this file is wired into the app yet, and no
MDBList key exists in the repository.

## What MDBList provides

[mdblist.com](https://mdblist.com) exposes an HTTP API for **user lists** and
**list metadata** (imdb/tmdb/tvdb ids, titles, artwork, sort order). Lists can be
public or private; private lists need an API key.

## Authentication

- API key (`apikey=…`) issued per account in the MDBList profile.
- Keys are **secrets**: they must be entered on the TV (Settings), stored in
  `localStorage` only, and never committed, bundled into `dist/`, logged or shown
  in diagnostics.
- Requests must be HTTPS; the TV blocks `http://` inside an `https://` page.

## Endpoints needed (verify against the official docs before implementing)

| Purpose | Shape |
|---|---|
| list of the user's lists | `GET /lists?apikey=…` |
| one list (paged) | `GET /list/{id}/items?apikey=…&limit=…&offset=…` |
| list metadata | `GET /list/{id}?apikey=…` |

Exact paths, query names and rate limits must be confirmed from the publisher's
documentation at implementation time — this document deliberately does not invent
them.

## Mapping into WuTizen

1. `state/lists.js` already models lists as `{ id, nameKey, items[] }` with only
   id/kind/title/year/poster per item. An MDBList import writes the same shape
   (id, kind, title, year, poster) — no URLs.
2. A list becomes a **Home row** (`lists` source) or a row on a custom screen.
3. Recommendations ("because you watched …") would be a separate list type with
   the same row renderer.

## Blockers before implementation

- Public documentation/endpoints must be re-verified (no speculative calls).
- Rate limits and caching policy for a 2019 TV SoC (no aggressive polling).
- Key entry needs the on-screen keyboard path already used by Settings → import.

## Out of scope for now

Trakt and Simkl: same shape (OAuth + list endpoints), documented as future work.
