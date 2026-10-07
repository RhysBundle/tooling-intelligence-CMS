/*
 * Customer configs, baked in so the demo runs from file:// and offline.
 * Snapshot of the live CMS on 3 Sep 2026 (examples/live-configs-2026-09-03.json).
 * The CMS export will replace this file with the one customer being exported.
 */
window.TI_CONFIGS = [
  { user_id: 'test1',   solution: 'smartdrawer',  login_type: 'barcode',           location: 'rail_depot' },  // switched to SmartDrawer in the CMS, 2 Oct
  { user_id: 'STEUART', solution: 'smartdrawer',  login_type: 'rfid',              location: 'aircraft_hangar' },
  { user_id: 'Ferarri', solution: 'supplysystem', login_type: 'login_no_password', location: 'rail_depot' },
  { user_id: 'TI',      solution: 'smartdrawer',  login_type: 'rfid',              location: 'f1_automotive' },
  { user_id: 'test2',   solution: 'smartdrawer',  login_type: 'rfid',              location: 'f1_automotive' },  // local CMS only, 7 Oct

  // Test config, not from the CMS: the only one that shows the typed login.
  { user_id: 'DEMO',    solution: 'smartdrawer',  login_type: 'login_no_password', location: 'cnc_machine_shop' },

  // Steuart's three examples, for testers. Not in the live CMS. The examples
  // only give a login method, so the hardware follows the product and the
  // environments were picked to suit it. Example 3 logs in by fingerprint,
  // which configs cannot express yet, so it uses RFID.
  { user_id: 'TI_EXAMPLE_1', solution: 'smartdrawer',  login_type: 'rfid',    location: 'cnc_machine_shop' },
  { user_id: 'TI_EXAMPLE_2', solution: 'smartdrawer',  login_type: 'barcode', location: 'amazon_warehouse' },
  { user_id: 'TI_EXAMPLE_3', solution: 'supplysystem', login_type: 'rfid',    location: 'medical_cleanroom' }
];
