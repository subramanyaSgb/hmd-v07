"""
Canned sample of rows shaped exactly like Oracle cursor.fetchall() returns
from BF3.WB_TRANS_DATA_ITRO and BF5.ZWB_TRANSACTION_DATA_ITRO_B.

Used by test_wbatngl_trip_sync.py to mock the Oracle round-trip without
needing a live JSW connection.
"""
from datetime import datetime


# Schema for BF3.WB_TRANS_DATA_ITRO (23 cols)
BF3_COLS = [
    "TAPNO", "LADLENO", "TAPHOLE", "GROSS_WEIGHT", "TARE_WEIGHT", "NET_WEIGHT",
    "DESTINATION", "FIRST_TARE_TIME", "OUT_DATE", "TRIP_ID", "UPDATED_DATE",
    "SHIFT", "TARE_WEIGHT_ACTUAL", "NET_WEIGHT_ACTUAL", "SOURCE_LAB",
    "RECEIVED_DATE", "CLOSETIME", "TEMP", "S_L", "SMS_ACK_TIME", "LOC",
    "SI_L", "BDS_TEMP",
]

# Schema for BF5.ZWB_TRANSACTION_DATA_ITRO_B (20 cols, no SI_L/HTS_BDS_TEMP/LOC)
BF5_COLS = [
    "TAPNO", "LADLENO", "TAPHOLE", "GROSS_WEIGHT", "TARE_WEIGHT", "NET_WEIGHT",
    "DESTINATION", "FIRST_TARE_TIME", "OUT_DATE", "TRIP_ID", "UPDATED_DATE",
    "SHIFT", "TARE_WEIGHT_ACTUAL", "NET_WEIGHT_ACTUAL", "SOURCE_LAB",
    "RECEIVED_DATE", "CLOSETIME", "TEMP", "S_L", "SMS_ACK_TIME",
]


# Six rows, each as a tuple in BF3_COLS order
BF3_SAMPLE = [
    # 1. Typical good row
    (74558, "TLC 01", 3, 688.5, 337.5, 351.0,
     "SMS2", datetime(2026, 5, 7, 5, 10, 36), datetime(2026, 5, 7, 12, 31, 15),
     "74558TLC 011070526", datetime(2026, 5, 7, 9, 26, 13),
     "A", 349.8, 338.7, "BF4",
     "05/07/2026 11:03:20 AM", datetime(2026, 5, 7, 9, 52, 0),
     1500.42, 0.028, None, "BF3",
     0.64, None),

    # 2. Idle row — TEMP=0 (must become NULL), zero chemistry
    (74553, "TLC 01", 2, 682.9, 452.2, 230.7,
     "SMS2", datetime(2026, 5, 6, 19, 51, 38), datetime(2026, 5, 7, 5, 10, 36),
     "74553TLC 011070526", datetime(2026, 5, 7, 1, 25, 5),
     "C", 337.5, 345.4, "BF4",
     None, datetime(2026, 5, 7, 2, 9, 15),
     0.0, 0.0, None, "BF3",   # <-- TEMP=0, S_L=0
     0.0, None),               # <-- SI_L=0

    # 3. OTL ladle (must be filtered out)
    (20965, "OTL 23", 2, 188.9, 105.65, 83.25,
     "SMS2", None, datetime(2013, 7, 18, 14, 55, 0),
     "20965OTL 231", datetime(2013, 7, 18, 12, 55, 0),
     "B", 96.3, 92.6, "BF3",
     None, None,
     None, None, None, "BF3",
     None, None),

    # 4. Junk NET_WEIGHT (huge number — sync still stores it; aggregate
    #    queries should be defensive, not the sync)
    (74400, "TLC 19", 1, 7050.0, 300.0, 6750.0,
     "SMS2", datetime(2026, 5, 6, 10, 0, 0), datetime(2026, 5, 6, 11, 0, 0),
     "74400TLC 191060526", datetime(2026, 5, 6, 11, 0, 0),
     "A", 300.0, 6750.0, "BF3",
     None, None,
     1500.0, 0.03, None, "BF3",
     0.5, None),

    # 5. Out-of-spec chemistry: high S
    (74559, "TLC 21", 1, 691.2, 333.6, 357.6,
     "SMS2", datetime(2026, 5, 7, 6, 55, 57), datetime(2026, 5, 7, 14, 0, 0),
     "74559TLC 211070526", datetime(2026, 5, 7, 14, 59, 33),
     "B", 0.0, 0.0, "BF4",
     None, datetime(2026, 5, 7, 11, 30, 56),
     1479.7, 0.07, None, "BF3",  # <-- S_L 0.07 (out of spec)
     0.39, None),

    # 6. Out-of-spec: low temp
    (74600, "TLC 02", 4, 660.0, 320.0, 340.0,
     "SMS4", datetime(2026, 5, 7, 8, 0, 0), datetime(2026, 5, 7, 9, 0, 0),
     "74600TLC 021070526", datetime(2026, 5, 7, 9, 30, 0),
     "B", 0.0, 0.0, "BF3",
     None, datetime(2026, 5, 7, 9, 45, 0),
     1440.0, 0.025, None, "BF3",  # <-- TEMP 1440 (out of spec)
     0.55, None),
]


# Reduced view for BF5 (drops cols BF5 schema doesn't have)
BF5_SAMPLE = [
    (8261, "TLC 51", 3, 736.0, 399.0, 337.0,
     "SMS4", "07/05/2026 11:22:11", None,
     "8261TLC 511070526", datetime(2026, 5, 7, 16, 18, 7),
     "B", 0.0, 0.0, "BF5",
     None, None,
     0.0, 0.022, None),  # TEMP=0 -> NULL after sync
]
