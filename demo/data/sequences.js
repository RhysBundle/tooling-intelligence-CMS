/*
 * Sequences, baked in like configs.js so the demo runs from file:// and offline.
 * Keyed by user ID, matched ignoring case. Same shape as the CMS stores them
 * (see SEQUENCES.md). Over http(s) the CMS in data/cms.js is asked first;
 * this file covers what it hasn't got (see demo/README.md).
 *
 * The log in step is kept so a sequence passes the CMS validator unchanged,
 * but the demo's login is still driven by the config's login_type.
 *
 * test1 and Ferarri take the M10 plug gauge, then return it, so they show
 * both the take and the return clip (SmartDrawer and SupplySystem). DEMO
 * takes the router bit after the typed login. STEUART runs Steuart's
 * Example 1 in full; its steps without a screen yet show a labelled
 * placeholder. TI_EXAMPLE_1 to 3 are Steuart's three examples, as testers
 * see them. BRANDED is test1's run, to show a customer's colours and logo.
 * TI has no sequence, so it stops after login as before.
 */
window.TI_SEQUENCES = {
  test1: {
    user_id: 'test1',
    name: 'M10 plug gauge take and return',
    playback_mode: 'auto',
    default_dwell_ms: 3000,
    steps: [
      { type: 'login_method', params: { method: 'barcode' }, text: {}, dwell_ms: null },
      { type: 'product_search', params: { mode: 'typed', category: 'inspection' }, text: { query: 'm10' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'plug_gauge' }, text: {}, dwell_ms: 2500 },
      { type: 'select_action', params: { action: 'take', control: 'onscreen' }, text: {}, dwell_ms: 2500 },
      { type: 'enter_quantity', params: {}, text: { prompt: '', quantity: '1' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'plug_gauge' }, text: {}, dwell_ms: 2500 },
      { type: 'select_action', params: { action: 'return', control: 'onscreen' }, text: {}, dwell_ms: 2500 },
      { type: 'logout', params: {}, text: { message: 'You are now logged out.' }, dwell_ms: null }
    ]
  },

  // SupplySystem, so the SupplySystem clips play. The screens around them
  // are SmartDrawer stand-ins for now.
  Ferarri: {
    user_id: 'Ferarri',
    name: 'M10 plug gauge take and return',
    playback_mode: 'auto',
    default_dwell_ms: 3000,
    steps: [
      { type: 'login_method', params: { method: 'typed' }, text: {}, dwell_ms: null },
      { type: 'product_search', params: { mode: 'typed', category: 'inspection' }, text: { query: 'm10' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'plug_gauge' }, text: {}, dwell_ms: 2500 },
      { type: 'select_action', params: { action: 'take', control: 'onscreen' }, text: {}, dwell_ms: 2500 },
      { type: 'enter_quantity', params: {}, text: { prompt: '', quantity: '1' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'plug_gauge' }, text: {}, dwell_ms: 2500 },
      { type: 'select_action', params: { action: 'return', control: 'onscreen' }, text: {}, dwell_ms: 2500 },
      { type: 'logout', params: {}, text: { message: 'You are now logged out.' }, dwell_ms: null }
    ]
  },

  DEMO: {
    user_id: 'DEMO',
    name: 'Router bit take',
    playback_mode: 'auto',
    default_dwell_ms: 3000,
    steps: [
      { type: 'login_method', params: { method: 'typed' }, text: {}, dwell_ms: null },
      { type: 'product_search', params: { mode: 'typed', category: 'machine_tools' }, text: { query: 'Router' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'router_bit' }, text: {}, dwell_ms: 2500 },
      { type: 'select_action', params: { action: 'take', control: 'onscreen' }, text: {}, dwell_ms: 2500 },
      { type: 'enter_quantity', params: {}, text: { prompt: '', quantity: '1' }, dwell_ms: null },
      { type: 'logout', params: {}, text: { message: 'You are now logged out.' }, dwell_ms: null }
    ]
  },

  // Steuart's Example 1, from examples/steuart-example-sequences.json
  STEUART: {
    user_id: 'STEUART',
    name: 'Example 1 - single router bit take',
    playback_mode: 'auto',
    default_dwell_ms: 3000,
    steps: [
      { type: 'login_method', params: { method: 'rfid' }, text: {}, dwell_ms: 3500 },
      { type: 'login_allocation_code', params: { input_mode: 'barcode' }, text: { prompt: 'Scan job card', helper: 'Job card is on the work order' }, dwell_ms: null },
      { type: 'product_search', params: { mode: 'typed', category: 'machine_tools' }, text: { query: 'Router' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'router_bit' }, text: {}, dwell_ms: null },
      { type: 'select_action', params: { action: 'take', control: 'onscreen' }, text: {}, dwell_ms: null },
      { type: 'enter_quantity', params: {}, text: { prompt: '', quantity: '1' }, dwell_ms: null },
      { type: 'open_pocket_take', params: {}, text: { message: '' }, dwell_ms: 4000 },
      { type: 'transaction_confirmation', params: {}, text: { message: 'Taken successfully' }, dwell_ms: 2500 },
      { type: 'logout', params: {}, text: { message: 'Thanks, goodbye' }, dwell_ms: 2500 }
    ]
  },

  // Steuart's three customer examples, the tester demos. Copied unchanged from
  // examples/steuart-example-sequences.json, under the same IDs the CMS seeds.
  TI_EXAMPLE_1: {
    user_id: 'TI_EXAMPLE_1',
    name: 'Customer Example 1 - three allocation codes, two products',
    playback_mode: 'auto',
    default_dwell_ms: 3000,
    steps: [
      { type: 'login_method', params: { method: 'typed_password' }, text: {}, dwell_ms: null },
      { type: 'login_allocation_code', params: { input_mode: 'select_from_list' }, text: { prompt: 'Select Work Area' }, dwell_ms: null },
      { type: 'login_allocation_code', params: { input_mode: 'select_from_list' }, text: { prompt: 'Select Cost Centre' }, dwell_ms: null },
      { type: 'login_allocation_code', params: { input_mode: 'barcode' }, text: { prompt: 'Scan Job Card' }, dwell_ms: null },
      { type: 'product_search', params: { mode: 'typed', category: 'inspection' }, text: { query: 'm10' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'plug_gauge' }, text: {}, dwell_ms: null },
      { type: 'enter_quantity', params: {}, text: { prompt: '', quantity: '1' }, dwell_ms: null },
      { type: 'open_pocket_take', params: {}, text: { message: '' }, dwell_ms: null },
      { type: 'product_search', params: { mode: 'typed', category: 'machine_tools' }, text: { query: 'End mill' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'endmill_10' }, text: {}, dwell_ms: null },
      { type: 'open_pocket_take', params: {}, text: { message: '' }, dwell_ms: null },
      { type: 'logout', params: {}, text: { message: 'Thanks, goodbye' }, dwell_ms: null }
    ]
  },
  TI_EXAMPLE_2: {
    user_id: 'TI_EXAMPLE_2',
    name: 'Customer Example 2 - product kit, items from four locations',
    playback_mode: 'auto',
    default_dwell_ms: 3000,
    steps: [
      { type: 'login_method', params: { method: 'barcode' }, text: {}, dwell_ms: null },
      { type: 'product_search', params: { mode: 'typed', category: 'fasteners' }, text: { query: 'kit' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'bolt_kit_m8' }, text: {}, dwell_ms: null },
      { type: 'open_pocket_take', params: {}, text: { message: '' }, dwell_ms: null },
      { type: 'open_pocket_take', params: {}, text: { message: '' }, dwell_ms: null },
      { type: 'open_pocket_take', params: {}, text: { message: '' }, dwell_ms: null },
      { type: 'open_pocket_take', params: {}, text: { message: '' }, dwell_ms: null },
      { type: 'logout', params: {}, text: { message: 'Kit issued, goodbye' }, dwell_ms: null }
    ]
  },
  TI_EXAMPLE_3: {
    user_id: 'TI_EXAMPLE_3',
    name: 'Customer Example 3 - allocation codes, lot managed product',
    playback_mode: 'auto',
    default_dwell_ms: 3000,
    steps: [
      { type: 'login_method', params: { method: 'rfid' }, text: {}, dwell_ms: null },
      { type: 'login_allocation_code', params: { input_mode: 'select_from_list' }, text: { prompt: 'Select Work Area' }, dwell_ms: null },
      { type: 'login_allocation_code', params: { input_mode: 'select_from_list' }, text: { prompt: 'Select Cost Centre' }, dwell_ms: null },
      { type: 'login_allocation_code', params: { input_mode: 'barcode' }, text: { prompt: 'Scan Job Card' }, dwell_ms: null },
      { type: 'product_search', params: { mode: 'typed', category: 'ppe' }, text: { query: 'mask' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'dust_mask' }, text: {}, dwell_ms: null },
      { type: 'info_window', params: { info_type: 'lot_number' }, text: { title: 'Lot number', body: 'Lot 4471-B, expires 03/2027' }, dwell_ms: null },
      { type: 'open_pocket_take', params: {}, text: { message: '' }, dwell_ms: null },
      { type: 'logout', params: {}, text: { message: 'Goodbye' }, dwell_ms: null }
    ]
  },

  // From the local CMS, 7 Oct. Rhys's test.
  test2: {
    user_id: 'test2',
    name: 'Xa',
    playback_mode: 'auto',
    default_dwell_ms: 3000,
    steps: [
      { type: 'login_method', params: { method: 'rfid' }, text: {}, dwell_ms: 3000 },
      { type: 'product_search', params: { mode: 'typed', category: 'machine_tools' }, text: { query: 'End mill' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'dust_mask' }, text: {}, dwell_ms: 3000 },
      { type: 'select_action', params: { action: 'take', control: 'onscreen' }, text: {}, dwell_ms: 3000 },
      { type: 'enter_quantity', params: {}, text: { prompt: 'Open location door A-C002.', quantity: '1' }, dwell_ms: null },
      { type: 'info_window', params: { info_type: 'custom' }, text: { title: 'WARNING', body: 'NUCLEAR MATERIAL: ONLY USE FOR SIMPSONS GLOWING CYLINDERS AND NOT WARHEADS' }, dwell_ms: null },
      { type: 'open_pocket_take', params: {}, text: { message: 'Door open. Take the item and close the door.' }, dwell_ms: null },
      { type: 'scale_transaction', params: { action: 'take' }, text: { weight: '1.248 kg', message: 'Place the items on the scale.' }, dwell_ms: null },
      { type: 'transaction_confirmation', params: {}, text: { message: 'Taken successfully' }, dwell_ms: null },
      { type: 'logout', params: {}, text: { message: 'Goodbye, Enjoy your safe nuclear plans' }, dwell_ms: null }
    ]
  },

  // test1's run, for the colours and logo in its config
  BRANDED: {
    user_id: 'BRANDED',
    name: 'M10 plug gauge take and return, branded',
    playback_mode: 'auto',
    default_dwell_ms: 3000,
    steps: [
      { type: 'login_method', params: { method: 'barcode' }, text: {}, dwell_ms: null },
      { type: 'product_search', params: { mode: 'typed', category: 'inspection' }, text: { query: 'm10' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'plug_gauge' }, text: {}, dwell_ms: 2500 },
      { type: 'select_action', params: { action: 'take', control: 'onscreen' }, text: {}, dwell_ms: 2500 },
      { type: 'enter_quantity', params: {}, text: { prompt: '', quantity: '1' }, dwell_ms: null },
      { type: 'select_product', params: { product: 'plug_gauge' }, text: {}, dwell_ms: 2500 },
      { type: 'select_action', params: { action: 'return', control: 'onscreen' }, text: {}, dwell_ms: 2500 },
      { type: 'logout', params: {}, text: { message: 'You are now logged out.' }, dwell_ms: null }
    ]
  }
};
