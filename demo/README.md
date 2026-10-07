# TI product demo, HTML player

Replaces the Storyline file. Open `index.html` in Chrome or Edge, or serve the folder. No build step and no network needed. It also needs `../shared/` from the repo, for the product catalogue and the sequence rules.

## Flow so far

1. Title screen, Start button
2. User ID screen. Checks the ID against `data/configs.js`, ignoring case.
3. Environment clip for the customer's `location`, ending on the two products
4. The hand-off to the product (see below)
5. The zoom and login clip for the customer's `login_type`: one clip that zooms onto the screen, logs in and ends on the login screen's frame. SupplySystem configs use SmartDrawer's for now (see `stand_in`).
6. Only where there is no such clip: the zoom on its own, then the device login screen in HTML on the zoom's last frame
   - Typed logins: the user ID is typed on the on-screen keyboard and Enter is pressed
   - Badge and barcode logins: the physical login clip plays
7. The customer's sequence from `data/sequences.js`, one device screen per step, with the take or return clip each time an item is taken out or put back (see below). A user ID with no sequence skips this.
8. Stub screen showing the loaded config

URL options, for testing:

- `?userid=TI` pre-fills the ID
- `?mode=step` or `?mode=auto` overrides the sequence's playback mode
- `?tone=off` turns the render tone off (see Device screens)
- `?cursor=off` turns the cursor off (see The cursor)
- `?keyboard=off` types straight into fields instead of on the on-screen keyboard

## Hosted on SAGA

https://saga.bundletraining.com/demos/tooling-intelligence/ serves this demo, built with `build-scorm.py --html` from the `demo-2.0` branch on GitHub. The server checks GitHub every minute and rebuilds when the branch moves, so a push is live within a minute or two. The CMS runs alongside it at `.../tooling-intelligence/cms/`. Setup notes are in the project's CLAUDE.md.

## Media

Every file is listed in `js/media.js`. A missing file shows a labelled placeholder, and a missing clip continues after 4 seconds.

| Slot | File | Status |
| --- | --- | --- |
| Title background | `video/intro-bg.mp4` (from `Intro-video-start.mp4`, 720p, loops) | Done |
| User ID background | none, CSS gradient | Done |
| Environments x6 | `video/env-*.mp4`, with `img/env-*-start.jpg` and `img/env-*-slide.jpg` | Done |
| SmartDrawer zoom and login, by login type | `video/zoom-login-smartdrawer-barcode.mp4`, `-rfid.mp4`, `-userid.mp4` (both typed logins), each with `img/*-start.jpg` | ROUGH renders |
| SmartDrawer zoom | `video/zoom-smartdrawer.mp4` | Placeholder; only used without a zoom and login clip |
| SupplySystem zoom, or zoom and login | `video/zoom-supplysystem.mp4` | Needed |
| RFID login | `video/login-rfid.mp4` | Only used without a zoom and login clip, so not at present |
| Barcode login | `video/login-barcode.mp4` | The same |
| SmartDrawer take and return | `video/take-smartdrawer.mp4`, `video/return-smartdrawer.mp4`, each with `img/*-start.jpg` | Done |
| SupplySystem take and return | `video/take-supplysystem.mp4`, `video/return-supplysystem.mp4`, each with `img/*-start.jpg` | Done |

The files in `assets/` are web copies of the originals in `GDrive-example/Videos`: H.264, CRF 22, audio removed (the zoom and action clips' audio tracks were silent), faststart. Stills converted from PNG to JPEG. The take and return clips come from `Videos/ActionVideos/Adjusted`: `*TakeOut.mp4` is take, `*CheckIn.mp4` is return, and `SupplyVend*` is SupplySystem.

## Hand-off from the environment to the zoom

All on one slide (`#slide-scene`), as layers:

1. The environment clip plays and ends on the two products.
2. The slide image fades in over the last frame (200ms). Its right 1920px are the exact `*_End.png`, so nothing moves.
3. Hold 300ms.
4. The image slides right over 1.5s until the SmartDrawer cabinet is centred. The left side comes from the extended images in `2305_Product Demo_Screen Artwork/SupplyDrawer`.
5. Hold 200ms, then the zoom clip fades in over 500ms and plays. `11_Smartdraw_ZoomIn.mp4` is a placeholder; the real zoom should start from the framing in `Claude outputs/zoom-start-frames/`.

`tools/build-slides.py` builds `assets/img/env-*-slide.jpg` and works out `ext` and `slide_by` for `js/media.js`. The extended images are not pixel copies of the End frames (each is rescaled by 0.1 to 0.6 percent and shifted by part of a pixel, and the F1 one is about 7 levels darker), so the tool registers each one to its End frame, resamples and colour-matches the extension, and feathers it into the exact End.png over 96px. Rerun it if any render changes.

SupplyVend: the same, sliding left, once there are images with the right side extended and a SupplyVend zoom clip. Until then SupplySystem configs (such as `Ferarri`) use the SmartDrawer slide, zoom and login screen as a stand-in; see `stand_in` in `js/media.js`.

The slide runs even when the computer has reduced motion turned on (Windows: animation effects off), because it is the content, not decoration.

## Zoom and login clips

`zoom_login` in `js/media.js` holds one clip per product and login type that zooms from the product onto its screen and logs in: barcode card, RFID badge, or the User ID typed on the on-screen keyboard (shown as ****), each followed by the device's Login Allocation Code screen. Where one exists it replaces the zoom, the HTML login screen and the login clip. All three end on exactly the zoom's last frame (`zoom-smartdrawer-end.jpg`, within 2 levels of 255), so the device layer goes on over it, holds 600ms (`LANDED_MS`) and the sequence's first screen cuts in.

They are ROUGH renders from `GDrive-example/Videos/ActionVideos/SmartDrawer`. Like the placeholder zoom, they start on the SmartDrawer in a grey studio, so the crossfade from the environment's slide image changes background. They end on the login screen even though the clip has logged in. The UserIDPassword file there is a copy of UserID, so both typed logins use one clip.

## Login screen

The login screen is laid out in the 1920x1080 pixels of the zoom clip's last frame, then scaled to the stage. With no custom welcome message it uses that exact frame, so the cut from video to HTML is invisible. A config with `welcome_message` (line breaks as `\n`) uses `login-smartdrawer-clean.jpg`, the same frame with the text removed, and sets the text in Arimo (metric match for Arial). Checked against the render to within 1px.

Note the render's screen is a 16:9 version of the 1024x768 artwork: centred items stay centred, and items at the edges stay at the edges. The device screens below are built the same way.

## The sequence

`data/sequences.js` holds one sequence per user ID, in the shape the CMS stores (see `SEQUENCES.md`), matched ignoring case. The CMS export will replace it. Before playing, the sequence is checked with the CMS's own validator, and one that breaks the rules is not played; the stub says why.

| User ID | Sequence |
| --- | --- |
| test1 | search "m10", select the M10 plug gauge, take, quantity 1, take clip, select it again, return, return clip, log out |
| Ferarri | the same, so it shows the SupplySystem clips (the screens are SmartDrawer stand-ins) |
| DEMO | search, select the router bit, take, quantity 1, take clip, log out, after the typed login |
| STEUART | Steuart's Example 1 in full; its door-open step plays the take clip |
| TI | none, so the run stops after login as before |
| TI_EXAMPLE_1 | Steuart's Customer Example 1: typed login with password, three allocation codes (list, list, barcode), M10 gauge with quantity and take, then an end mill take (CNC machine shop) |
| TI_EXAMPLE_2 | Steuart's Customer Example 2: a product kit, one search and select, then four takes (warehouse, barcode) |
| TI_EXAMPLE_3 | Steuart's Customer Example 3: RFID login, three allocation codes, a lot managed dust mask with its lot number, take (SupplySystem, cleanroom) |

The three TI_EXAMPLE IDs are Steuart's own customer examples, step for step, from `examples/steuart-example-sequences.json`, for testers. His lists name the steps and login types only, so the products, search terms, prompts and lot number were chosen from the catalogue and the phase 1 screens. "Info window enter quantity" in Example 1 is the quantity screen. Their configs are in the demo, the local CMS and the SAGA CMS, not the live one.

The login is still driven by the config's `login_type`, so the sequence's own log in step is skipped. If the two name different methods, the config wins.

Each step:

1. Its screen cuts in, as screens do on the device.
2. Its arrival plays: 500ms to read, then the cursor presses anything that moves the device on first (Product Category), then it taps each field it types into and types on the on-screen keyboard (see below), or the device fills the field itself after 1.2s (a scan, a scale reading). 400ms later the results come up, then 600ms and the cursor moves to the row or knob it picks, which is highlighted.
3. It holds for its dwell from the CMS (default 3s), or in step-through mode until Next.
4. Its exit plays: the cursor moves to the button that leads on and clicks it (250ms), and the next step cuts in.

Every event type now has a screen or a clip. All screens are SmartDrawer's; SupplySystem uses them as stand-ins.

| Event type | Screen | Built from | What moves |
| --- | --- | --- | --- |
| `product_search` (typed) | Select Product list | 08_Search_4, 05_CheckOut_6 | the query types into FIND, then the list narrows to the results |
| `product_search` (category) | Select Product, then Product Category | 08_Search_5, 5B, and the reference video | Product Category is pressed, then the category is picked and pressed |
| `select_product` | Select Product list, with the search's query and results | 08_Search_4 | the product's row is picked, then pressed |
| `select_action` | Take and Return knobs | 05_CheckOut_7 | the chosen knob is picked, then pressed |
| `enter_quantity` | Take, with current quantity and door line | 08_Search_7 | the quantity types in, then Continue is pressed |
| `login_allocation_code`, `product_allocation_code` | the code list, with the step's prompt as its heading | 08_Search_3, 3A | a code is picked, then Next is pressed; with barcode entry the code scans into FIND and the list narrows to it |
| `display_loan_period` | message box: "Must be returned in 7 days." | 05_CheckOut_9, Message.bmp | OK is pressed |
| `info_window` | message box with the step's title and body | the same | OK is pressed |
| `transaction_confirmation` | message box with the step's message | the same | OK is pressed |
| `handheld_scanner_cradle` | instruction screen: the product, the step's message, Back | 05_CheckOut_8 | nothing; the device moves on by itself |
| `scale_transaction` | instruction screen with the device's scale icon and a Weight field | 05_CheckOut_8, small-scale-*.bmp | the icon shakes red, then the weight comes up and it turns green |
| `open_pocket_take`, `check_in` | the take or return clip | | see below |
| `logout` | the login screen again, with the farewell message in the welcome panel | | Logout is pressed on the screen before |

The phase 1 artwork has no screen for the scanner cradle or the Scale, so those two follow its instruction screen. The allocation codes are the work areas on 08_Search_3 (C26, K5, K6), because the CMS has no list of codes. The first prompt of a kind picks C26, the next K5, the next K6, so a run of prompts doesn't repeat itself. The loan period box uses the device's own wording, so the step's Title is not shown.

Picked rows on the new list screens (allocation codes, categories) use the grey band from the artwork. The Select Product list and the knobs still use the blue outline added before the artwork with a picked state turned up.

`placeholder()` in `js/screens.js` is still there for any event type added to the CMS later: a labelled "Screen not built yet" panel for its dwell, so a whole sequence can still be reviewed.

Reference: `GDrive-example/Videos/ActionVideos/*.MOV` are phone videos of the real SmartDrawer and SupplySystem (checkout, take button, check-in, barcode check-in, category search). `GDrive-example/2305_Product Demo_Screen Artwork/SourceIcons-etc` holds the device software's own bitmaps at 1024x768 scale; the scale icons in `assets/img/scale-*.png` come from there.

### The cursor

An arrow cursor shows what the automatic screens do: it moves to each field before it is typed into, to the row or knob being picked, and to each button before it is pressed, and clicks with a blue ring. The typed login uses it too, for the User ID field and Enter.

- A move takes 350 to 900ms, longer the further it goes (`MOVE_*` at the top of `js/demo.js`).
- It first shows low on the panel, the first time it is needed. It goes when a take or return clip starts, as the operator walks to the drawer, and shows again from the same place after it. It goes after Logout is pressed.
- It sits outside the device screen, so the render tone does not touch it, and it moves even with reduced motion turned on, because it is part of the content.

### The on-screen keyboard

Typing goes as it does on the device and in the reference videos: the cursor taps the field, the keyboard takes over the screen, each key is pressed in turn and shows red, then the Enter beside Cancel, and the screen comes back with the text in its field.

- FIND and the typed login use the keyboard (05_CheckOut_5, 05_CheckOut_2, the login one labelled User ID). Enter Quantity uses the number pad (09_TakeButton_7).
- A capital is typed with Shift, a run of capitals with Caps Lock, which stays red while it is on; the letter keys show capitals while either is on. A character with no key on the keyboard still appears.
- Key to key moves take 160 to 420ms and a key shows pressed for 150ms (`KEY_*` in `js/demo.js`), so typing "Router" takes about 4s from the tap to the screen coming back.
- Laid out from the device's own `keyboard-international.bmp` and `keyboard-num.bmp` and checked against the artwork with `tools/screen-check.html` (keys within 1 to 2px). Widened like the other screens: the entry panel and key tray stretch, so the keys get wider, and the button groups and number pad stay on the right edge. The concrete is `assets/img/keyboard-bg.jpg`, made from the empty part of `keyboard-num.bmp`, mirrored to fill the screen.
- Switch Keyboard, Clear, Backspace, Cancel and AltGr are drawn but never pressed.

### Take and return clips

Each time an item is taken out, the take clip plays, and each time one is put back, the return clip plays. The clip is chosen by the config's `solution`, so SupplySystem customers get the SupplySystem clips even while their screens use the SmartDrawer stand-ins.

When it plays (`actionClipAfter` in `js/demo.js`):

- A take or return chosen on the knobs (`select_action`) plays its clip once its last screen is done: after the quantity's Continue if there is an `enter_quantity` step, otherwise after the knob is pressed.
- If the sequence has its own door step, `open_pocket_take` for a take or `check_in` for a return, that step is the clip instead, so it never plays twice. Each door step plays it, so Steuart's Example 2 (a kit of four) plays the take clip four times.
- A Scale step is done on screen, so a take or return through one has no clip.

The clip fades in on its own slide, as the login clip does, because it starts and ends at a different framing from the zoom. The next step's screen fades back in after it. The clip's length stands in for a door step's dwell, and step-through mode does not wait for Next during a clip.

Product details (name, part number, menu number, unit of issue, quantity, door code) come from `shared/catalogue.js`. A search that matches fewer than six products is padded with the rest of their categories, so the list never looks empty. Thumbnails are placeholder line drawings until TI send photos.

Step-through mode: Next sits in the middle of the device's title bar, the one place that is empty on every screen. The right arrow, Space, Enter and Page Down do the same.

## Device screens

`js/screens.js` builds each screen as HTML; `css/screens.css` lays it out. Positions are in the phase 1 artwork's own pixels (the 1024x768 UI), then widened to 16:9 the way the render widens the login screen: 1365.33 artwork px across instead of 1024, edge items keep their distance from their edge, centred items stay centred, and panels stretch between them. The result is scaled by 1080/768 into the 1920x1080 device layer.

Checked against the artwork with `tools/screen-check.html`, which shows a screen at the artwork's own 1024 width over the artwork it came from (difference view: black means a match). Text sizes and positions are within 1 to 2px, apart from a few places where the artwork itself is off: the action screen's Back label, the Take screen's two quantity labels, which are not aligned with each other, and the knob labels. The Product Category list ends above Return, as on the real device; the artwork runs it off the bottom of the panel. Open it from disk, or serve the 2305 folder so the artwork path resolves.

The screens use the system's Arial first, because the artwork is set in Arial, and fall back to the bundled Arimo, which has the same metrics but a few different glyphs (its "1" has a foot).

Render tone: the render changes the colours of the screen it shows. Next to the login artwork, its greys come out darker (#333 near black, #f4f4f4 as #eaeaea) and its reds duller. The HTML screens get the same change through an SVG filter in `index.html` (saturation 0.7, then gamma 2.2), so the cut from the zoom's last frame does not jump in brightness. The values are `tone` under `login_screen` in `js/media.js`, fitted to the placeholder zoom, so they need fitting again when the real zoom lands. `?tone=off` shows the screens in the artwork's own colours.

The logo on every screen is Tooling Intelligence's. The artwork has SupplyPro's, and one screen says "SupplyVend"; neither is copied.

## Layout

The stage is fixed at 1280x720 and scales to fit the window, like the Storyline player. Positions are in px on that stage. Keep it that way.

```
index.html         slides
css/demo.css       all styling except the device screens, fonts bundled locally
css/screens.css    the device screens
js/scorm.js        SCORM 1.2 wrapper, does nothing outside an LMS
js/media.js        every video and still
js/screens.js      the device screens, one per event type
js/demo.js         scaling, slide changes, user ID, the run, the sequence
data/configs.js    customer configs (the CMS export will replace this)
data/sequences.js  customer sequences (the CMS export will replace this)
assets/            fonts (Open Sans, Arimo), logo, video, img
tools/             build-slides.py, pan-fit.json, screen-check.html; not packaged
../shared/         catalogue.js, event-types.js, sequence-validator.js, from the CMS
```

`build-scorm.py` packs `../shared/` into `shared/` in the zip and rewrites the three script paths in the packed `index.html`, so the package stands alone.

`python build-scorm.py --html` makes the same zip without the SCORM manifest, with `index.html` at the root, for a plain web host such as SAGA. Both stop if a file is asked for in a different case from its name (Windows forgives that, a web host does not), and list the media slots that have no file yet.
