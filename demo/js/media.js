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
  // { product: 'other product' }. None at present. SupplySystem has its own
  // zoom and login clips, but no slide_by above (the slide images would need
  // their right side extended), so its environment crossfades straight to
  // its zoom with no slide.
  stand_in: {},

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
  // SmartDrawer: ROUGH renders from GDrive-example/Videos/ActionVideos/
  // SmartDrawer. Each ends on the same frame as the zoom (login_screen
  // 'frame' below), so the sequence's screens sit over it exactly. The
  // UserIDPassword file is a copy of UserID, so both typed logins use one clip.
  //
  // SupplySystem: the phase 1 renders in .../ActionVideos/SupplyVend, cut to
  // the zoom and the login by tools/build-supplysystem-login.py. Each ends on
  // whatever the device shows after the login, so 'end' is its own last
  // frame for the sequence's screens to sit on. 'login_screen' says which
  // framing it ends on, where that isn't the product's own.
  zoom_login: {
    smartdrawer: {
      barcode:             { label: 'SmartDrawer zoom and barcode login', video: 'assets/video/zoom-login-smartdrawer-barcode.mp4', poster: 'assets/img/zoom-login-smartdrawer-barcode-start.jpg' },
      rfid:                { label: 'SmartDrawer zoom and RFID login',    video: 'assets/video/zoom-login-smartdrawer-rfid.mp4',    poster: 'assets/img/zoom-login-smartdrawer-rfid-start.jpg' },
      login_no_password:   { label: 'SmartDrawer zoom and typed login',   video: 'assets/video/zoom-login-smartdrawer-userid.mp4',  poster: 'assets/img/zoom-login-smartdrawer-userid-start.jpg' },
      login_with_password: { label: 'SmartDrawer zoom and typed login',   video: 'assets/video/zoom-login-smartdrawer-userid.mp4',  poster: 'assets/img/zoom-login-smartdrawer-userid-start.jpg' }
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

  // The stills the HTML login screen sits on. 'frame' is the zoom clip's
  // last frame. 'clean' is the same frame with the welcome text removed, used
  // when a customer has their own welcome message, and for the log out screen.
  // 'tone' is how the render changes the device screen's colours, and the
  // HTML screens after login get the same: saturation first, then a gamma
  // curve. Fitted to the placeholder zoom's last frame against the login
  // artwork (greys and the Enter button's reds, to within a few levels), so
  // fit it again when the real zoom lands. null turns it off.
  //
  // 'screen' is where the device's screen sits in the frame, for a product
  // whose screen doesn't fill it: the 1024x768 UI as it is (not widened),
  // its top left corner and scale in the frame's 1920x1080 px. 'welcome' is
  // where the log out message goes on the login panel. Without them, the
  // screen fills the frame widened to 16:9 (see css/screens.css) and the
  // message goes where demo.css puts it, as on SmartDrawer.
  //
  // SupplySystem: fitted against the artwork (15_Search_4, SupplySystem_Items)
  // to within 2px. The render's UI runs a few px past the artwork's edges,
  // so 'bleed' (top, right, bottom, left, in frame px) widens the HTML screen
  // by that much in the screen's own background, or the ends of the render's
  // red line show beside it. The RFID and typed clips end on the same
  // framing; the barcode clip's camera ends 43.9px higher. Its render tone is
  // darker than SmartDrawer's and not a plain gamma, so it is a curve of
  // [in, out] levels fitted to the artwork's greys (white comes out at 208,
  // #3e3e3e at 30). Its log out stills are put together by
  // tools/build-supplysystem-login.py with the welcome text taken out, as the
  // render's says "SmartDrawer", so 'frame' is the clean one too.
  login_screen: {
    smartdrawer: {
      frame: 'assets/img/zoom-smartdrawer-end.jpg', clean: 'assets/img/login-smartdrawer-clean.jpg',
      tone: { saturation: 0.7, gamma: 2.2 }
    },
    supplysystem: {
      frame: 'assets/img/login-supplysystem-clean.jpg', clean: 'assets/img/login-supplysystem-clean.jpg',
      tone: { saturation: 0.7, curve: [[0, 0], [36, 5], [64, 30], [180, 156], [220, 188], [240, 205], [255, 208]] },
      screen: { left: 549, top: 227.9, scale: 0.834, bleed: [5, 9, 0, 7] },
      welcome: { left: 753.6, top: 420.1, width: 391.4, size: 20.9, line: 24.6 }
    },
    supplysystem_barcode: {
      frame: 'assets/img/login-supplysystem-barcode-clean.jpg', clean: 'assets/img/login-supplysystem-barcode-clean.jpg',
      tone: { saturation: 0.7, curve: [[0, 0], [36, 5], [64, 30], [180, 156], [220, 188], [240, 205], [255, 208]] },
      screen: { left: 549, top: 184.0, scale: 0.834, bleed: [5, 9, 0, 7] },
      welcome: { left: 753.6, top: 376.2, width: 391.4, size: 20.9, line: 24.6 }
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
