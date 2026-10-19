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
        "first": "1fcef89d"
      }
    }
  }
};
