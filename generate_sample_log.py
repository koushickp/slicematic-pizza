"""
generate_sample_log.py
------------------------
Produces a clean sample orders_log.txt for submission, using the exact
same pizzaflow_core functions the live app uses (no duplicated logic).
Run with:  python3 generate_sample_log.py

Three sample carts:
  1. Single pizza, no toppings, qty 1 (no discount) -- Cash
  2. Multi-pizza cart hitting the 5-pizza discount, with multiple
     toppings (different quantities) on one of the lines -- UPI
  3. Two different pizzas with different bases, one topping each,
     total under 5 (no discount) -- Card
"""

import os
import pizzaflow_core as core

LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "orders_log.txt")

if os.path.exists(LOG_PATH):
    os.remove(LOG_PATH)

menus, fatal, warnings = core.load_all_menus()
if fatal:
    raise SystemExit(f"Cannot generate sample log -- menu failed to load: {fatal}")

base, pizza, topping = menus["base"], menus["pizza"], menus["topping"]


def b(i):
    return base[i - 1]


def p(i):
    return pizza[i - 1]


def t(i):
    return topping[i - 1]


samples = [
    # (customer_name, phone, lines, payment_idx, timestamp)
    (
        "Rohan Gupta", "7000011122",
        [core.compute_line(p(2), b(2), quantity=1, toppings_with_qty=[])],
        2, "2026-06-27T12:05:11",
    ),
    (
        "Shamika Sharma", "9876543210",
        [
            core.compute_line(p(7), b(3), quantity=3, toppings_with_qty=[(t(2), 2), (t(5), 1)]),
            core.compute_line(p(1), b(1), quantity=2, toppings_with_qty=[(t(2), 1)]),
        ],
        3, "2026-06-27T13:40:02",
    ),
    (
        "Madhav Iyer", "8123456789",
        [
            core.compute_line(p(4), b(4), quantity=1, toppings_with_qty=[(t(8), 1)]),
            core.compute_line(p(8), b(1), quantity=1, toppings_with_qty=[(t(1), 2)]),
        ],
        1, "2026-06-27T19:12:47",
    ),
]

for name, phone, lines, pay_idx, ts in samples:
    bill = core.compute_cart_bill(lines)
    record = core.build_cart_order_record(name, phone, bill, pay_idx, timestamp=ts)
    ok, err = core.append_order(record, log_path=LOG_PATH)
    if not ok:
        raise SystemExit(f"Failed to write sample order: {err}")

print(f"Wrote {len(samples)} sample orders to {LOG_PATH}\n")
with open(LOG_PATH) as f:
    print(f.read())
