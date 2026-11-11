/*
 * The CMS the demo looks user IDs up in. Over http(s), a user ID is looked up
 * here first, so a user made or changed in the CMS works in the demo straight
 * away. A full address, so a copy of the demo served anywhere (an LMS, another
 * site, a local test server) still finds it; the CMS allows cross-origin
 * requests. render.bundletraining.com is Bundle's Hetzner server, with the
 * demo at / and the CMS at /cms/.
 *
 * Whatever the CMS hasn't got, the user ID or its sequence, comes from
 * configs.js and sequences.js. So does everything from file://, or when the
 * CMS can't be reached. null turns the lookup off, so the demo runs on its
 * own files only, as an offline per-customer package should.
 *
 * For testing, ?cms=http://localhost:3000/ points one run at another CMS and
 * ?cms=off at none.
 */
window.TI_CMS = 'https://render.bundletraining.com/cms/';
