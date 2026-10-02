/*
 * TI Storyline CMS - Product catalogue
 * ------------------------------------
 * The products a sequence can reference. Loaded before event-types.js in the
 * browser and required() on the server.
 *
 * The eight products marked `source: 'scorm'` are read straight off the
 * existing SCORM package screens, exact names, part numbers, quantities, units
 * of issue and device types, so the preview matches what TI already have. The
 * rest is filler.
 *
 * Filler is not padding. A product search that returns one result looks fake
 * in front of a prospect, so every category needs enough entries that the list
 * scrolls. Real thumbnails would come from TI; each product falls back to a
 * neutral line drawing by product type.
 *
 * Categories: the first three are the ones the SCORM Product Category screen
 * shows. The last three exist because Steuart's event list names PPE,
 * fasteners and grinding discs as product types, and they need somewhere to
 * live.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TICatalogue = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var CATEGORIES = [
        { id: 'drilling_tools', name: 'Drilling Tools', description: '', source: 'scorm' },
        { id: 'machine_tools', name: 'Machine Tools', description: '', source: 'scorm' },
        { id: 'inspection', name: 'Inspection', description: '', source: 'scorm' },
        { id: 'fasteners', name: 'Fasteners', description: '' },
        { id: 'ppe', name: 'PPE', description: '' },
        { id: 'abrasives', name: 'Abrasives', description: '' }
    ];

    /* device: which hardware the product sits in, matching the "Device Type"
     *         column on the Select Product screen
     * type:   the product type from Steuart's list, used for render counting
     * menu:   Menu# as shown top right on the Take screen
     * loc:    door / pocket code, drives "Open location door A-C002."
     */
    var PRODUCTS = [
        // ---- straight from the SCORM screens ----
        {
            id: 'endmill_006', name: '0.06mm 3 Flute Standard Length End Mills for Steel',
            pn: '2HCE 0006 001 S04', uoi: 'EA', qty: 10, device: 'smartdrawer',
            category: 'machine_tools', type: 'cutting_tool', menu: '118', loc: 'A-C001',
            source: 'scorm'
        },
        {
            id: 'tile_drill', name: 'Diamond Tipped Tile Drill Bit',
            pn: 'TI-032-8', uoi: 'EA', qty: 1, device: 'smartdrawer',
            category: 'drilling_tools', type: 'cutting_tool', menu: '132', loc: 'A-C003',
            source: 'scorm'
        },
        {
            id: 'cal_weights', name: '1000g Calibration Weights Set',
            pn: 'TI-011-1', uoi: 'EA', qty: 1, device: 'supplysystem',
            category: 'inspection', type: 'hand_tool', menu: '011', loc: 'B-L004',
            source: 'scorm'
        },
        {
            id: 'washer_10', name: '10mm Washer',
            pn: 'TI-054-0', uoi: 'EA', qty: 5, device: 'smartdrawer',
            category: 'fasteners', type: 'fastener', menu: '054', loc: 'A-C008',
            source: 'scorm'
        },
        {
            id: 'drill_tip_20', name: '20mm Carbide Drill Tip',
            pn: 'TI-017-3', uoi: 'EA', qty: 10, device: 'smartdrawer',
            category: 'drilling_tools', type: 'cutting_tool', menu: '017', loc: 'A-C005',
            source: 'scorm'
        },
        {
            id: 'coolant_assy', name: '25mm Thru Coolant Drilling Assembly',
            pn: 'TI-203', uoi: 'EA', qty: 2, device: 'smartdrawer',
            category: 'drilling_tools', type: 'cutting_tool', menu: '203', loc: 'A-C006',
            source: 'scorm'
        },
        {
            id: 'router_bit', name: 'Ultra-Performance Compression Flush Trim Router Bit',
            pn: 'RB-011', uoi: 'EA', qty: 1, device: 'smartdrawer',
            category: 'machine_tools', type: 'cutting_tool', menu: '205', loc: 'A-C002',
            source: 'scorm'
        },
        {
            id: 'plug_gauge', name: 'M10 x 3 Screw Plug Gauge',
            pn: 'INSP.', uoi: 'EA', qty: 3, device: 'smartdrawer',
            category: 'inspection', type: 'hand_tool', menu: '', loc: 'A-C012',
            itemCode: '', source: 'scorm'
        },

        // ---- filler, so a search result list actually scrolls ----
        {
            id: 'jobber_6', name: '6mm HSS Jobber Drill Bit',
            pn: 'TI-041-2', uoi: 'EA', qty: 24, device: 'smartdrawer',
            category: 'drilling_tools', type: 'cutting_tool', menu: '041', loc: 'A-C007'
        },
        {
            id: 'step_drill_8', name: '8mm Cobalt Step Drill',
            pn: 'TI-044-6', uoi: 'EA', qty: 6, device: 'smartdrawer',
            category: 'drilling_tools', type: 'cutting_tool', menu: '044', loc: 'A-C009'
        },
        {
            id: 'spot_drill_12', name: '12mm Spot Drill, 90 Degree',
            pn: 'TI-019-5', uoi: 'EA', qty: 8, device: 'smartdrawer',
            category: 'drilling_tools', type: 'cutting_tool', menu: '019', loc: 'A-C010'
        },
        {
            id: 'endmill_10', name: '10mm Carbide End Mill, 4 Flute',
            pn: 'CT-10MM-4F', uoi: 'EA', qty: 12, device: 'smartdrawer',
            category: 'machine_tools', type: 'cutting_tool', menu: '210', loc: 'A-D001'
        },
        {
            id: 'face_mill_insert', name: '16mm Face Mill Insert',
            pn: 'TI-072-1', uoi: 'SET', qty: 4, device: 'smartdrawer',
            category: 'machine_tools', type: 'cutting_tool', menu: '072', loc: 'A-D002'
        },
        {
            id: 'thread_mill_m8', name: 'M8 Thread Mill, 3 Flute',
            pn: 'TI-066-3', uoi: 'EA', qty: 5, device: 'smartdrawer',
            category: 'machine_tools', type: 'cutting_tool', menu: '066', loc: 'A-D003'
        },
        {
            id: 'micrometer', name: '0-25mm Digital Micrometer',
            pn: 'TI-088-4', uoi: 'EA', qty: 2, device: 'supplysystem',
            category: 'inspection', type: 'hand_tool', menu: '088', loc: 'B-L001'
        },
        {
            id: 'caliper_150', name: '150mm Vernier Caliper',
            pn: 'TI-089-2', uoi: 'EA', qty: 4, device: 'supplysystem',
            category: 'inspection', type: 'hand_tool', menu: '089', loc: 'B-L002'
        },
        {
            id: 'test_indicator', name: 'Surface Plate Test Indicator',
            pn: 'TI-091-7', uoi: 'EA', qty: 1, device: 'supplysystem',
            category: 'inspection', type: 'hand_tool', menu: '091', loc: 'B-L003'
        },
        {
            id: 'hex_bolt_m8', name: 'M8 x 40 Hex Bolt, Box of 50',
            pn: 'TI-050-1', uoi: 'EA', qty: 14, device: 'smartdrawer',
            category: 'fasteners', type: 'fastener', menu: '050', loc: 'A-C011'
        },
        {
            id: 'nyloc_m8', name: 'M8 Nyloc Nut, Box of 100',
            pn: 'TI-051-9', uoi: 'EA', qty: 9, device: 'smartdrawer',
            category: 'fasteners', type: 'fastener', menu: '051', loc: 'A-C013'
        },
        {
            id: 'bolt_kit_m8', name: 'M8 Bolt Kit, 4 Pockets',
            pn: 'FK-M8-004', uoi: 'SET', qty: 8, device: 'smartdrawer',
            category: 'fasteners', type: 'fastener', menu: '055', loc: 'A-C014'
        },
        {
            id: 'gloves_cut5', name: 'Cut Level 5 Gloves, Size L',
            pn: 'PPE-GL-05L', uoi: 'EA', qty: 30, device: 'supplysystem',
            category: 'ppe', type: 'ppe_item', menu: '301', loc: 'B-L006'
        },
        {
            id: 'goggles', name: 'Clear Safety Goggles, Anti-Fog',
            pn: 'PPE-GG-01', uoi: 'EA', qty: 18, device: 'supplysystem',
            category: 'ppe', type: 'ppe_item', menu: '302', loc: 'B-L007'
        },
        {
            id: 'ear_defenders', name: 'Ear Defenders, SNR 32dB',
            pn: 'PPE-ED-32', uoi: 'EA', qty: 11, device: 'supplysystem',
            category: 'ppe', type: 'ppe_item', menu: '303', loc: 'B-L008'
        },
        {
            id: 'grinding_disc_115', name: '115mm Grinding Disc, Metal',
            pn: 'AB-115-M', uoi: 'EA', qty: 25, device: 'smartdrawer',
            category: 'abrasives', type: 'grinding_disc', menu: '401', loc: 'A-E001'
        },
        {
            id: 'cutting_disc_125', name: '125mm Cutting Disc, Stainless',
            pn: 'AB-125-S', uoi: 'EA', qty: 20, device: 'smartdrawer',
            category: 'abrasives', type: 'grinding_disc', menu: '402', loc: 'A-E002'
        },
        {
            id: 'scanner_tc22', name: 'Zebra TC22 Handheld Scanner',
            pn: 'HS-TC22', uoi: 'EA', qty: 3, device: 'supplysystem',
            category: 'inspection', type: 'handheld_scanner', menu: '501', loc: 'B-L010'
        },
        {
            id: 'shell_mill_arbor', name: '20mm Shell Mill Arbor',
            pn: 'TI-075-2', uoi: 'EA', qty: 2, device: 'smartdrawer',
            category: 'machine_tools', type: 'hand_tool', menu: '075', loc: 'A-D004'
        },
        {
            id: 'socket_cap_m10', name: 'M10 x 50 Socket Cap Screw, Box of 25',
            pn: 'TI-058-3', uoi: 'EA', qty: 16, device: 'smartdrawer',
            category: 'fasteners', type: 'fastener', menu: '058', loc: 'A-C015'
        },
        {
            id: 'spring_washer_m6', name: 'M6 Spring Washer, Box of 200',
            pn: 'TI-053-4', uoi: 'EA', qty: 22, device: 'smartdrawer',
            category: 'fasteners', type: 'fastener', menu: '053', loc: 'A-C016'
        },
        {
            id: 'hivis_vest', name: 'Hi-Vis Vest, Size L',
            pn: 'PPE-HV-01L', uoi: 'EA', qty: 26, device: 'supplysystem',
            category: 'ppe', type: 'ppe_item', menu: '304', loc: 'B-L011'
        },
        {
            id: 'dust_mask', name: 'FFP3 Dust Mask, Box of 10',
            pn: 'PPE-DM-FFP3', uoi: 'EA', qty: 15, device: 'supplysystem',
            category: 'ppe', type: 'ppe_item', menu: '305', loc: 'B-L012'
        },
        {
            id: 'safety_glasses', name: 'Safety Glasses, Tinted',
            pn: 'PPE-SG-02', uoi: 'EA', qty: 21, device: 'supplysystem',
            category: 'ppe', type: 'ppe_item', menu: '306', loc: 'B-L013'
        },
        {
            id: 'grinding_disc_178', name: '178mm Grinding Disc, Metal',
            pn: 'AB-178-M', uoi: 'EA', qty: 14, device: 'smartdrawer',
            category: 'abrasives', type: 'grinding_disc', menu: '403', loc: 'A-E003'
        },
        {
            id: 'flap_disc_115', name: '115mm Flap Disc, 80 Grit',
            pn: 'AB-115-F80', uoi: 'EA', qty: 30, device: 'smartdrawer',
            category: 'abrasives', type: 'grinding_disc', menu: '404', loc: 'A-E004'
        },
        {
            id: 'diamond_blade_125', name: '125mm Diamond Blade, Continuous Rim',
            pn: 'AB-125-D', uoi: 'EA', qty: 6, device: 'smartdrawer',
            category: 'abrasives', type: 'grinding_disc', menu: '405', loc: 'A-E005'
        },
        {
            id: 'wire_cup_brush', name: '100mm Wire Cup Brush',
            pn: 'AB-100-WC', uoi: 'EA', qty: 7, device: 'smartdrawer',
            category: 'abrasives', type: 'grinding_disc', menu: '406', loc: 'A-E006'
        }
    ];

    // Six rows fill the result panel on the real screen, so every category
    // needs at least that many or a category browse looks half empty.
    var ROWS_PER_SCREEN = 6;

    // ----------------------------------------------------------------
    // Lookups
    // ----------------------------------------------------------------

    var BY_ID = {};
    PRODUCTS.forEach(function (p) { BY_ID[p.id] = p; });

    var CAT_BY_ID = {};
    CATEGORIES.forEach(function (c) { CAT_BY_ID[c.id] = c; });

    function product(id) { return BY_ID[id] || null; }
    function category(id) { return CAT_BY_ID[id] || null; }

    function inCategory(catId) {
        return PRODUCTS.filter(function (p) { return p.category === catId; });
    }

    /* Products whose name or part number contains the term, case insensitive,
     * matches first.
     *
     * A search returning one row looks fake in front of a prospect, so the
     * result is padded out to a full screen: first the matches, then the rest
     * of the matches' own categories, then anything else. Exactly what a real
     * device would show, where a narrow search still lands on a populated
     * category listing. */
    function search(term) {
        var q = String(term || '').trim().toLowerCase();
        if (!q) return PRODUCTS.slice();

        var hits = PRODUCTS.filter(function (p) {
            return p.name.toLowerCase().indexOf(q) >= 0 || p.pn.toLowerCase().indexOf(q) >= 0;
        });
        if (hits.length >= ROWS_PER_SCREEN) return hits;

        var seen = {};
        hits.forEach(function (p) { seen[p.id] = true; });

        var cats = {};
        hits.forEach(function (p) { cats[p.category] = true; });

        var sameCat = PRODUCTS.filter(function (p) { return cats[p.category] && !seen[p.id]; });
        sameCat.forEach(function (p) { seen[p.id] = true; });

        var rest = PRODUCTS.filter(function (p) { return !seen[p.id]; });

        return hits.concat(sameCat, rest);
    }

    /* Options for a CMS dropdown, grouped so the operator sees the category. */
    function options() {
        var out = [];
        CATEGORIES.forEach(function (c) {
            inCategory(c.id).forEach(function (p) {
                out.push({ value: p.id, label: c.name + ' / ' + p.name + ' (' + p.pn + ')' });
            });
        });
        return out;
    }

    function categoryOptions() {
        return CATEGORIES.map(function (c) { return { value: c.id, label: c.name }; });
    }

    return {
        CATEGORIES: CATEGORIES,
        PRODUCTS: PRODUCTS,
        product: product,
        category: category,
        inCategory: inCategory,
        search: search,
        options: options,
        categoryOptions: categoryOptions
    };
});
