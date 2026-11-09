/*
 * Clips made for one user ID by tools/screen-swap: the renders with the
 * user's own screens in them. Keyed by user ID in lower case. take and
 * return (swap.py) are then keyed by product; intro (intro.py) is the push
 * in, login and zoom. Each made records what the clips were made with; the
 * demo only uses them while the config (and for the intro, the sequence's
 * first screen) still matches.
 * Written by the tools, so don't edit it by hand.
 */
window.TI_CUSTOM_CLIPS = {
  "branded": {
    "made": {
      "solution": "smartdrawer",
      "theme_colour": "#3d6b99",
      "button_colour": "#e8862a",
      "logo": "4067516a"
    },
    "take": {
      "plug_gauge|05320c49": {
        "label": "smartdrawer take, BRANDED, plug_gauge, rail_depot",
        "video": "assets/custom/branded/take-plug_gauge-05320c49.mp4",
        "poster": "assets/custom/branded/take-plug_gauge-05320c49-start.jpg",
        "location": "rail_depot",
        "framing": "smartdrawer_new_zoom",
        "renders": "1-59caaf26"
      }
    },
    "return": {
      "plug_gauge|93086ade": {
        "label": "smartdrawer return, BRANDED, plug_gauge, rail_depot",
        "video": "assets/custom/branded/return-plug_gauge-93086ade.mp4",
        "poster": "assets/custom/branded/return-plug_gauge-93086ade-start.jpg",
        "location": "rail_depot",
        "framing": "smartdrawer_new_zoom",
        "renders": "1-59caaf26"
      }
    },
    "intro": {
      "label": "smartdrawer push in, barcode login and zoom, BRANDED",
      "video": "assets/custom/branded/intro.mp4",
      "poster": "assets/custom/branded/intro-start.jpg",
      "end": "assets/custom/branded/intro-end.jpg",
      "login_screen": "smartdrawer_new_zoom",
      "made": {
        "solution": "smartdrawer",
        "location": "rail_depot",
        "login_type": "barcode",
        "theme_colour": "#3d6b99",
        "button_colour": "#e8862a",
        "logo": "4067516a",
        "first": "1fcef89d",
        "renders": "1-1e76fb7b"
      }
    }
  },
  "steuart": {
    "intro": {
      "label": "smartdrawer push in, rfid login and zoom, STEUART",
      "video": "assets/custom/steuart/intro.mp4",
      "poster": "assets/custom/steuart/intro-start.jpg",
      "end": "assets/custom/steuart/intro-end.jpg",
      "login_screen": "smartdrawer_new_zoom",
      "made": {
        "solution": "smartdrawer",
        "location": "aircraft_hangar",
        "login_type": "rfid",
        "theme_colour": "",
        "button_colour": "",
        "logo": "811c9dc5",
        "first": "3b67b05a",
        "renders": "1-1e76fb7b"
      }
    }
  },
  "demo": {
    "intro": {
      "label": "smartdrawer push in, login_no_password login and zoom, DEMO",
      "video": "assets/custom/demo/intro.mp4",
      "poster": "assets/custom/demo/intro-start.jpg",
      "end": "assets/custom/demo/intro-end.jpg",
      "login_screen": "smartdrawer_new_zoom",
      "made": {
        "solution": "smartdrawer",
        "location": "cnc_machine_shop",
        "login_type": "login_no_password",
        "theme_colour": "",
        "button_colour": "",
        "logo": "811c9dc5",
        "first": "9848a47b",
        "renders": "1-1e76fb7b"
      }
    }
  },
  "ferarri": {
    "made": {
      "solution": "supplysystem",
      "theme_colour": "",
      "button_colour": "",
      "logo": "811c9dc5"
    },
    "take": {
      "plug_gauge|05320c49": {
        "label": "supplysystem take, Ferarri, plug_gauge, rail_depot",
        "video": "assets/custom/ferarri/take-plug_gauge-05320c49.mp4",
        "poster": "assets/custom/ferarri/take-plug_gauge-05320c49-start.jpg",
        "location": "rail_depot",
        "framing": "supplysystem_new_zoom",
        "renders": "1-2c597b92"
      }
    },
    "return": {
      "plug_gauge|93086ade": {
        "label": "supplysystem return, Ferarri, plug_gauge, rail_depot",
        "video": "assets/custom/ferarri/return-plug_gauge-93086ade.mp4",
        "poster": "assets/custom/ferarri/return-plug_gauge-93086ade-start.jpg",
        "location": "rail_depot",
        "framing": "supplysystem_new_zoom",
        "renders": "1-2c597b92"
      }
    },
    "intro": {
      "label": "supplysystem push in, login_no_password login and zoom, Ferarri",
      "video": "assets/custom/ferarri/intro.mp4",
      "poster": "assets/custom/ferarri/intro-start.jpg",
      "end": "assets/custom/ferarri/intro-end.jpg",
      "login_screen": "supplysystem_new_zoom",
      "made": {
        "solution": "supplysystem",
        "location": "rail_depot",
        "login_type": "login_no_password",
        "theme_colour": "",
        "button_colour": "",
        "logo": "811c9dc5",
        "first": "1fcef89d",
        "renders": "1-fa8c3b7c"
      }
    }
  },
  "ti_example_3": {
    "made": {
      "solution": "supplysystem",
      "theme_colour": "",
      "button_colour": "",
      "logo": "811c9dc5"
    },
    "take": {
      "dust_mask|e62dbc20": {
        "label": "supplysystem take, TI_EXAMPLE_3, dust_mask, medical_cleanroom",
        "video": "assets/custom/ti_example_3/take-dust_mask-e62dbc20.mp4",
        "poster": "assets/custom/ti_example_3/take-dust_mask-e62dbc20-start.jpg",
        "location": "medical_cleanroom",
        "framing": "supplysystem_new_zoom",
        "renders": "1-2c597b92"
      }
    },
    "return": {},
    "intro": {
      "label": "supplysystem push in, rfid login and zoom, TI_EXAMPLE_3",
      "video": "assets/custom/ti_example_3/intro.mp4",
      "poster": "assets/custom/ti_example_3/intro-start.jpg",
      "end": "assets/custom/ti_example_3/intro-end.jpg",
      "login_screen": "supplysystem_new_zoom",
      "made": {
        "solution": "supplysystem",
        "location": "medical_cleanroom",
        "login_type": "rfid",
        "theme_colour": "",
        "button_colour": "",
        "logo": "811c9dc5",
        "first": "b18bc57c",
        "renders": "1-fa8c3b7c"
      }
    }
  }
};
