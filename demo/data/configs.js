/*
 * Customer configs, baked in so the demo runs from file:// and offline.
 * Snapshot of the live CMS on 3 Sep 2026 (examples/live-configs-2026-09-03.json).
 * The CMS export will replace this file with the one customer being exported.
 *
 * Demo-only fields, not in the CMS yet:
 *   welcome_message  the login screen's text, line breaks as \n
 *   theme_colour     the device screens' background and title bar, as hex
 *   button_colour    their buttons, the line under the title bar and pressed
 *                    keys, as hex
 *   logo             the logo in the screens' title bar: put the file in
 *                    assets/img/logos/ and give its path from the demo
 *                    folder. White or light, as the title bar is dark
 *                    unless theme_colour is light
 * Leave any of them out for the device's own look.
 */
window.TI_CONFIGS = [
  { user_id: 'test1',   solution: 'smartdrawer',  login_type: 'barcode',           location: 'rail_depot' },  // switched to SmartDrawer in the CMS, 2 Oct
  { user_id: 'STEUART', solution: 'smartdrawer',  login_type: 'rfid',              location: 'aircraft_hangar' },
  { user_id: 'Ferarri', solution: 'supplysystem', login_type: 'login_no_password', location: 'rail_depot' },
  { user_id: 'TI',      solution: 'smartdrawer',  login_type: 'rfid',              location: 'f1_automotive' },
  { user_id: 'test2',   solution: 'smartdrawer',  login_type: 'rfid',              location: 'f1_automotive' },  // local CMS only, 7 Oct

  // Test config, not from the CMS: the only one that shows the typed login.
  { user_id: 'DEMO',    solution: 'smartdrawer',  login_type: 'login_no_password', location: 'cnc_machine_shop' },

  // Test config, not from the CMS: test1's run with a customer's colours and
  // logo on the device screens.
  { user_id: 'BRANDED', solution: 'smartdrawer',  login_type: 'barcode',           location: 'rail_depot',
    theme_colour: '#3d6b99', button_colour: '#e8862a', logo: 'assets/img/logos/sample-logo.svg' },

  // Steuart's three customer examples, for testers. Not in the live CMS. The
  // login types are his (typed with password, unstated, RFID); hardware and
  // environments were picked to suit the products.
  { user_id: 'TI_EXAMPLE_1', solution: 'smartdrawer',  login_type: 'login_with_password', location: 'cnc_machine_shop' },
  { user_id: 'TI_EXAMPLE_2', solution: 'smartdrawer',  login_type: 'barcode', location: 'amazon_warehouse' },
  { user_id: 'TI_EXAMPLE_3', solution: 'supplysystem', login_type: 'rfid',    location: 'medical_cleanroom' }
];
