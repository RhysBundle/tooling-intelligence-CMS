/*
 * The CMS the demo looks user IDs up in. Over http(s), a user ID is looked up
 * here first, so a user made or changed in the CMS works in the demo straight
 * away. Relative to index.html: on SAGA the demo is at
 * /demos/tooling-intelligence/ and the CMS at /demos/tooling-intelligence/cms/.
 *
 * Whatever the CMS hasn't got, the user ID or its sequence, comes from
 * configs.js and sequences.js. So does everything from file://, or when the
 * CMS can't be reached. null turns the lookup off, so the demo runs on its
 * own files only, as an offline per-customer package should.
 *
 * For testing, ?cms=http://localhost:3000/ points one run at another CMS and
 * ?cms=off at none.
 */
window.TI_CMS = 'cms/';
