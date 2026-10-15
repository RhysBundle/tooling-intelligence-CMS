"""
The renders screen-swap can work on, and what their device screen shows when.

Each segment is a run of frames showing one phase 1 artwork (the render used
it as the screen's texture), with the frame its track is seeded from by SIFT
and the screen of ours that replaces it:
  take    the Take screen: the product and where to get it
  return  the same for putting it back
  loan    the message box after a take, with the loan period
  list    Select Product, as the device goes back to it afterwards

dissolves: frames where the render crossfades from one segment to the next,
as {frame: share of the next segment}.

Source renders are in GDrive-example; frame numbers count from 1.
"""

CLIPS = {
    'take-smartdrawer': {
        'source': 'Videos/ActionVideos/Adjusted/SmartDrawerTakeOut.mp4',
        'demo_copy': 'assets/video/take-smartdrawer.mp4',
        'kind': 'take', 'solution': 'smartdrawer',
        'segments': [
            {'frames': (1, 170), 'art': '05_SmartDrawer_Checkout/05_CheckOut_8.png', 'seed': 60, 'screen': 'take'},
            {'frames': (172, 380), 'art': '05_SmartDrawer_Checkout/05_CheckOut_9.png', 'seed': 211, 'screen': 'loan'},
        ],
        'dissolves': {171: 0.5},
    },
    'return-smartdrawer': {
        'source': 'Videos/ActionVideos/Adjusted/SmartDrawerCheckIn.mp4',
        'demo_copy': 'assets/video/return-smartdrawer.mp4',
        'kind': 'return', 'solution': 'smartdrawer',
        'segments': [
            {'frames': (1, 266), 'art': '06_SmartDrawer_CheckIn/06_CheckIn_5A.png', 'seed': 101, 'screen': 'return'},
            {'frames': (268, 367), 'art': '06_SmartDrawer_CheckIn/06_CheckIn_6.png', 'seed': 290, 'screen': 'list'},
        ],
        'dissolves': {267: 0.5},
    },
    'take-supplysystem': {
        'source': 'Videos/ActionVideos/Adjusted/SupplyVendTakeOut.mp4',
        'demo_copy': 'assets/video/take-supplysystem.mp4',
        'kind': 'take', 'solution': 'supplysystem',
        'segments': [
            {'frames': (1, 14), 'art': '13_SupplySystem_CheckIn/13_CheckIn_5.png', 'seed': 12, 'screen': 'take'},
            {'frames': (17, 299), 'art': '05_SmartDrawer_Checkout/05_CheckOut_9.png', 'seed': 281, 'screen': 'loan'},
        ],
        'dissolves': {15: 1 / 3, 16: 2 / 3},
    },
    'return-supplysystem': {
        'source': 'Videos/ActionVideos/Adjusted/SupplyVendCheckIn.mp4',
        'demo_copy': 'assets/video/return-supplysystem.mp4',
        'kind': 'return', 'solution': 'supplysystem',
        'segments': [
            {'frames': (1, 333), 'art': '13_SupplySystem_CheckIn/13_CheckIn_5A.png', 'seed': 121, 'screen': 'return'},
            {'frames': (335, 392), 'art': '12_SupplySystem_CheckOut/SupplySystem_Items.png', 'seed': 381, 'screen': 'list'},
        ],
        'dissolves': {334: 0.5},
    },
}
