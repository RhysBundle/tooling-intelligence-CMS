# TI product demo, HTML player

Replaces the Storyline file. Open `index.html` in Chrome or Edge, or serve the folder. No build step and no network needed. It also needs `../shared/` from the repo, for the product catalogue, the sequence rules and the customer colours.

## Flow so far

1. Title screen, Start button
2. User ID screen. Looks the ID up in the CMS when the demo is served over http(s), then in `data/configs.js`, ignoring case (see User IDs and the CMS).
3. Environment clip for the customer's `location`, ending on the two products
4. The hand-off to the product (see below). SupplySystem slides as SmartDrawer does for now, then its own zoom crossfades in.
5. The zoom and login clip for the customer's `solution` and `login_type`: one clip that zooms onto the screen and logs in (see Zoom and login clips).
6. Only where there is no such clip: the zoom on its own, then the device login screen in HTML on the zoom's last frame
   - Typed logins: the user ID is typed on the on-screen keyboard and Enter is pressed
   - Badge and barcode logins: the physical login clip plays
7. The customer's sequence from `data/sequences.js`, one device screen per step, with the take or return clip each time an item is taken out or put back (see below). A user ID with no sequence skips this.
8. Stub screen showing the loaded config, and whether its config and sequence came from the CMS or the demo's data files

URL options, for testing:

- `?userid=TI` pre-fills the ID
- `?mode=step` or `?mode=auto` overrides the sequence's playback mode
- `?tone=off` turns the render tone off (see Device screens)
- `?cursor=off` turns the cursor off (see The cursor)
- `?keyboard=off` types straight into fields instead of on the on-screen keyboard
- `?cms=http://localhost:3000/` looks user IDs up in that CMS instead of the one in `data/cms.js`; `?cms=off` uses the data files only

## Hosted on SAGA

https://saga.bundletraining.com/demos/tooling-intelligence/ serves this demo, built with `build-scorm.py --html` from the `demo-2.0` branch on GitHub. The server checks GitHub every minute and rebuilds when the branch moves, so a push is live within a minute or two. The CMS runs alongside it at `.../tooling-intelligence/cms/`, and the demo looks user IDs up there, so a user made or changed in that CMS works in the demo straight away, with no push. Setup notes are in the project's CLAUDE.md.

## User IDs and the CMS

`data/cms.js` says which CMS to ask: `cms/`, relative to `index.html`, which on SAGA is the CMS next to the demo. On Start, over http(s):

1. The demo asks the CMS for the ID's config (`api/config/<id>`). The CMS matches IDs case by case, so on a miss it checks the CMS's full list ignoring case, as the data files do.
2. If the CMS has the config, the demo asks for its sequence too (`api/sequence/<id>`).
3. Whatever the CMS hasn't got comes from `data/configs.js` and `data/sequences.js`. So an ID that is only in the data files (DEMO, BRANDED) still works, and a CMS user with no sequence there uses the data files' sequence of the same ID if there is one (STEUART on SAGA).
4. If the CMS can't be reached, or hasn't answered in 6 seconds, the data files are used. An ID that isn't in them then gets "We couldn't reach the CMS".

Submit shows "Checking..." while it asks. The stub at the end says where the config and the sequence came from.

From file:// there is no CMS lookup, so the data files are the only source, and the demo still runs offline. The same goes for any copy served somewhere without a CMS at `cms/` beside it: the lookup gets a 404 and the data files are used. For an offline per-customer package, set `window.TI_CMS = null` in `data/cms.js`.

A CMS sequence plays only if it passes the validator, as the data files' sequences do.

## Media

Every file is listed in `js/media.js`. A missing file shows a labelled placeholder, and a missing clip continues after 4 seconds.

| Slot | File | Status |
| --- | --- | --- |
| Title background | `video/intro-bg.mp4` (from `Intro-video-start.mp4`, 720p, loops) | Done |
| User ID background | none, CSS gradient | Done |
| Environments x6 | `video/env-*.mp4`, with `img/env-*-start.jpg` and `img/env-*-slide.jpg` | Done |
| SmartDrawer zoom and login, by login type | `video/zoom-login-smartdrawer-phase1-barcode.mp4`, `-rfid.mp4`, `-userid.mp4` (both typed logins), each with `img/*-start.jpg` and `img/*-end.jpg` | Phase 1 renders, cut by `tools/build-login-clips.py` |
| SupplySystem zoom and login, by login type | `video/zoom-login-supplysystem-barcode.mp4`, `-rfid.mp4`, `-userid.mp4` (both typed logins), each with `img/*-start.jpg` and `img/*-end.jpg` | The same |
| Login screen on log out | `img/login-bg.jpg`, from the device's `a7login.bmp` | Done |
| SmartDrawer ROUGH zoom and login | `video/zoom-login-smartdrawer-barcode.mp4`, `-rfid.mp4`, `-userid.mp4` | Unused since 9 Oct |
| SmartDrawer zoom | `video/zoom-smartdrawer.mp4` | Placeholder; only used without a zoom and login clip |
| SupplySystem zoom | `video/zoom-supplysystem.mp4` | Not needed while every login type has a zoom and login clip |
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

SupplySystem: the same, sliding left to the SupplyVend, once there are slide images with the right side extended (the SupplyVend stands about 200px right of centre, and the slide images only extend to the left). Until then a SupplySystem config (such as `Ferarri`) slides as SmartDrawer does, to the SmartDrawer (`slide_as` in `js/media.js`, Rhys, 9 Oct), and its own zoom and login clip, which starts on the SupplyVend, crossfades in from there. `stand_in` in `js/media.js` can still point one product at all of another's media; it is empty now.

The slide runs even when the computer has reduced motion turned on (Windows: animation effects off), because it is the content, not decoration.

## Zoom and login clips

`zoom_login` in `js/media.js` holds one clip per product and login type that zooms from the product onto its screen and logs in: RFID badge, barcode card, or the User ID typed on the on-screen keyboard. Both typed logins use the one typed clip. Where one exists it replaces the zoom, the HTML login screen and the login clip: the device layer goes on over its last frame, holds 600ms (`LANDED_MS`) and the sequence's first screen cuts in.

Since 9 Oct both products' come from the phase 1 renders in `GDrive-example/Videos/ActionVideos` (`SmartDrawer/SD_*_login.mp4`, `SupplyVend/CV_*` and `SV_UserID`). Each zooms onto the cabinet's screen in a grey studio, logs in and carries on into a whole phase 1 transaction, so `tools/build-login-clips.py` cuts each at the first moment after the login when the camera has settled and the hand is out of the frame:

| Product | Login | Ends at | On |
| --- | --- | --- | --- |
| SmartDrawer | RFID | 8.5s | Check in, for an item the clip has picked (the hand is on the screen until then) |
| SmartDrawer | Barcode | 7.6s | Select Product, after the device's Login Allocation Code screen |
| SmartDrawer | Typed | 10.5s | Login Allocation Code; the hand stays in the frame, so it is patched out |
| SupplySystem | RFID | 5.0s | Items checked out by you |
| SupplySystem | Barcode | 6.8s | Select Product, after the device's Login Allocation Code screen |
| SupplySystem | Typed | 9.3s | Select Product |

They end on a screen that has already moved on, so each has its own last frame (`end` in `js/media.js`) for the device layer to sit on. That last frame stays up for the whole sequence, so nothing in it may be part way through moving: where the hand's reflection is still in the glass under the screen, or on SmartDrawer's typed clip the hand itself rests at the bottom of the frame, the tool fades a patch in over the last few frames, of clean glass or of another clip's clean end on the same framing. Rerun the tool if any of these renders change.

The renders show the 1024x768 UI as it is, not widened. All three SmartDrawer clips end on one framing, the monitor at an angle; SupplySystem's RFID and typed clips end on one, square on, and its barcode clip's camera ends 43.9px higher. `screen` under `login_screen` in `js/media.js` gives the frame position of the UI's corners, fitted against the artwork to within 2px (SmartDrawer: `08_Search_4`, `08_Search_3`, `06_CheckIn_3`; SupplySystem: `15_Search_4`, `SupplySystem_Items`). demo.js lays `#screen` out at 1024x768 and maps it onto those corners with a CSS perspective transform, and puts the cursor's first place and the Next pill on it (`setGeometry`). SupplyVend's UI runs a few px past the artwork's edges, so there the HTML screen bleeds that far in the screen's own background.

Both renders tone the screen the same way, darker than the placeholder zoom and not a plain gamma (white comes out at 208, #3e3e3e at 30), so it is a curve of levels, set as an SVG table.

On log out the device goes back to its login screen, built in HTML like the others (`TIScreens.login`, as `08_Search_1`, on the device's own `a7login.bmp`) with the log out message in the welcome panel and the title bars' logo. None of the clips shows the login screen settled and hand-free, and the renders' says "Welcome to SmartDrawer" on both products and carries SupplyPro's logo.

The renders' login screen is readable as the camera arrives, before the login, so a SupplySystem demo shows "Welcome to SmartDrawer" for about a second, and the SmartDrawer barcode clip's last frame lists one product as "Device Type: SupplyVend" until the first screen covers it. Both are in the video.

SmartDrawer's ROUGH renders (`zoom-login-smartdrawer-barcode.mp4`, `-rfid.mp4`, `-userid.mp4`, from `.../ActionVideos/SmartDrawer/*_ROUGH.mp4`) are still in `assets/video`, unused. They zoom right into the screen, so it fills the frame, but end back on the login screen after logging in.

## Login screen

The old path, used only where a login type has no zoom and login clip, so not at present. The login screen is laid out in the 1920x1080 pixels of the placeholder zoom's last frame, then scaled to the stage. With no custom welcome message it uses that exact frame, so the cut from video to HTML is invisible. A config with `welcome_message` (line breaks as `\n`) uses `login-smartdrawer-clean.jpg`, the same frame with the text removed, and sets the text in Arimo (metric match for Arial). Checked against the render to within 1px.

Note that render's screen is a 16:9 version of the 1024x768 artwork: centred items stay centred, and items at the edges stay at the edges. The device screens below can be widened the same way, though the phase 1 renders used now need them as they are.

## The sequence

The sequence comes from the CMS or from `data/sequences.js` (see User IDs and the CMS). `data/sequences.js` holds one sequence per user ID, in the shape the CMS stores (see `SEQUENCES.md`), matched ignoring case. Before playing, the sequence is checked with the CMS's own validator, and one that breaks the rules is not played; the stub says why.

| User ID | Sequence |
| --- | --- |
| test1 | search "m10", select the M10 plug gauge, take, quantity 1, take clip, select it again, return, return clip, log out |
| Ferarri | the same on SupplySystem: its typed zoom and login and its take and return clips |
| DEMO | search, select the router bit, take, quantity 1, take clip, log out, after the typed login |
| STEUART | Steuart's Example 1 in full; its door-open step plays the take clip |
| TI | none, so the run stops after login as before |
| TI_EXAMPLE_1 | Steuart's Customer Example 1: typed login with password, three allocation codes (list, list, barcode), M10 gauge with quantity and take, then an end mill take (CNC machine shop) |
| TI_EXAMPLE_2 | Steuart's Customer Example 2: a product kit, one search and select, then four takes (warehouse, barcode) |
| TI_EXAMPLE_3 | Steuart's Customer Example 3: RFID login, three allocation codes, a lot managed dust mask with its lot number, take (SupplySystem, cleanroom) |
| BRANDED | test1's run, with a customer's colours and a placeholder logo on the screens (see Customer colours and logo) |

The three TI_EXAMPLE IDs are Steuart's own customer examples, step for step, from `examples/steuart-example-sequences.json`, for testers. His lists name the steps and login types only, so the products, search terms, prompts and lot number were chosen from the catalogue and the phase 1 screens. "Info window enter quantity" in Example 1 is the quantity screen. Their configs are in the demo, the local CMS and the SAGA CMS, not the live one.

The login is still driven by the config's `login_type`, so the sequence's own log in step is skipped. If the two name different methods, the config wins.

Each step:

1. Its screen cuts in, as screens do on the device.
2. Its arrival plays: 500ms to read, then the cursor presses anything that moves the device on first (Product Category), then it taps each field it types into and types on the on-screen keyboard (see below), or the device fills the field itself after 1.2s (a scan, a scale reading). 400ms later the results come up, then 600ms and the cursor moves to the row or knob it picks, which is highlighted.
3. It holds for its dwell from the CMS (default 3s), or in step-through mode until Next.
4. Its exit plays: the cursor moves to the button that leads on and clicks it (250ms), and the next step cuts in.

Every event type now has a screen or a clip. Both products use the same screens, as the phase 1 artwork for both is the same UI, laid out at its own 1024x768 and mapped onto the render's screen (see Zoom and login clips). `logout` shows the device's login screen in HTML (`TIScreens.login`).

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
- Laid out from the device's own `keyboard-international.bmp` and `keyboard-num.bmp` and checked against the artwork with `tools/screen-check.html` (keys within 1 to 2px). Widened like the other screens: the entry panel and key tray stretch, so the keys get wider, and the button groups and number pad stay on the right edge.
- The device puts the keyboard on concrete. Here it sits on the screens' own background colour, so a customer's `theme_colour` carries on under it, and pressed keys take their `button_colour`.
- Switch Keyboard, Clear, Backspace, Cancel and AltGr are drawn but never pressed.

### Take and return clips

Each time an item is taken out, the take clip plays, and each time one is put back, the return clip plays. The clip is chosen by the config's `solution`.

When it plays (`actionClipAfter` in `js/demo.js`):

- A take or return chosen on the knobs (`select_action`) plays its clip once its last screen is done: after the quantity's Continue if there is an `enter_quantity` step, otherwise after the knob is pressed.
- If the sequence has its own door step, `open_pocket_take` for a take or `check_in` for a return, that step is the clip instead, so it never plays twice. Each door step plays it, so Steuart's Example 2 (a kit of four) plays the take clip four times.
- A Scale step is done on screen, so a take or return through one has no clip.

The clip fades in on its own slide, as the login clip does, because it starts and ends at a different framing from the zoom. The next step's screen fades back in after it. The clip's length stands in for a door step's dwell, and step-through mode does not wait for Next during a clip.

Product details (name, part number, menu number, unit of issue, quantity, door code) come from `shared/catalogue.js`. A search that matches fewer than six products is padded with the rest of their categories, so the list never looks empty. Thumbnails are placeholder line drawings until TI send photos.

Step-through mode: Next sits in the middle of the device's title bar, the one place that is empty on every screen. The right arrow, Space, Enter and Page Down do the same.

## Device screens

`js/screens.js` builds each screen as HTML; `css/screens.css` lays it out. Positions are in the phase 1 artwork's own pixels (the 1024x768 UI). For the phase 1 renders used now, demo.js maps that straight onto the render's screen (see Zoom and login clips). For the placeholder zoom on the old login path they are widened to 16:9 the way that render widens the login screen: 1365.33 artwork px across instead of 1024, edge items keep their distance from their edge, centred items stay centred, and panels stretch between them, then scaled by 1080/768 into the 1920x1080 device layer.

Checked against the artwork with `tools/screen-check.html`, which shows a screen at the artwork's own 1024 width over the artwork it came from (difference view: black means a match). Text sizes and positions are within 1 to 2px, apart from a few places where the artwork itself is off: the action screen's Back label, the Take screen's two quantity labels, which are not aligned with each other, and the knob labels. The Product Category list ends above Return, as on the real device; the artwork runs it off the bottom of the panel. Open it from disk, or serve the 2305 folder so the artwork path resolves.

The screens use the system's Arial first, because the artwork is set in Arial, and fall back to the bundled Arimo, which has the same metrics but a few different glyphs (its "1" has a foot).

Render tone: the render changes the colours of the screen it shows. Next to the login artwork, its greys come out darker (#333 near black, #f4f4f4 as #eaeaea) and its reds duller. The HTML screens get the same change through an SVG filter in `index.html` (saturation 0.7, then a gamma or a curve of levels), so the cut from the zoom's last frame does not jump in brightness. The values are `tone` under `login_screen` in `js/media.js`, fitted to each render, so they need fitting again when the final renders land. `?tone=off` shows the screens in the artwork's own colours.

The logo on every screen is Tooling Intelligence's unless the config gives its own. The artwork has SupplyPro's, and one screen says "SupplyVend"; neither is copied.

### Customer colours and logo

Three optional config fields dress the device screens in a customer's brand. They are set in the CMS, on the Configurations page under Device screen branding, which has colour pickers, a logo upload and a preview. The demo gets them with the rest of the config from the CMS (see User IDs and the CMS), or from `data/configs.js`.

| Field | What it changes |
| --- | --- |
| `theme_colour` | the screen behind the white panel, the title bar, and under the keyboard |
| `button_colour` | every button, the line under the title bar, and pressed keys on the keyboard |
| `logo` | the logo in the title bar, in place of TI's. The CMS stores it as a data URI (SVG, PNG, JPEG or WebP, under 500 KB), which works as it is in `configs.js`. A path from the demo folder works too; keep those files in `assets/img/logos/` |

Colours are hex, such as `'#3d6b99'`. The device's gradients and edges are worked out from the one colour, in the same steps as its own red and grey, and text turns dark on a light colour. That is `shared/theme.js`, which the CMS also uses to check the fields and draw its preview, so the two agree. Leave a field out, or give something that is not a hex code, and the device's own colour stays.

The logo fits the box TI's fills: 45px high in artwork px, up to 420px wide, from the right. PNG with transparency or SVG works best, white or light for a dark title bar. A logo that doesn't load shows a dashed box saying "Logo not found" with the path, so a typo shows rather than falling back to TI's. `assets/img/logos/sample-logo.svg` is a placeholder for the BRANDED test config.

What stays as it is:

- The render tone applies to the customer's colours as it does to the device's, so they show darker and duller than the hex. `?tone=off` shows them as given.
- The zoom and login clip is the render's own, so it keeps the device's red and grey and SupplyPro's logo. The colours change when the first screen after login cuts in. The log out screen is HTML but sits on the device's own login background, so only its logo and Enter button take the customer's branding.
- The knob icons, the red X on FIND, the T and R pips, the message box's lavender and the blue picked outline are the device's own signals, not its theme, so they don't change.

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
data/configs.js    customer configs, used when the CMS hasn't got the ID
data/sequences.js  customer sequences, the same
data/cms.js        which CMS to look user IDs up in
assets/            fonts (Open Sans, Arimo), logo, video, img
tools/             build-slides.py, pan-fit.json, build-login-clips.py, screen-check.html; not packaged
../shared/         catalogue.js, event-types.js, sequence-validator.js, theme.js, from the CMS
```

`build-scorm.py` packs `../shared/` into `shared/` in the zip and rewrites the four script paths in the packed `index.html`, so the package stands alone.

`python build-scorm.py --html` makes the same zip without the SCORM manifest, with `index.html` at the root, for a plain web host such as SAGA. Both stop if a file is asked for in a different case from its name (Windows forgives that, a web host does not), and list the media slots that have no file yet.
