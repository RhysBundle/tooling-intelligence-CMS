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

  // Stand-ins while a product's media doesn't exist yet, as
  // { product: 'other product' }. None at present.
  stand_in: {},

  // Whose slide a product uses, where it has no slide_by of its own. The
  // slide images only extend to the left, so they can only slide to the
  // SmartDrawer: the SupplyVend stands right of centre and would need them
  // extended to the right. Until then SupplySystem slides as SmartDrawer
  // does (Rhys, 9 Oct), and its own zoom crossfades in from there.
  slide_as: { supplysystem: 'smartdrawer' },

  // Zoom from the product onto its screen, chosen by config.solution. Only
  // used where there is no zoom_login clip for the login type.
  // Ends on the device login screen, which the HTML screen then takes over.
  zoom: {
    smartdrawer:  { label: 'SmartDrawer zoom to screen',  video: 'assets/video/zoom-smartdrawer.mp4',  poster: 'assets/img/zoom-smartdrawer-start.jpg' },
    supplysystem: { label: 'SupplySystem zoom to screen', video: 'assets/video/zoom-supplysystem.mp4', poster: null }
  },

  // The zoom and the login in one clip, by product and config.login_type.
  // Where there is one, it replaces the zoom, the HTML login screen and the
  // login clip, and the sequence starts straight after it.
  //
  // Both products' come from the phase 1 renders in GDrive-example/Videos/
  // ActionVideos (SmartDrawer/SD_*_login.mp4, SupplyVend/CV_* and SV_*),
  // cut to the zoom and the login by tools/build-login-clips.py. Each ends on
  // whatever the device shows after the login, so 'end' is its own last
  // frame for the sequence's screens to sit on, and 'login_screen' says which
  // framing it ends on. Both typed logins use the one typed clip.
  //
  // SmartDrawer's ROUGH renders (zoom-login-smartdrawer-*.mp4, which zoom
  // right into the screen and end back on the login screen) are still in
  // assets/video, unused since 9 Oct.
  zoom_login: {
    smartdrawer: {
      barcode:             { label: 'SmartDrawer zoom and barcode login', video: 'assets/video/zoom-login-smartdrawer-phase1-barcode.mp4', poster: 'assets/img/zoom-login-smartdrawer-phase1-barcode-start.jpg',
                             end: 'assets/img/zoom-login-smartdrawer-phase1-barcode-end.jpg', login_screen: 'smartdrawer_phase1' },
      rfid:                { label: 'SmartDrawer zoom and RFID login',    video: 'assets/video/zoom-login-smartdrawer-phase1-rfid.mp4',    poster: 'assets/img/zoom-login-smartdrawer-phase1-rfid-start.jpg',
                             end: 'assets/img/zoom-login-smartdrawer-phase1-rfid-end.jpg', login_screen: 'smartdrawer_phase1' },
      login_no_password:   { label: 'SmartDrawer zoom and typed login',   video: 'assets/video/zoom-login-smartdrawer-phase1-userid.mp4',  poster: 'assets/img/zoom-login-smartdrawer-phase1-userid-start.jpg',
                             end: 'assets/img/zoom-login-smartdrawer-phase1-userid-end.jpg', login_screen: 'smartdrawer_phase1' },
      login_with_password: { label: 'SmartDrawer zoom and typed login',   video: 'assets/video/zoom-login-smartdrawer-phase1-userid.mp4',  poster: 'assets/img/zoom-login-smartdrawer-phase1-userid-start.jpg',
                             end: 'assets/img/zoom-login-smartdrawer-phase1-userid-end.jpg', login_screen: 'smartdrawer_phase1' }
    },
    supplysystem: {
      barcode:             { label: 'SupplySystem zoom and barcode login', video: 'assets/video/zoom-login-supplysystem-barcode.mp4', poster: 'assets/img/zoom-login-supplysystem-barcode-start.jpg',
                             end: 'assets/img/zoom-login-supplysystem-barcode-end.jpg', login_screen: 'supplysystem_barcode' },
      rfid:                { label: 'SupplySystem zoom and RFID login',    video: 'assets/video/zoom-login-supplysystem-rfid.mp4',    poster: 'assets/img/zoom-login-supplysystem-rfid-start.jpg',
                             end: 'assets/img/zoom-login-supplysystem-rfid-end.jpg' },
      login_no_password:   { label: 'SupplySystem zoom and typed login',   video: 'assets/video/zoom-login-supplysystem-userid.mp4',  poster: 'assets/img/zoom-login-supplysystem-userid-start.jpg',
                             end: 'assets/img/zoom-login-supplysystem-userid-end.jpg' },
      login_with_password: { label: 'SupplySystem zoom and typed login',   video: 'assets/video/zoom-login-supplysystem-userid.mp4',  poster: 'assets/img/zoom-login-supplysystem-userid-start.jpg',
                             end: 'assets/img/zoom-login-supplysystem-userid-end.jpg' }
    }
  },

  // The device's screen, for each framing a zoom ends on.
  //
  // 'tone' is how the render changes the device screen's colours, and the
  // HTML screens after login get the same: saturation first, then a gamma
  // or a curve of [in, out] levels. null turns it off.
  //
  // 'screen' is where the screen sits in the frame: the frame px of the
  // 1024x768 UI's corners, top left first and clockwise. The UI is shown as
  // it is (not widened), and the log out screen is HTML too (TIScreens.login).
  // The render's UI runs a few px past the artwork's edges, so 'bleed' (top,
  // right, bottom, left, in artwork px) widens the HTML screen by that much in
  // the screen's own background, or the ends of the render's red line show.
  //
  // smartdrawer: the old path, with no 'screen'. 'frame' is the placeholder
  // zoom's last frame, which the HTML login screen and the HTML screens sit
  // on, widened to 16:9 (see css/screens.css); 'clean' is the same with the
  // welcome text removed, for a customer's own welcome message and log out.
  // Its tone was fitted to that frame. Only used where a login type has no
  // zoom and login clip, so not at present.
  //
  // The phase 1 renders: fitted against the artwork to within 2px
  // (SmartDrawer: 08_Search_4, 08_Search_3, 06_CheckIn_3; SupplySystem:
  // 15_Search_4, SupplySystem_Items). All three SmartDrawer clips end on one
  // framing, the monitor seen at an angle. SupplySystem's RFID and typed
  // clips end on one, square on; its barcode clip's camera ends 43.9px
  // higher. Both products' renders tone the screen the same way, darker than
  // the placeholder and not a plain gamma (white comes out at 208, #3e3e3e
  // at 30).
  login_screen: {
    smartdrawer: {
      frame: 'assets/img/zoom-smartdrawer-end.jpg', clean: 'assets/img/login-smartdrawer-clean.jpg',
      tone: { saturation: 0.7, gamma: 2.2 }
    },
    smartdrawer_phase1: {
      tone: { saturation: 0.7, curve: [[0, 0], [36, 5], [64, 30], [180, 156], [220, 188], [240, 205], [255, 208]] },
      screen: { corners: [[391, 100], [1266.5, 104.25], [1259, 728.25], [421, 761.25]] }
    },
    supplysystem: {
      tone: { saturation: 0.7, curve: [[0, 0], [36, 5], [64, 30], [180, 156], [220, 188], [240, 205], [255, 208]] },
      screen: { corners: [[549, 227.9], [1403, 227.9], [1403, 868.4], [549, 868.4]], bleed: [6, 11, 0, 8.5] }
    },
    supplysystem_barcode: {
      tone: { saturation: 0.7, curve: [[0, 0], [36, 5], [64, 30], [180, 156], [220, 188], [240, 205], [255, 208]] },
      screen: { corners: [[549, 184], [1403, 184], [1403, 824.5], [549, 824.5]], bleed: [6, 11, 0, 8.5] }
    }
  },

  // Physical login actions, for badge and barcode logins. Only used where
  // there is no zoom_login clip for the login type, so not at present.
  login_action: {
    rfid:    { label: 'RFID badge tap', video: 'assets/video/login-rfid.mp4',    poster: null },
    barcode: { label: 'Barcode scan',   video: 'assets/video/login-barcode.mp4', poster: null }
  },

  // The item being taken out or put back, played mid-sequence (see
  // actionClipAfter in demo.js). Chosen by config.solution itself, not the
  // stand-in, because both products have their own. From
  // GDrive-example/Videos/ActionVideos/Adjusted: *TakeOut is take,
  // *CheckIn is return.
  action: {
    take: {
      smartdrawer:  { label: 'SmartDrawer take',  video: 'assets/video/take-smartdrawer.mp4',  poster: 'assets/img/take-smartdrawer-start.jpg' },
      supplysystem: { label: 'SupplySystem take', video: 'assets/video/take-supplysystem.mp4', poster: 'assets/img/take-supplysystem-start.jpg' }
    },
    'return': {
      smartdrawer:  { label: 'SmartDrawer return',  video: 'assets/video/return-smartdrawer.mp4',  poster: 'assets/img/return-smartdrawer-start.jpg' },
      supplysystem: { label: 'SupplySystem return', video: 'assets/video/return-supplysystem.mp4', poster: 'assets/img/return-supplysystem-start.jpg' }
    }
  }
};
