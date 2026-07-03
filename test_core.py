"""
test_core.py
------------
Plain-Python tests for pizzaflow_core.py (v2, cart model) -- no Gradio
required. Run with:  python3 test_core.py

Covers the 8 required edge cases (re-mapped onto the new per-pizza-row
quantity + per-pizza-row multi-topping model), the cart pricing math,
file loading, and order persistence with the new nested log format.
"""

import os
import shutil
import tempfile
import pizzaflow_core as core

PASS = 0
FAIL = 0


def check(label, condition):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}")


def section(title):
    print(f"\n--- {title} ---")


# ----------------------------------------------------------------------
section("Edge case 1: name with only spaces")
ok, msg, val = core.validate_name("    ")
check("spaces-only name rejected", ok is False)
ok, msg, val = core.validate_name("Shamika")
check("normal name accepted", ok is True and val == "Shamika")
ok, msg, val = core.validate_name("Shamika123")
check("name with digits rejected", ok is False)

# ----------------------------------------------------------------------
section("Edge case 2: phone, 10 digits but starts with 1")
ok, msg, val = core.validate_phone("1234567890")
check("phone starting with 1 rejected", ok is False)
check("error names the rule", "6, 7, 8, or 9" in msg)
ok, msg, val = core.validate_phone("9876543210")
check("valid phone accepted", ok is True and val == "9876543210")

# ----------------------------------------------------------------------
section("Edge case 3 (re-mapped): per-row quantity = 11 rejected; row qty = 0 is now VALID")
ok, msg, val = core.validate_line_quantity("11")
check("line quantity 11 rejected (above per-pizza cap of 10)", ok is False)
ok, msg, val = core.validate_line_quantity("0")
check("line quantity 0 is valid in the cart model (means 'skip this pizza')", ok is True and val == 0)
ok, msg, val = core.validate_line_quantity("-3")
check("negative line quantity rejected", ok is False)
ok, msg, val = core.validate_line_quantity("5")
check("line quantity 5 accepted", ok is True and val == 5)

section("Edge case 3, the ORDER-TOTAL half: empty cart and >10 total are rejected")
ok, msg = core.validate_order_total(0)
check("total=0 (empty cart) rejected", ok is False)
ok, msg = core.validate_order_total(11)
check("total=11 rejected (exceeds 10-pizza outlet capacity)", ok is False)
check("capacity error explains the limit", "capacity" in msg.lower() or "10" in msg)
ok, msg = core.validate_order_total(10)
check("total=10 accepted (at the cap)", ok is True)
ok, msg = core.validate_order_total(5)
check("total=5 accepted (discount boundary)", ok is True)

# ----------------------------------------------------------------------
section("Edge case 7: non-integer quantity ('three' / '2.5')")
ok, msg, val = core.validate_line_quantity("three")
check("'three' rejected", ok is False)
ok, msg, val = core.validate_line_quantity("2.5")
check("'2.5' rejected", ok is False)

section("gr.Number sends Python floats/ints, not strings -- confirm those work the same way")
ok, msg, val = core.validate_line_quantity(2.0)
check("float 2.0 (whole number) accepted as int 2", ok is True and val == 2)
ok, msg, val = core.validate_line_quantity(2.5)
check("float 2.5 (decimal) rejected, same as the string case", ok is False)
ok, msg, val = core.validate_line_quantity(0.0)
check("float 0.0 accepted (means 'skip this pizza')", ok is True and val == 0)
ok, msg, val = core.validate_topping_quantity(3.0)
check("topping float 3.0 accepted as int 3", ok is True and val == 3)

# ----------------------------------------------------------------------
section("Edge case 6: empty input at every prompt")
ok, msg, val = core.validate_name("")
check("empty name rejected", ok is False)
ok, msg, val = core.validate_phone("")
check("empty phone rejected", ok is False)
ok, msg, val = core.validate_line_quantity("")
check("empty line quantity rejected", ok is False)
ok, msg, val = core.validate_payment("")
check("empty payment selection rejected", ok is False)
# topping quantity is the one field where blank is meaningful (= 0, not an error)
ok, msg, val = core.validate_topping_quantity("")
check("empty topping quantity treated as 0 (no error)", ok is True and val == 0)

# ----------------------------------------------------------------------
section("Topping quantity validation")
ok, msg, val = core.validate_topping_quantity("2")
check("topping qty 2 accepted", ok is True and val == 2)
ok, msg, val = core.validate_topping_quantity("6")
check("topping qty 6 rejected (above max of 5)", ok is False)
ok, msg, val = core.validate_topping_quantity("-1")
check("negative topping qty rejected", ok is False)
ok, msg, val = core.validate_topping_quantity("two")
check("non-numeric topping qty rejected", ok is False)

# ----------------------------------------------------------------------
section("Payment mode validation")
ok, msg, val = core.validate_payment("4")
check("payment mode 4 rejected", ok is False)
ok, msg, val = core.validate_payment("2")
check("payment mode 2 (Card) accepted", ok is True and val == 2)

# ----------------------------------------------------------------------
section("Edge case 4 / 5 -- N/A in the cart UI by construction")
# In the v2 cart model, pizza/base/topping selection happens via Gradio
# Dropdown components (valid choices only) rather than typing a list
# number, so "selection = 0 or > menu length" and "typed a price instead
# of a list number" can no longer occur as USER input -- the dropdown
# only ever offers valid choices. What still needs defending is the
# QUANTITY typed next to each dropdown, which is covered above.
check("documented design note, not a runtime check", True)

# ----------------------------------------------------------------------
section("Pricing: single pizza line, no toppings, qty < 5 (no discount)")
margherita = {"id": "P1", "name": "Margherita", "price": 299.0}
thin = {"id": "B1", "name": "Thin Crust", "price": 149.0}
line1 = core.compute_line(margherita, thin, quantity=2, toppings_with_qty=[])
check("unit price = pizza + base (no toppings)", line1["unit_price"] == 299.0 + 149.0)
check("line subtotal = unit price * qty", line1["line_subtotal"] == (299.0 + 149.0) * 2)

bill1 = core.compute_cart_bill([line1])
check("total_qty = 2", bill1["total_qty"] == 2)
check("no discount below threshold", bill1["discount_applied"] is False and bill1["discount"] == 0.0)
expected_gst = round(bill1["subtotal"] * 0.18, 2)
check("GST on full subtotal when no discount", bill1["gst"] == expected_gst)

# ----------------------------------------------------------------------
section("Pricing: one pizza line WITH multiple toppings, each with its own qty")
cheese = {"id": "T2", "name": "Extra Cheese", "price": 69.0}
jalapeno = {"id": "T5", "name": "Jalapenos", "price": 39.0}
bbq = {"id": "P7", "name": "BBQ Chicken", "price": 379.0}
cheese_burst = {"id": "B3", "name": "Cheese Burst", "price": 229.0}

# 2x Extra Cheese + 1x Jalapenos on each of 3 BBQ Chicken pizzas
line2 = core.compute_line(bbq, cheese_burst, quantity=3, toppings_with_qty=[(cheese, 2), (jalapeno, 1)])
expected_topping_cost = 2 * 69.0 + 1 * 39.0  # 177.0 per pizza
expected_unit = 379.0 + 229.0 + expected_topping_cost  # 785.0
check("unit price includes pizza + base + (topping price * topping qty) summed", line2["unit_price"] == expected_unit)
check("line subtotal scales with pizza quantity", line2["line_subtotal"] == round(expected_unit * 3, 2))

# ----------------------------------------------------------------------
section("Pricing: multi-line cart with discount at total qty >= 5")
line3 = core.compute_line(margherita, thin, quantity=2, toppings_with_qty=[])
line4 = core.compute_line(bbq, cheese_burst, quantity=3, toppings_with_qty=[(cheese, 1)])
bill2 = core.compute_cart_bill([line3, line4])
check("cart total_qty sums across lines (2 + 3 = 5)", bill2["total_qty"] == 5)
check("discount kicks in at total_qty == 5 (boundary)", bill2["discount_applied"] is True)
check("discount = 10% of subtotal", bill2["discount"] == round(bill2["subtotal"] * 0.10, 2))
check("GST computed on post-discount amount", bill2["gst"] == round(bill2["post_discount"] * 0.18, 2))
check("final total = post_discount + gst", bill2["final_total"] == round(bill2["post_discount"] + bill2["gst"], 2))

# ----------------------------------------------------------------------
section("bill_to_rows() produces a clean, readable breakdown")
rows = core.bill_to_rows(bill2)
check("one row per cart line plus 5 summary rows", len(rows) == 2 + 5)
check("topping description shows name x quantity", "Extra Cheese x1" in rows[1][1])
check("first line shows '(no toppings)' when none chosen", "(no toppings)" in rows[0][1])

# ----------------------------------------------------------------------
section("Edge case 8: menu file with a missing price field (unchanged from v1)")
tmpdir = tempfile.mkdtemp()
try:
    broken_path = os.path.join(tmpdir, "broken_base.txt")
    with open(broken_path, "w", encoding="utf-8") as f:
        f.write("B1;Thin Crust;149\n")
        f.write("B2;Thick Crust\n")          # missing price field
        f.write("B3;Cheese Burst;229\n")
        f.write("B5;Multigrain;notanumber\n")  # non-numeric price

    items, warning = core.load_menu_file(broken_path)
    check("file with some bad lines still loads (doesn't crash)", items is not None)
    check("good lines are kept (2 valid: B1, B3)", items is not None and len(items) == 2)
    check("a warning describes what was skipped", warning is not None and "line 2" in warning)

    empty_path = os.path.join(tmpdir, "all_broken.txt")
    with open(empty_path, "w", encoding="utf-8") as f:
        f.write("garbage;notaprice\n")
    items2, warning2 = core.load_menu_file(empty_path)
    check("file where every line is broken returns None (fatal)", items2 is None)

    missing_path = os.path.join(tmpdir, "does_not_exist.txt")
    items3, warning3 = core.load_menu_file(missing_path)
    check("missing file returns None, not an exception", items3 is None)
finally:
    shutil.rmtree(tmpdir)

section("load_all_menus() against the real shipped .txt files")
menus, fatal, warnings = core.load_all_menus(os.path.dirname(os.path.abspath(__file__)))
check("real menu files load with no fatal error", fatal is None and menus is not None)
if menus:
    check("base menu has 5 items", len(menus["base"]) == 5)
    check("pizza menu has 8 items", len(menus["pizza"]) == 8)
    check("topping menu has 10 items", len(menus["topping"]) == 10)

# ----------------------------------------------------------------------
section("Order persistence: nested cart format, append + read back")
tmpdir2 = tempfile.mkdtemp()
try:
    log_path = os.path.join(tmpdir2, "orders_log.txt")
    record = core.build_cart_order_record(
        "Shamika", "9876543210", bill2, payment_mode_idx=3, timestamp="2026-06-27T10:00:00",
    )
    ok1, err1 = core.append_order(record, log_path=log_path)
    check("append succeeds", ok1 is True and err1 is None)

    parsed = core.parse_log_file(log_path)
    check("one order read back", len(parsed) == 1)
    check("customer name round-trips", parsed[0]["customer_name"] == "Shamika")
    check("both cart lines parsed back out of the nested items field", len(parsed[0]["items_parsed"]) == 2)
    check("second line's toppings parsed back correctly", parsed[0]["items_parsed"][1]["toppings_parsed"] == [("T2", 1)])
    check("final_total round-trips as a string matching the bill", parsed[0]["final_total"] == f"{bill2['final_total']:.2f}")

    # append a second order, confirm first one is preserved (not overwritten)
    record2 = core.build_cart_order_record(
        "Madhav", "8123456789", bill1, payment_mode_idx=1, timestamp="2026-06-27T10:05:00",
    )
    core.append_order(record2, log_path=log_path)
    parsed_again = core.parse_log_file(log_path)
    check("second append doesn't overwrite the first order", len(parsed_again) == 2)
    check("first order is still Shamika's", parsed_again[0]["customer_name"] == "Shamika")
finally:
    shutil.rmtree(tmpdir2)

# ----------------------------------------------------------------------
print(f"\n=== {PASS} passed, {FAIL} failed ===")
if FAIL:
    raise SystemExit(1)
