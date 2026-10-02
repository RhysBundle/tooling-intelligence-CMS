# TI product demo, HTML player

Replaces the Storyline file. Open `index.html` in Chrome or Edge, or serve the folder. No build step and no network needed.

## Flow so far

1. Title screen, Start button
2. User ID screen. Checks the ID against `data/configs.js`, ignoring case.
3. Environment clip for the customer's `location`, ending on the two products
4. The hand-off to the product (see below)
5. Zoom onto the screen for the customer's `solution`
6. Device login screen in HTML, sitting on the zoom clip's last frame
   - Typed logins: the user ID is typed in and Enter is pressed
   - Badge and barcode logins: the physical login clip plays
7. Stub screen showing the loaded config

`?userid=TI` on the URL pre-fills the ID, for testing.

## Media

Every file is listed in `js/media.js`. A missing file shows a labelled placeholder, and a missing clip continues after 4 seconds.

| Slot | File | Status |
| --- | --- | --- |
| Title background | `video/intro-bg.mp4` (from `Intro-video-start.mp4`, 720p, loops) | Done |
| User ID background | none, CSS gradient | Done |
| Environments x6 | `video/env-*.mp4`, with `img/env-*-start.jpg` and `img/env-*-slide.jpg` | Done |
| SmartDrawer zoom | `video/zoom-smartdrawer.mp4` | Placeholder |
| SupplySystem zoom | `video/zoom-supplysystem.mp4` | Needed |
| RFID login | `video/login-rfid.mp4` | Needed |
| Barcode login | `video/login-barcode.mp4` | Needed |

The files in `assets/` are web copies of the originals in `GDrive-example/Videos`: H.264, CRF 22, audio removed (the zoom clip's audio track was silent), faststart. Stills converted from PNG to JPEG.

## Hand-off from the environment to the zoom

All on one slide (`#slide-scene`), as layers:

1. The environment clip plays and ends on the two products.
2. The slide image fades in over the last frame (200ms). Its right 1920px are the exact `*_End.png`, so nothing moves.
3. Hold 300ms.
4. The image slides right over 1.5s until the SmartDrawer cabinet is centred. The left side comes from the extended images in `2305_Product Demo_Screen Artwork/SupplyDrawer`.
5. Hold 200ms, then the zoom clip fades in over 500ms and plays. `11_Smartdraw_ZoomIn.mp4` is a placeholder; the real zoom should start from the framing in `Claude outputs/zoom-start-frames/`.

`tools/build-slides.py` builds `assets/img/env-*-slide.jpg` and works out `ext` and `slide_by` for `js/media.js`. The extended images are not pixel copies of the End frames (each is rescaled by 0.1 to 0.6 percent and shifted by part of a pixel, and the F1 one is about 7 levels darker), so the tool registers each one to its End frame, resamples and colour-matches the extension, and feathers it into the exact End.png over 96px. Rerun it if any render changes.

SupplyVend: the same, sliding left, once there are images with the right side extended and a SupplyVend zoom clip. Until then SupplySystem configs (such as `test1`) use the SmartDrawer slide, zoom and login screen as a stand-in; see `stand_in` in `js/media.js`.

The slide runs even when the computer has reduced motion turned on (Windows: animation effects off), because it is the content, not decoration.

## Device screen

The login screen is laid out in the 1920x1080 pixels of the zoom clip's last frame, then scaled to the stage. With no custom welcome message it uses that exact frame, so the cut from video to HTML is invisible. A config with `welcome_message` (line breaks as `\n`) uses `login-smartdrawer-clean.jpg`, the same frame with the text removed, and sets the text in Arimo (metric match for Arial). Checked against the render to within 1px.

Note the render's screen is a 16:9 version of the 1024x768 artwork: centred items stay centred, and items at the edges stay at the edges. Later screens built from the artwork need the same treatment to line up.

## Layout

The stage is fixed at 1280x720 and scales to fit the window, like the Storyline player. Positions are in px on that stage. Keep it that way.

```
index.html       slides
css/demo.css     all styling, fonts bundled locally
js/scorm.js      SCORM 1.2 wrapper, does nothing outside an LMS
js/media.js      every video and still
js/demo.js       scaling, slide changes, user ID, the run
data/configs.js  customer configs (the CMS export will replace this)
assets/          fonts (Open Sans, Arimo), logo, video, img
```
