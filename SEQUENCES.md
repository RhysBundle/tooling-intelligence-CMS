# Sequence builder

Proof of concept for Tooling Intelligence's September 2026 ask: a unique,
unlimited-length, ordered sequence of events per customer, picked from a library
of event types, with editable on-screen copy per event instance.

Nothing here changes the shipped four-field CMS. `user_configs` and its
`/api/config` endpoints are untouched, so the live Storyline module keeps
working exactly as it does today whether a sequence exists or not.

(Since Oct 2026 `user_configs` also has three optional columns for the HTML
demo's device screens: `theme_colour`, `button_colour` and `logo`, checked by
`shared/theme.js`. The server adds them to an existing database on start. The
four original fields and their endpoints behave as before.)

## What is here

| File | What it does |
| --- | --- |
| `shared/catalogue.js` | The product catalogue. 36 products across 6 categories, with part numbers, quantities, units of issue, device types, menu numbers and door codes. |
| `shared/event-types.js` | The event catalogue. 15 event types, their parameters, their editable copy fields and character limits, and which assets already exist. |
| `shared/sequence-validator.js` | The rules. Shared by the browser and the API so the two cannot disagree. |
| `public/sequences.html` | The builder. Event library grouped by stage, ordered step list, drag or arrow reorder, duplicate, per-step parameters and copy, live validation, run time. |
| `public/player.html` | The preview. Rebuilds the real device screens at 1024x768 and scales them, shows the two 3D bookends as clip frames, marks both handover seams, and shows the Storyline variables each step would push. |
| `examples/steuart-example-sequences.json` | Three worked sequences built from TI's own examples. These are the acceptance cases. |
| `test/validator.test.js` | 50 tests over the rules, the stages, run time, the event catalogue and the product catalogue. `npm test`. |
| `test/seed-examples.js` | Loads the worked examples into a running server. `npm run seed:examples`. |

## Running it

```
npm install
npm start
npm test
npm run seed:examples
```

Then `http://localhost:3000/sequences.html` and
`http://localhost:3000/player.html?user=TI_EXAMPLE_2`.

To seed a deployed instance: `node test/seed-examples.js https://your-host`.

## API

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api/event-types` | The catalogue and limits, so no client hardcodes them |
| GET | `/api/sequences` | List |
| GET | `/api/sequence/:userId` | One sequence. This is what the player and Storyline fetch |
| POST | `/api/sequence` | Create. 400 with per-step reasons if invalid, 409 if one exists |
| PUT | `/api/sequence/:userId` | Replace. Reordering is a PUT with the steps in the new order |
| DELETE | `/api/sequence/:userId` | Delete. Leaves the user's four-field config alone |
| POST | `/api/sequence/validate` | Dry run, returns errors and warnings without storing |

A stored sequence looks like this:

```json
{
  "user_id": "TI_EXAMPLE_1",
  "name": "Example 1 - single cutting tool take",
  "playback_mode": "auto",
  "default_dwell_ms": 3000,
  "steps": [
    {
      "type": "login_method",
      "params": { "method": "rfid" },
      "text": { "prompt": "Present your badge" },
      "dwell_ms": 3500
    }
  ]
}
```

## The preview matches the SCORM package

The player is not a generic mockup. Each screen is rebuilt from the existing
SCORM package screenshots, at 1024x768, then scaled with a CSS transform, so
proportions, font sizes and spacing hold at any container width rather than
drifting as the card resizes.

Screens covered: Login Allocation Code, Product Allocation Code (both barcode
entry and select-from-list), Loan Period, Select Product as a scrolling result
list, Product Category, the Take screen with Current Quantity and Enter
Quantity, the Take/Return knob screen, the door-open beat, the handheld scanner
cradle, a Scale location, the information window, Return and check-in,
transaction confirmation and logout.

The User Login screen is not in this list, because on this architecture it
belongs to the 3D clip. The player shows the two clips as film frames rather
than screens, and captions both handover seams so the architecture is visible
in a demo.

The logo in the title bar is Tooling Intelligence's, not SupplyPro's. Jamie
asked for this in January and it applies here too. Product thumbnails are
neutral line drawings by product type; real photographs would come from TI.

## The product catalogue

Sequences reference catalogue ids, they do not carry typed product names. Name,
part number, unit of issue, current quantity, device type, menu number and door
code are all resolved from `shared/catalogue.js`, which is how the real screens
derive them, and it means the Take screen's "Open location door A-C002." line
writes itself.

Eight products are read straight off the SCORM screens with their exact names
and part numbers, marked `source: 'scorm'`:

| Part number | Product |
| --- | --- |
| 2HCE 0006 001 S04 | 0.06mm 3 Flute Standard Length End Mills for Steel |
| TI-032-8 | Diamond Tipped Tile Drill Bit |
| TI-011-1 | 1000g Calibration Weights Set |
| TI-054-0 | 10mm Washer |
| TI-017-3 | 20mm Carbide Drill Tip |
| TI-203 | 25mm Thru Coolant Drilling Assembly |
| RB-011 | Ultra-Performance Compression Flush Trim Router Bit |
| INSP. | M10 x 3 Screw Plug Gauge |

Drilling Tools, Machine Tools and Inspection are the three categories the SCORM
Product Category screen shows. Fasteners, PPE and Abrasives exist because
Steuart's event list names those product types.

The rest is filler, and the filler earns its place. Six rows fill the result
panel on the real screen, so every category carries at least six products and a
tested rule keeps it that way. A narrow search pads out the same way: matches
first, then the rest of the matches' own categories, then everything else, so
searching "Router" lands on the router bit highlighted at the top of a full
Machine Tools listing rather than a single lonely row. A one-result search looks
fake in front of a prospect.

One correction: the SCORM screen spells it "Ultra-Perfomance". The catalogue
uses the correct spelling. Say if you want it to match the existing asset
exactly instead.

## Why "unlimited" is not literally unlimited

TI asked for unlimited sequences. Implemented as unbounded length with rules,
because without them TI can build a nonsense sequence and send it to a
prospect, which is a risk to their brand as much as ours. The rules:

- must start with a log in, and log in cannot appear again
- nothing may follow log out, because log out is the handback to Storyline
- cannot take, return, check in or enter a quantity before a product is selected
- cannot select a product before a search
- every parameter must come from its own enum
- editable copy must be non-empty and inside its character limit, or it
  overflows the fixed device screen
- per-step dwell between 500 and 30000 ms
- 60 steps is the practical ceiling, raise it if TI ask
- over two and a half minutes of run time warns, it does not block

Repeats are explicitly allowed, because the product-kit case needs the same
physical take four times over. That is `TI_EXAMPLE_2`.

## The architecture, and why nothing multiplies any more

A sequence has three parts:

1. **3D** — the approach and the physical login action, ending on a still of
   the device screen. One clip per login method.
2. **Web Object** — every screen from post-login through to log out. No 3D in
   here at all.
3. **3D** — the closing sequence, entered when log out fires.

The physical acts the operator performs (opening a pocket lid and taking the
item, lifting a scanner off its cradle, weighing on a Scale) are represented by
**what the device screen shows while they happen**, not by a render of the hand.
`open_pocket_take` is a door-open screen the device holds while the operator
reaches in. `handheld_scanner_cradle` is a cradle-released screen.
`scale_transaction` is a weight reading.

That is the whole point of the change. Nothing in a sequence multiplies by
product type or hardware type, so a sequence costs its two bookend clips and
nothing else. A test enforces it: no event type may take a `product_type` or
`hardware` parameter, because either one reintroduces the multiplication.

The only 3D asset a sequence can be missing is the login clip, and only for
fingerprint. RFID, barcode, typed and typed with password already exist.

## What the CMS shows instead of render counts

Run time and screen count, because the question is now whether a prospect will
sit through the sequence, not what it costs to render. Duration comes from the
per-step dwells and excludes the two bookends, since their length is the length
of the video clips and those live outside the CMS. Past two and a half minutes
the builder warns.

The worked examples run 24s, 33s and 37s of Web Object time.

## What the login clip costs you

Because the clip covers the login screen, the per-customer welcome message from
the January build has nowhere to live. The clip is the same for every customer
on a given login method, so the copy on that screen is burnt into the video.

If TI want the welcome message customisable, the fix is to let the Web Object
load one screen earlier, over the clip's closing still, and render the login
screen itself. That is the seam discipline already in the plan: overlay on a
still, never over live video. Worth deciding before any of this is quoted.

## Storyline side, not built here

The player's right-hand panel shows the variables a Web Object would push on
each advance. The one Storyline branches on is `seq_stage`, which is `3d` for
the login step and `webobject` for everything after, with `seq_handback` firing
on log out. The rest are `seq_step_index`, `seq_step_type`, `seq_step_dwell`,
`seq_param_*`, `seq_text_*`, `seq_product_*` and `seq_complete`.

Storyline has no loops or arrays, so the sequence runs as a step-index state
machine driven from JS. Because everything between the bookends is one
persistent Web Object on one slide, the iframe is never destroyed and reloaded
mid-sequence, which was the other reason for this architecture. That runtime and
the bridge are the next piece of work, not part of this proof of concept.

## Not addressed here

- No auth. Every endpoint is open, same as the existing config endpoints.
- Storage inherits the existing sql.js file approach and its Render disk question.
- The product catalogue is not modelled. `select_product` takes a typed name,
  which is enough for a demo but a real search needs filler products per
  category or one result looks fake.
