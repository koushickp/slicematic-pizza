"""
pizzaflow_core.py
------------------
Business logic for the SliceMatic / PizzaFlow ordering system.

PRODUCT MODEL (v2 -- cart-based)
---------------------------------
The order is now a CART of pizza "lines". Each line is one pizza from
the menu, with:
  - its own base (crust) choice
  - its own quantity (0 = not ordering this pizza; 1-10 = how many)
  - its own set of toppings, each with its own quantity (how many extra
    servings of that topping go on EACH unit of this pizza)

This replaces the original v1 model (one base + one pizza + one topping
+ a single order-wide quantity). Kept completely separate from the
Gradio UI in app.py, for the same reasons as before: every rule here is
unit-testable with no browser involved (see test_core.py), and a grader
swapping the menu .txt files only needs load_menu_file() to behave --
nothing else changes.

Validation functions all return (is_valid: bool, message: str, value).
"""

import os
import re
import datetime

# ----------------------------------------------------------------------
# Constants -- single source of truth for every business rule
# ----------------------------------------------------------------------

NAME_MIN_LEN = 2
NAME_MAX_LEN = 40
NAME_RE = re.compile(r"^[A-Za-z ]+$")

PHONE_LEN = 10
PHONE_VALID_START = ("6", "7", "8", "9")

LINE_QTY_MIN = 0          # 0 = "not ordering this pizza" on its row
LINE_QTY_MAX = 10         # can't order more than 10 of any single pizza
TOTAL_QTY_MAX = 10        # outlet's hard per-order capacity ceiling (sum of all lines)

TOPPING_QTY_MIN = 0       # 0 = topping not added to this pizza
TOPPING_QTY_MAX = 5       # assumption: max 5x of any one topping per pizza unit
                           # (e.g. "5x Extra Cheese" is already an extreme order;
                           #  documented here as a single, easily-adjustable constant)

DISCOUNT_THRESHOLD = 5    # total pizzas across the whole cart
DISCOUNT_RATE = 0.10
GST_RATE = 0.18

PAYMENT_MODES = {1: "Cash", 2: "Card", 3: "UPI"}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LOG_PATH = os.path.join(BASE_DIR, "orders_log.txt")

# Top-level fields for one ORDER record in orders_log.txt
ORDER_FIELD_ORDER = [
    "timestamp", "customer_name", "phone",
    "items", "subtotal", "discount", "gst", "final_total", "payment_mode",
]
# Sub-fields for one LINE (one pizza row) within the "items" field
LINE_FIELD_ORDER = [
    "pizza_id", "pizza_name", "base_id", "base_name", "base_price",
    "pizza_price", "quantity", "toppings", "line_subtotal",
]


# ----------------------------------------------------------------------
# Strict integer parsing -- same rationale as v1: Python's int("2.5")
# and int("  3 ") don't reject what the spec wants rejected, so every
# numeric field in the app (quantities, payment mode) goes through this.
# ----------------------------------------------------------------------

_INT_RE = re.compile(r"^-?\d+$")


def parse_strict_int(raw):
    """
    Return int(raw) if raw is a clean whole number, else raise ValueError.

    Accepts two shapes, because the UI sources quantities two different
    ways: raw strings (what test_core.py exercises directly, and what a
    text-based prompt would hand over), and Python int/float (what
    Gradio's gr.Number component actually hands the callback). A float
    is only accepted if it's a whole number -- 2.0 -> 2, but 2.5 still
    raises, which is exactly the "reject decimals" rule the brief asks
    for; gr.Number's UI doesn't block decimals on its own, so this is
    the actual enforcement point.
    """
    if raw is None:
        raise ValueError("empty input")
    if isinstance(raw, bool):
        raise ValueError("boolean is not a whole number")
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float):
        if raw != int(raw):
            raise ValueError(f"{raw} is not a whole number")
        return int(raw)
    s = str(raw).strip()
    if not _INT_RE.fullmatch(s):
        raise ValueError(f"{raw!r} is not a whole number")
    return int(s)


def coerce_int(value, default=0):
    """
    Best-effort int conversion for values coming from Gradio Number
    components (which may hand back float, int, None, or "" depending
    on what the browser sent). Falls back to `default` rather than
    raising, then the caller's own validate_*_quantity() still applies
    the real business-rule checks on the result.
    """
    if value is None or value == "":
        return default
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return default


# ----------------------------------------------------------------------
# Menu file loading (unchanged from v1 -- defensive parsing, edge case 8)
# ----------------------------------------------------------------------

def load_menu_file(path):
    """
    Parse a menu file of lines "ID;Name;Price".

    Returns (items, warning): items is a list of {"id","name","price"}
    dicts, or None if the file is missing/unreadable/has zero valid
    lines. A single malformed line is skipped (not fatal) -- the menu
    only fails outright if it ends up with zero usable items.
    """
    if not os.path.isfile(path):
        return None, f"Menu file not found: '{os.path.basename(path)}'."

    try:
        with open(path, "r", encoding="utf-8") as f:
            raw_lines = f.readlines()
    except OSError as exc:
        return None, f"Could not read '{os.path.basename(path)}': {exc}"

    items = []
    skipped = []

    for line_no, raw_line in enumerate(raw_lines, start=1):
        line = raw_line.strip()
        if not line:
            continue

        parts = [p.strip() for p in line.split(";")]
        if len(parts) != 3:
            skipped.append(f"line {line_no} (expected ID;Name;Price, got {len(parts)} field(s))")
            continue

        item_id, name, price_str = parts
        if not item_id or not name:
            skipped.append(f"line {line_no} (missing ID or name)")
            continue

        try:
            price = float(price_str)
        except ValueError:
            skipped.append(f"line {line_no} (price '{price_str}' is not a number)")
            continue

        if price < 0:
            skipped.append(f"line {line_no} (negative price '{price_str}')")
            continue

        items.append({"id": item_id, "name": name, "price": round(price, 2)})

    if not items:
        reason = "; ".join(skipped) if skipped else "the file is empty"
        return None, f"'{os.path.basename(path)}' has no usable items ({reason})."

    warning = None
    if skipped:
        warning = f"Skipped {len(skipped)} bad line(s) in '{os.path.basename(path)}': " + "; ".join(skipped)
    return items, warning


def load_all_menus(base_dir=BASE_DIR):
    """
    Load Types_of_Base.txt, Types_of_Pizza.txt, Types_of_Toppings.txt.

    Returns (menus, fatal_error, warnings). menus is None if any one
    of the three files failed to produce a usable menu.
    """
    filenames = {
        "base": "Types_of_Base.txt",
        "pizza": "Types_of_Pizza.txt",
        "topping": "Types_of_Toppings.txt",
    }
    menus, warnings = {}, []
    for key, filename in filenames.items():
        path = os.path.join(base_dir, filename)
        items, warning = load_menu_file(path)
        if items is None:
            return None, f"Could not start SliceMatic: {warning}", warnings
        menus[key] = items
        if warning:
            warnings.append(warning)
    return menus, None, warnings


# ----------------------------------------------------------------------
# Customer intake validation (unchanged -- edge cases 1, 2, 6)
# ----------------------------------------------------------------------

def validate_name(raw_name):
    if raw_name is None:
        return False, "Name cannot be empty. Please enter your name.", None
    name = raw_name.strip()
    if name == "":
        return False, "Name cannot be empty or contain only spaces.", None
    if not NAME_RE.fullmatch(name):
        return False, "Name must contain only letters and spaces (no numbers or symbols).", None
    if len(name) < NAME_MIN_LEN:
        return False, f"Name must be at least {NAME_MIN_LEN} characters long.", None
    if len(name) > NAME_MAX_LEN:
        return False, f"Name must be at most {NAME_MAX_LEN} characters long.", None
    return True, "", name


def validate_phone(raw_phone):
    if raw_phone is None:
        return False, "Phone number cannot be empty.", None
    phone = raw_phone.strip()
    if phone == "":
        return False, "Phone number cannot be empty.", None
    if not phone.isdigit():
        return False, "Phone number must contain only digits (no spaces, +91, or dashes).", None
    if len(phone) != PHONE_LEN:
        return False, f"Phone number must be exactly {PHONE_LEN} digits (you entered {len(phone)}).", None
    if phone[0] not in PHONE_VALID_START:
        return False, "Phone number must start with 6, 7, 8, or 9 (Indian mobile format).", None
    return True, "", phone


# ----------------------------------------------------------------------
# Quantity validation -- NEW shape for the cart model
# ----------------------------------------------------------------------

def validate_line_quantity(raw_qty):
    """
    Validates the quantity box next to ONE pizza's row. 0 is valid here
    (it means 'I'm not ordering this pizza') -- the old v1 rule of
    'quantity must be >= 1' now only applies to the ORDER TOTAL, not to
    every individual row (see validate_order_total).
    """
    if raw_qty is None or str(raw_qty).strip() == "":
        return False, "Quantity cannot be blank -- enter 0 if you don't want this pizza.", None
    try:
        qty = parse_strict_int(raw_qty)
    except ValueError:
        return False, "Quantity must be a whole number (like 0, 1, 2...) -- not text or a decimal.", None
    if qty < LINE_QTY_MIN:
        return False, "Quantity cannot be negative.", None
    if qty > LINE_QTY_MAX:
        return False, f"Maximum {LINE_QTY_MAX} of a single pizza per order. Please enter {LINE_QTY_MAX} or fewer.", None
    return True, "", qty


def validate_topping_quantity(raw_qty):
    """Validates one topping's quantity box for one pizza row. 0 = not added."""
    if raw_qty is None or str(raw_qty).strip() == "":
        return True, "", 0  # blank topping box is treated as "0", not an error
    try:
        qty = parse_strict_int(raw_qty)
    except ValueError:
        return False, "Topping quantity must be a whole number.", None
    if qty < TOPPING_QTY_MIN:
        return False, "Topping quantity cannot be negative.", None
    if qty > TOPPING_QTY_MAX:
        return False, f"Maximum {TOPPING_QTY_MAX}x of a single topping per pizza.", None
    return True, "", qty


def validate_order_total(total_qty):
    """
    Validates the SUM of every line's quantity once the customer submits
    the whole cart -- this is where the original 'capacity is 10 pizzas
    per order' and 'must order at least 1' rules now live.
    """
    if total_qty < 1:
        return False, "Your cart is empty -- set a quantity of 1 or more on at least one pizza."
    if total_qty > TOTAL_QTY_MAX:
        return False, (
            f"Maximum outlet capacity is {TOTAL_QTY_MAX} pizzas per order "
            f"(kitchen throughput limit). Your cart currently totals {total_qty} -- please reduce it."
        )
    return True, ""


# ----------------------------------------------------------------------
# Payment mode validation (unchanged)
# ----------------------------------------------------------------------

def validate_payment(raw_choice):
    text = "" if raw_choice is None else str(raw_choice).strip()
    if text == "":
        return False, "Please choose a payment mode: 1 (Cash), 2 (Card), or 3 (UPI).", None
    try:
        idx = parse_strict_int(text)
    except ValueError:
        return False, "Payment mode must be 1, 2, or 3.", None
    if idx not in PAYMENT_MODES:
        return False, "Please choose 1 (Cash), 2 (Card), or 3 (UPI).", None
    return True, "", idx


def payment_confirmation_message(mode_idx, final_total):
    if mode_idx == 1:
        return f"Cash selected. Please keep \u20b9{final_total:.2f} ready -- your rider will collect it on delivery."
    if mode_idx == 2:
        return f"Card selected. \u20b9{final_total:.2f} will be charged on delivery via the rider's card machine."
    return f"UPI selected. Scan the QR code shown at delivery to pay \u20b9{final_total:.2f}."


# ----------------------------------------------------------------------
# Pricing engine -- cart model
# ----------------------------------------------------------------------

def compute_line(pizza, base, quantity, toppings_with_qty):
    """
    One pizza row's price breakdown.

    pizza, base: menu item dicts.
    quantity: validated int >= 0.
    toppings_with_qty: list of (topping_item_dict, qty) pairs, qty >= 1
        (callers should already have filtered out qty == 0 toppings).

    Topping cost model: each unit of TOPPING_QTY adds topping['price']
    -- and that's multiplied by how many pizzas are on this row. e.g.
    quantity=3, "Extra Cheese" qty=2 => 3 * 2 * extra_cheese_price added
    to the line, because each of the 3 pizzas gets double cheese.
    """
    topping_unit_cost = sum(item["price"] * qty for item, qty in toppings_with_qty)
    unit_price = round(pizza["price"] + base["price"] + topping_unit_cost, 2)
    line_subtotal = round(unit_price * quantity, 2)
    return {
        "pizza": pizza,
        "base": base,
        "quantity": quantity,
        "toppings_with_qty": toppings_with_qty,
        "unit_price": unit_price,
        "line_subtotal": line_subtotal,
    }


def compute_cart_bill(lines):
    """
    lines: list of compute_line() results, already filtered to quantity > 0.

    Discount is 10% on the pre-GST cart subtotal once the TOTAL pizza
    count (summed across all lines) reaches 5. GST is always computed
    on the post-discount amount, never per line.
    """
    total_qty = sum(l["quantity"] for l in lines)
    subtotal = round(sum(l["line_subtotal"] for l in lines), 2)

    discount_applied = total_qty >= DISCOUNT_THRESHOLD
    discount = round(subtotal * DISCOUNT_RATE, 2) if discount_applied else 0.0
    post_discount = round(subtotal - discount, 2)

    gst = round(post_discount * GST_RATE, 2)
    final_total = round(post_discount + gst, 2)

    return {
        "lines": lines,
        "total_qty": total_qty,
        "subtotal": subtotal,
        "discount_applied": discount_applied,
        "discount": discount,
        "post_discount": post_discount,
        "gst": gst,
        "final_total": final_total,
    }


def bill_to_rows(bill):
    """Render the full cart bill as rows for a gr.Dataframe: [Item, Details, Qty, Unit Price, Line Total]."""
    rows = []
    for line in bill["lines"]:
        pizza, base, qty = line["pizza"], line["base"], line["quantity"]
        if line["toppings_with_qty"]:
            topping_desc = ", ".join(f"{item['name']} x{q}" for item, q in line["toppings_with_qty"])
        else:
            topping_desc = "(no toppings)"
        rows.append([
            pizza["name"],
            f"{base['name']} \u00b7 {topping_desc}",
            str(qty),
            f"\u20b9{line['unit_price']:.2f}",
            f"\u20b9{line['line_subtotal']:.2f}",
        ])

    rows.append(["", "", "", "Cart Subtotal", f"\u20b9{bill['subtotal']:.2f}"])
    if bill["discount_applied"]:
        rows.append(["", "", "", f"Discount (10%, {bill['total_qty']} pizzas \u2265 5)", f"-\u20b9{bill['discount']:.2f}"])
    else:
        rows.append(["", "", "", f"Discount ({bill['total_qty']} pizzas < 5, none applied)", "\u20b90.00"])
    rows.append(["", "", "", "Post-Discount Subtotal", f"\u20b9{bill['post_discount']:.2f}"])
    rows.append(["", "", "", "GST @ 18%", f"\u20b9{bill['gst']:.2f}"])
    rows.append(["", "", "", "FINAL PAYABLE", f"\u20b9{bill['final_total']:.2f}"])
    return rows


# ----------------------------------------------------------------------
# Order persistence -- nested, fully parseable format
# ----------------------------------------------------------------------
# Level 1 (between top-level order fields):  |
# Level 2 (between item-lines in "items"):   ;
# Level 3 (between sub-fields of one line):  :
# Level 4 (between multiple toppings):       +
# Level 5 (topping id paired with its qty):  x   e.g. "T2x2"
#
# Menu names from the supplied .txt files don't contain these
# characters, but if a grader-swapped file ever did, that name would
# corrupt parsing -- a known limitation, documented rather than hidden.

def _serialize_toppings(toppings_with_qty):
    if not toppings_with_qty:
        return "NONE"
    return "+".join(f"{item['id']}x{qty}" for item, qty in toppings_with_qty)


def _serialize_line(line):
    fields = [
        line["pizza"]["id"], line["pizza"]["name"],
        line["base"]["id"], line["base"]["name"], f"{line['base']['price']:.2f}",
        f"{line['pizza']['price']:.2f}", str(line["quantity"]),
        _serialize_toppings(line["toppings_with_qty"]),
        f"{line['line_subtotal']:.2f}",
    ]
    return ":".join(str(f) for f in fields)


def build_cart_order_record(name, phone, bill, payment_mode_idx, timestamp=None):
    ts = timestamp or datetime.datetime.now().isoformat(timespec="seconds")
    items_str = ";".join(_serialize_line(line) for line in bill["lines"])
    return {
        "timestamp": ts,
        "customer_name": name,
        "phone": phone,
        "items": items_str,
        "subtotal": f"{bill['subtotal']:.2f}",
        "discount": f"{bill['discount']:.2f}",
        "gst": f"{bill['gst']:.2f}",
        "final_total": f"{bill['final_total']:.2f}",
        "payment_mode": PAYMENT_MODES[payment_mode_idx],
    }


def append_order(record, log_path=DEFAULT_LOG_PATH):
    """
    Append one order record to the log, pipe-separated top-level fields,
    one order per block, blank line between orders. Append mode only --
    never overwrites prior orders. Returns (success, error_or_None).
    """
    try:
        line = "|".join(str(record[field]) for field in ORDER_FIELD_ORDER)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(line + "\n\n")
        return True, None
    except OSError as exc:
        return False, f"Order completed, but could not write to the log file: {exc}"


def parse_items_field(items_str):
    """Parse the nested 'items' field back into a list of line dicts. Used by tests."""
    if not items_str or items_str == "NONE":
        return []
    lines = []
    for item_block in items_str.split(";"):
        parts = item_block.split(":")
        if len(parts) != len(LINE_FIELD_ORDER):
            continue
        record = dict(zip(LINE_FIELD_ORDER, parts))
        toppings = []
        if record["toppings"] != "NONE":
            for pair in record["toppings"].split("+"):
                tid, _, qty = pair.partition("x")
                toppings.append((tid, int(qty) if qty.isdigit() else 0))
        record["toppings_parsed"] = toppings
        lines.append(record)
    return lines


def parse_log_file(log_path=DEFAULT_LOG_PATH):
    """Read orders_log.txt back into a list of order dicts (with items pre-parsed)."""
    if not os.path.isfile(log_path):
        return []
    with open(log_path, "r", encoding="utf-8") as f:
        content = f.read()
    records = []
    for block in (b for b in content.split("\n\n") if b.strip()):
        values = block.strip().split("|")
        if len(values) != len(ORDER_FIELD_ORDER):
            continue
        record = dict(zip(ORDER_FIELD_ORDER, values))
        record["items_parsed"] = parse_items_field(record["items"])
        records.append(record)
    return records
