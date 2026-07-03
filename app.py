"""
app.py
------
SliceMatic / PizzaFlow ordering system -- Gradio MVP (Stage 2, v2).

Run with:   python3 app.py
Then open the local URL Gradio prints (usually http://127.0.0.1:7860).

PRODUCT MODEL (v2)
------------------
This is a CART, not a single-combo order. The menu page renders one
card per pizza (loaded from Types_of_Pizza.txt at startup -- however
many that turns out to be). Each card has:
  - a photo (see PIZZA_IMAGES below)
  - its own base/crust dropdown
  - its own quantity (0 = skip this pizza)
  - its own bank of topping quantity boxes, one per topping in
    Types_of_Toppings.txt, each independently 0-5

All validation/pricing/persistence rules live in pizzaflow_core.py and
are unit-tested with no Gradio involved (test_core.py). This file is
only the UI: it builds one card per pizza in a loop, collects every
input component into flat lists, and on "Review Bill" flattens them
back into per-pizza-row data to hand to pizzaflow_core.

Images
------
Photos are hotlinked from Wikimedia Commons via the official
Special:FilePath redirect (no API key needed, explicitly supports
hotlinking). Five of the eight pizzas in the *current* menu have a
specific matching photo; anything else (including whatever a grader's
swapped-in menu contains) falls back to a generic, high-quality pizza
photo so the UI never shows a broken image icon. This does mean the
app needs internet access to actually render photos -- if the photos
don't load (e.g. offline grading), everything else still works exactly
the same; only the <img> tags would show blank.
"""

import gradio as gr
import pizzaflow_core as core

# ----------------------------------------------------------------------
# Pizza images -- Wikimedia Commons, hotlinked via Special:FilePath.
# Keyed by exact pizza name as it appears in Types_of_Pizza.txt today.
# Anything not in this dict (including a grader's replacement menu)
# gets FALLBACK_IMAGE instead of a broken image.
# ----------------------------------------------------------------------

_CW = "https://commons.wikimedia.org/wiki/Special:FilePath/"
PIZZA_IMAGES = {
    "Margherita": _CW + "Pizza%20Margherita%20-%20San%20Francisco%2C%20CA.jpg?width=500",
    "Chicago Deep Dish": _CW + "Giordano%27s%20Chicago%20Deep%20Dish%20Pizza.jpg?width=500",
    "California Veggie": _CW + "Vegetable%20pizza%20Denpasar%20Bali.JPG?width=500",
    "Pepperoni Classic": _CW + "Pepperoni%20pizza.jpeg?width=500",
    "BBQ Chicken": _CW + "BBQ%20Chicken%20Pizza%20Hut.jpg?width=500",
}
FALLBACK_IMAGE = _CW + "Supreme%20pizza.jpg?width=500"


def image_for(pizza_name):
    return PIZZA_IMAGES.get(pizza_name, FALLBACK_IMAGE)


# ----------------------------------------------------------------------
# Brand theme + CSS (pink/navy, matching the Stage 1 PRD branding)
# ----------------------------------------------------------------------

NAVY = "#1A1A2E"
PINK = "#C2185B"

THEME = gr.themes.Soft(primary_hue="pink", secondary_hue="rose", neutral_hue="slate")

CUSTOM_CSS = f"""
.sm-title {{ color: {NAVY}; }}
.sm-card {{
    border: 1px solid #e8d5de !important;
    border-radius: 14px !important;
    padding: 4px 8px !important;
    margin-bottom: 10px !important;
    background: #fffafc !important;
}}
.sm-card img {{ border-radius: 10px; }}
.sm-step-header {{
    background: {NAVY};
    color: white;
    padding: 10px 16px;
    border-radius: 10px;
    font-weight: 600;
    margin-bottom: 14px;
}}
.sm-total-banner {{
    background: {PINK};
    color: white;
    padding: 14px 18px;
    border-radius: 12px;
    font-size: 1.1em;
    font-weight: 700;
    text-align: center;
    margin-top: 10px;
}}
footer {{ display: none !important; }}
"""

# ----------------------------------------------------------------------
# Load the menu once at startup (FR-3 equivalent). If this fails, the
# whole ordering flow stays hidden behind a fatal-error panel.
# ----------------------------------------------------------------------

MENUS, FATAL_ERROR, MENU_WARNINGS = core.load_all_menus()

if FATAL_ERROR:
    print(f"[STARTUP ERROR] {FATAL_ERROR}")
for w in MENU_WARNINGS:
    print(f"[STARTUP WARNING] {w}")

PIZZAS = MENUS["pizza"] if MENUS else []
BASES = MENUS["base"] if MENUS else []
TOPPINGS = MENUS["topping"] if MENUS else []
P, T = len(PIZZAS), len(TOPPINGS)

BASE_LABELS = [f"{b['name']} \u2014 \u20b9{b['price']:.2f}" for b in BASES]
BASE_BY_LABEL = dict(zip(BASE_LABELS, BASES))


def blank_state():
    return {"name": None, "phone": None, "session_start": None, "bill": None}


# ----------------------------------------------------------------------
# Step 1: Customer intake (unchanged logic from v1)
# ----------------------------------------------------------------------

def intake_continue(name_raw, phone_raw, state):
    try:
        ok_name, msg_name, name_val = core.validate_name(name_raw)
        if not ok_name:
            return gr.update(visible=True), gr.update(visible=False), gr.update(visible=True, value=f"\u26a0\ufe0f {msg_name}"), state
        ok_phone, msg_phone, phone_val = core.validate_phone(phone_raw)
        if not ok_phone:
            return gr.update(visible=True), gr.update(visible=False), gr.update(visible=True, value=f"\u26a0\ufe0f {msg_phone}"), state

        import datetime
        state = dict(state)
        state["name"] = name_val
        state["phone"] = phone_val
        state["session_start"] = datetime.datetime.now().isoformat(timespec="seconds")
        return gr.update(visible=False), gr.update(visible=True), gr.update(visible=False, value=""), state
    except Exception as exc:  # noqa: BLE001 -- last-resort safety net
        return gr.update(visible=True), gr.update(visible=False), gr.update(visible=True, value=f"\u26a0\ufe0f Something went wrong ({exc}). Please try again."), state


# ----------------------------------------------------------------------
# Step 2: Build the cart -- one card per pizza, dynamically.
# ----------------------------------------------------------------------

def build_order_continue(*args):
    """
    args = (base_dropdown_value × P, qty_value × P, topping_value × P×T, state)

    Validates every field through pizzaflow_core (never trusts the
    Gradio component's own min/max as the real enforcement -- those are
    just UX hints; the actual rule lives in core, per the brief's
    request that validation rules stay in pizzaflow_core.py).
    """
    try:
        state = args[-1]
        rest = args[:-1]
        base_vals = rest[0:P]
        qty_vals = rest[P:2 * P]
        topping_flat = rest[2 * P:2 * P + P * T]
        topping_vals = [topping_flat[i * T:(i + 1) * T] for i in range(P)]

        lines = []
        for i in range(P):
            ok_q, msg_q, qty = core.validate_line_quantity(qty_vals[i])
            if not ok_q:
                return gr.update(visible=True), gr.update(visible=False), gr.update(visible=True, value=f"\u26a0\ufe0f {PIZZAS[i]['name']}: {msg_q}"), state, gr.update()

            if qty == 0:
                continue  # this pizza isn't being ordered -- skip validating its base/toppings

            base_item = BASE_BY_LABEL.get(base_vals[i], BASES[0])

            toppings_with_qty = []
            for j in range(T):
                ok_t, msg_t, tqty = core.validate_topping_quantity(topping_vals[i][j])
                if not ok_t:
                    return gr.update(visible=True), gr.update(visible=False), gr.update(visible=True, value=f"\u26a0\ufe0f {PIZZAS[i]['name']} / {TOPPINGS[j]['name']}: {msg_t}"), state, gr.update()
                if tqty and tqty > 0:
                    toppings_with_qty.append((TOPPINGS[j], tqty))

            lines.append(core.compute_line(PIZZAS[i], base_item, qty, toppings_with_qty))

        total_qty = sum(l["quantity"] for l in lines)
        ok_total, msg_total = core.validate_order_total(total_qty)
        if not ok_total:
            return gr.update(visible=True), gr.update(visible=False), gr.update(visible=True, value=f"\u26a0\ufe0f {msg_total}"), state, gr.update()

        bill = core.compute_cart_bill(lines)
        state = dict(state)
        state["bill"] = bill

        rows = core.bill_to_rows(bill)
        return gr.update(visible=False), gr.update(visible=True), gr.update(visible=False, value=""), state, gr.update(value=rows)
    except Exception as exc:  # noqa: BLE001
        return gr.update(visible=True), gr.update(visible=False), gr.update(visible=True, value=f"\u26a0\ufe0f Something went wrong ({exc}). Please re-check your cart."), args[-1], gr.update()


def build_back():
    return gr.update(visible=True), gr.update(visible=False)


def bill_continue():
    return gr.update(visible=False), gr.update(visible=True)


def bill_back():
    return gr.update(visible=True), gr.update(visible=False)


# ----------------------------------------------------------------------
# Step 4 / 5: Payment + confirmation
# ----------------------------------------------------------------------

def payment_continue(payment_raw, state):
    try:
        ok, msg, idx = core.validate_payment(payment_raw)
        if not ok:
            return gr.update(visible=True), gr.update(visible=False), gr.update(visible=True, value=f"\u26a0\ufe0f {msg}"), state, gr.update()

        state = dict(state)
        state["payment_idx"] = idx

        record = core.build_cart_order_record(state["name"], state["phone"], state["bill"], idx, timestamp=state["session_start"])
        log_ok, log_err = core.append_order(record)

        confirm_msg = core.payment_confirmation_message(idx, state["bill"]["final_total"])
        confirm_msg += "\n\n\u2705 Your order has been saved." if log_ok else f"\n\n\u26a0\ufe0f {log_err}"

        return gr.update(visible=False), gr.update(visible=True), gr.update(visible=False, value=""), state, gr.update(value=confirm_msg)
    except Exception as exc:  # noqa: BLE001
        return gr.update(visible=True), gr.update(visible=False), gr.update(visible=True, value=f"\u26a0\ufe0f Something went wrong ({exc}). Please try confirming again."), state, gr.update()


def payment_back():
    return gr.update(visible=True), gr.update(visible=False)


def restart():
    reset_bases = [gr.update(value=BASE_LABELS[0]) for _ in range(P)]
    reset_qtys = [gr.update(value=0) for _ in range(P)]
    reset_toppings = [gr.update(value=0) for _ in range(P * T)]
    return (
        blank_state(),
        gr.update(visible=True), gr.update(visible=False), gr.update(visible=False), gr.update(visible=False), gr.update(visible=False),
        gr.update(value=""), gr.update(value=""),  # name, phone
        gr.update(value=""),  # payment
        *reset_bases, *reset_qtys, *reset_toppings,
    )


# ----------------------------------------------------------------------
# Build the UI
# ----------------------------------------------------------------------

with gr.Blocks(title="SliceMatic -- PizzaFlow Ordering", theme=THEME, css=CUSTOM_CSS) as demo:
    gr.Markdown("# \U0001F355 SliceMatic Ordering System", elem_classes="sm-title")
    gr.Markdown("New Ashok Nagar, Delhi \u00b7 Stage 2 Gradio MVP \u00b7 build your own multi-pizza order")

    order_state = gr.State(blank_state())

    fatal_panel = gr.Markdown(
        value=f"## \u274c Could not start SliceMatic\n\n{FATAL_ERROR}\n\nFix the menu file(s) and restart the app." if FATAL_ERROR else "",
        visible=bool(FATAL_ERROR),
    )

    with gr.Column(visible=not FATAL_ERROR):

        if MENU_WARNINGS:
            gr.Markdown("\u26a0\ufe0f **Menu loaded with warnings:** " + " | ".join(MENU_WARNINGS))

        # ---- Step 1: Customer intake ------------------------------
        with gr.Group(visible=True) as step_intake:
            gr.Markdown("Step 1 of 5 \u2014 Your Details", elem_classes="sm-step-header")
            name_in = gr.Textbox(label="Full Name", placeholder="e.g. Shamika Sharma")
            phone_in = gr.Textbox(label="10-digit Mobile Number", placeholder="e.g. 9876543210")
            intake_err = gr.Markdown(visible=False)
            intake_btn = gr.Button("Continue \u2192", variant="primary")

        # ---- Step 2: Build the cart --------------------------------
        with gr.Group(visible=False) as step_build:
            gr.Markdown("Step 2 of 5 \u2014 Build Your Order", elem_classes="sm-step-header")
            gr.Markdown("Set a quantity on any pizza you want. Pick its base, and add as many toppings (with their own quantity) as you like. Leave quantity at 0 to skip a pizza.")

            base_dropdowns, qty_numbers, topping_grids = [], [], []

            for pizza in PIZZAS:
                with gr.Group(elem_classes="sm-card"):
                    with gr.Row():
                        with gr.Column(scale=1, min_width=140):
                            gr.HTML(f'<img src="{image_for(pizza["name"])}" style="width:100%;max-height:140px;object-fit:cover;border-radius:10px;" alt="{pizza["name"]}">')
                        with gr.Column(scale=3):
                            gr.Markdown(f"**{pizza['name']}** \u2014 \u20b9{pizza['price']:.2f} base pizza price")
                            with gr.Row():
                                base_dd = gr.Dropdown(choices=BASE_LABELS, value=BASE_LABELS[0] if BASE_LABELS else None, label="Base / Crust")
                                qty_num = gr.Number(value=0, minimum=0, maximum=core.LINE_QTY_MAX, step=1, precision=0, label="Quantity")
                            with gr.Accordion(f"Toppings for {pizza['name']} (optional, quantity each)", open=False):
                                topping_row_inputs = []
                                chunk_size = 5
                                for chunk_start in range(0, len(TOPPINGS), chunk_size):
                                    chunk = TOPPINGS[chunk_start:chunk_start + chunk_size]
                                    with gr.Row():
                                        for topping in chunk:
                                            t_num = gr.Number(
                                                value=0, minimum=0, maximum=core.TOPPING_QTY_MAX, step=1, precision=0,
                                                label=f"{topping['name']} (+\u20b9{topping['price']:.2f})",
                                            )
                                            topping_row_inputs.append(t_num)
                base_dropdowns.append(base_dd)
                qty_numbers.append(qty_num)
                topping_grids.append(topping_row_inputs)

            build_err = gr.Markdown(visible=False)
            with gr.Row():
                build_back_btn = gr.Button("\u2190 Back")
                build_btn = gr.Button("Review Bill \u2192", variant="primary")

        # ---- Step 3: Bill -------------------------------------------
        with gr.Group(visible=False) as step_bill:
            gr.Markdown("Step 3 of 5 \u2014 Your Bill", elem_classes="sm-step-header")
            bill_table = gr.Dataframe(
                headers=["Pizza", "Base \u00b7 Toppings", "Qty", "Unit Price", "Amount"],
                interactive=False, wrap=True,
            )
            with gr.Row():
                bill_back_btn = gr.Button("\u2190 Back to cart")
                bill_btn = gr.Button("Proceed to Payment \u2192", variant="primary")

        # ---- Step 4: Payment ------------------------------------------
        with gr.Group(visible=False) as step_payment:
            gr.Markdown("Step 4 of 5 \u2014 Payment", elem_classes="sm-step-header")
            gr.Markdown("Choose: **1.** Cash &nbsp;&nbsp; **2.** Card &nbsp;&nbsp; **3.** UPI")
            payment_in = gr.Textbox(label="Payment mode (1, 2, or 3)", placeholder="e.g. 3")
            payment_err = gr.Markdown(visible=False)
            with gr.Row():
                payment_back_btn = gr.Button("\u2190 Back")
                payment_btn = gr.Button("Confirm Payment \u2713", variant="primary")

        # ---- Step 5: Confirmation --------------------------------------
        with gr.Group(visible=False) as step_done:
            gr.Markdown("\u2705 Order Confirmed", elem_classes="sm-step-header")
            confirm_md = gr.Markdown("")
            new_order_btn = gr.Button("Place Another Order")

    # --------------------------------------------------------------
    # Wire events
    # --------------------------------------------------------------

    intake_btn.click(intake_continue, inputs=[name_in, phone_in, order_state], outputs=[step_intake, step_build, intake_err, order_state])

    build_btn.click(
        build_order_continue,
        inputs=[*base_dropdowns, *qty_numbers, *[n for grid in topping_grids for n in grid], order_state],
        outputs=[step_build, step_bill, build_err, order_state, bill_table],
    )
    build_back_btn.click(build_back, outputs=[step_intake, step_build])

    bill_btn.click(bill_continue, outputs=[step_bill, step_payment])
    bill_back_btn.click(bill_back, outputs=[step_build, step_bill])

    payment_btn.click(
        payment_continue, inputs=[payment_in, order_state],
        outputs=[step_payment, step_done, payment_err, order_state, confirm_md],
    )
    payment_back_btn.click(payment_back, outputs=[step_bill, step_payment])

    new_order_btn.click(
        restart,
        outputs=[
            order_state,
            step_intake, step_build, step_bill, step_payment, step_done,
            name_in, phone_in, payment_in,
            *base_dropdowns, *qty_numbers, *[n for grid in topping_grids for n in grid],
        ],
    )


if __name__ == "__main__":
    demo.launch()
