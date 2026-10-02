TI SEQUENCE BUILDER - OFFLINE DEMO BUNDLE
Bundle Training, project 2305
=========================================

WHAT THIS IS
  The whole Tooling Intelligence CMS, running front-end only. Unzip it and
  open index.html.

  Everything runs in the browser. There is no server, no database and no
  network request of any kind, so it works from a static host, from a
  Storyline Web Object, or straight off a local disk.

UPLOADING IT
  Upload the zip and point the host at index.html. Every path inside is
  relative, so it does not matter which folder it unpacks into.

  For a Storyline Web Object, insert the unzipped folder as the Web Object
  source and Storyline will pick up index.html on its own.

WHAT IS IN IT
  index.html                     Configurations, the CMS home page
  sequences.html                 the sequence builder
  player.html                    the preview player
  data/configs.js                the four configs as they stood on 3 Sep 2026
  data/sequences.js              the three worked example sequences
  shared/catalogue.js            36 products across 6 categories
  shared/event-types.js          the 15 event types and their parameters
  shared/sequence-validator.js   the rules, shared by the pages
  shared/offline-api.js          answers the API calls locally, demo only
  ti-logo.png

WHAT WORKS
  All three pages work fully, and the nav moves between them. On
  Configurations you can create, edit and delete the four-field configs. In
  the builder you can assemble a sequence, reorder it, edit the on-screen
  copy and watch it validate. In the player you can play any of it back.

WHAT DOES NOT
  Saving. Anything you create or change is kept in your own browser's storage,
  not on a server. It survives a page reload but nobody else can see it, and
  it is gone if the browser's site data is cleared. In the real CMS this is
  Node plus SQLite, and Storyline fetches a config or a sequence by User ID.

  The configs shown are a snapshot of the live service from 3 September 2026,
  not a live view of it.

  The Storyline runtime and the variable bridge are not built. The preview's
  right-hand panel is the specification for them.

  Product thumbnails are placeholder line drawings. Real photographs would
  come from Tooling Intelligence.

REBUILDING IT
  This bundle is generated, not hand-maintained. From the repo root:

      python3 static/build.py

  That reads public/ and shared/, applies the offline shim, and writes
  static/dist/. Edit the real pages, not the bundle.
