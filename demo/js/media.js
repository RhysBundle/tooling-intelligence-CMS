/*
 * Media for the demo. Every video and still is listed here.
 *
 * To add or swap a file, change the path below. A missing file shows a
 * labelled placeholder, so the flow can be reviewed before renders exist.
 *
 * Source files are in GDrive-example/Videos. The copies in assets/ are
 * re-encoded for web (H.264, CRF 22, no audio, faststart) and the PNG stills
 * converted to JPEG.
 */
window.TI_MEDIA = {
  // Slide 1 background. From GDrive-example/Videos/Intro-video-start.mp4,
  // scaled to 720p (it sits under the blue tint), loops.
  title_bg: {
    label: 'Title screen background',
    video: 'assets/video/intro-bg.mp4',
    poster: 'assets/img/intro-bg-start.jpg',
    loop: true
  },

  // Slide 2 background. No file: the CSS gradient in demo.css is used.
  userid_bg: {
    label: 'User ID screen background',
    video: null,
    poster: null,
    loop: true
  },

  // One clip per environment, chosen by the customer's config.location.
  // Each starts in the environment and ends on the two products.
  //
  // slide:    the End frame with its left side extended (from the
  //           SupplyDrawer artwork folder). The right 1920px are the exact
  //           End.png, so it matches the video's last frame.
  // ext:      how many px of extension sit to the left of the End frame.
  // slide_by: how far right the image slides so that product is centred.
  // Built by tools/build-slides.py; rerun it if any render changes.
  environments: {
    f1_automotive:     { label: 'F1 garage', video: 'assets/video/env-f1-automotive.mp4', poster: 'assets/img/env-f1-automotive-start.jpg',
                         slide: 'assets/img/env-f1-automotive-slide.jpg', ext: 947, slide_by: { smartdrawer: 285.6 } },
    aircraft_hangar:   { label: 'Aircraft hangar', video: 'assets/video/env-aircraft-hangar.mp4', poster: 'assets/img/env-aircraft-hangar-start.jpg',
                         slide: 'assets/img/env-aircraft-hangar-slide.jpg', ext: 725, slide_by: { smartdrawer: 303.4 } },
    cnc_machine_shop:  { label: 'CNC machine shop', video: 'assets/video/env-cnc-machine-shop.mp4', poster: 'assets/img/env-cnc-machine-shop-start.jpg',
                         slide: 'assets/img/env-cnc-machine-shop-slide.jpg', ext: 725, slide_by: { smartdrawer: 225.9 } },
    medical_cleanroom: { label: 'Medical cleanroom', video: 'assets/video/env-medical-cleanroom.mp4', poster: 'assets/img/env-medical-cleanroom-start.jpg',
                         slide: 'assets/img/env-medical-cleanroom-slide.jpg', ext: 725, slide_by: { smartdrawer: 257.7 } },
    rail_depot:        { label: 'Rail depot', video: 'assets/video/env-rail-depot.mp4', poster: 'assets/img/env-rail-depot-start.jpg',
                         slide: 'assets/img/env-rail-depot-slide.jpg', ext: 725, slide_by: { smartdrawer: 304.0 } },
    amazon_warehouse:  { label: 'Warehouse', video: 'assets/video/env-warehouse.mp4', poster: 'assets/img/env-warehouse-start.jpg',
                         slide: 'assets/img/env-warehouse-slide.jpg', ext: 725, slide_by: { smartdrawer: 236.1 } }
  },

  // Stand-ins while a product's media doesn't exist yet. SupplySystem has no
  // slide image (needs the right side extended) and no zoom clip, so for now
  // SupplySystem configs use SmartDrawer's slide, zoom and login screen.
  // Delete the line once the SupplyVend media is in.
  stand_in: {
    supplysystem: 'smartdrawer'
  },

  // Zoom from the product onto its screen, chosen by config.solution.
  // Ends on the device login screen, which the HTML screen then takes over.
  zoom: {
    smartdrawer:  { label: 'SmartDrawer zoom to screen',  video: 'assets/video/zoom-smartdrawer.mp4',  poster: 'assets/img/zoom-smartdrawer-start.jpg' },
    supplysystem: { label: 'SupplySystem zoom to screen', video: 'assets/video/zoom-supplysystem.mp4', poster: null }
  },

  // The stills the HTML login screen sits on. 'frame' is the zoom clip's
  // last frame. 'clean' is the same frame with the welcome text removed, used
  // when a customer has their own welcome message.
  login_screen: {
    smartdrawer: { frame: 'assets/img/zoom-smartdrawer-end.jpg', clean: 'assets/img/login-smartdrawer-clean.jpg' }
  },

  // Physical login actions, for badge and barcode logins. Still needed.
  login_action: {
    rfid:    { label: 'RFID badge tap', video: 'assets/video/login-rfid.mp4',    poster: null },
    barcode: { label: 'Barcode scan',   video: 'assets/video/login-barcode.mp4', poster: null }
  }
};
