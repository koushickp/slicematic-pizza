# 🍕 SliceMatic (PizzaFlow) Ordering System

> **Cohort 1 · Applied Project 1 — Stage 2 Gradio MVP**
>
> A robust, digital self-service ordering system for **SliceMatic**, a single-outlet pizza delivery brand in New Ashok Nagar, Delhi. This application eliminates order errors from phone-based intake, automatically calculates tax/discounts, and structures customer transactions into a machine-readable log.

---

## 📂 Project Directory Structure

The project directory has been organized into a professional, clean layout. Core executable files and data files remain in the root directory to guarantee absolute compatibility with automatic grading scripts.

```text
Slicematic_Pizza/
├── docs/                             # Project specifications and designs
│   ├── PizzaFlow_Assignment_Brief_FDE.pdf
│   ├── PizzaFlow_PRD_Combined.html  # Product Requirements Document
│   ├── SliceMatic_Business_Economics.pdf
│   └── Slicematic_MVP.pdf
├── Types_of_Base.txt                 # Menu: Base crust types and pricing
├── Types_of_Pizza.txt                # Menu: Pizza types and pricing
├── Types_of_Toppings.txt             # Menu: Toppings and pricing
├── app.py                            # Gradio multi-step Web UI
├── pizzaflow_core.py                 # Core business logic and validation engine
├── test_core.py                      # Automated test suite (65 check points)
├── generate_sample_log.py            # Script to generate sample log entries
├── orders_log.txt                    # Append-only persistent order database
├── requirements.txt                  # Python dependencies
└── README.md                         # Project documentation (this file)
```

---

## ⚡ Getting Started

### Prerequisites

Ensure you have Python 3.8+ installed on your system.

### 1. Installation

Install all required dependencies using `pip`:

```bash
pip install -r requirements.txt
```

*Note: The primary external dependency is `gradio`.*

### 2. Launching the App

To run the interactive Gradio MVP:

```bash
python app.py
```

After launching, open the local URL printed in the terminal (typically `http://127.0.0.1:7860`) in your web browser.

---

## 🧪 Testing and Verification

### Running Automated Tests

The core business logic is fully isolated from the Gradio UI, making it 100% unit-testable. The test suite covers all requirements, edge cases, pricing calculations, and file loaders.

To execute the 65 automated checks:

```bash
python test_core.py
```

### Resetting and Generating Sample Log Data

To generate a fresh, clean `orders_log.txt` with mock entries representing different order profiles (Cash, Card, UPI, discounted, and non-discounted):

```bash
python generate_sample_log.py
```

---

## 🛡️ Edge Cases Handled (Stage 2 Requirements)

Our codebase enforces strict validation to handle the 8 critical edge cases specified in the brief without throwing unhandled exceptions:

| # | Tested Edge Case | Code Validation & Expected Behavior |
|---|---|---|
| **1** | **Name with only spaces** | Leading/trailing whitespace is stripped. If empty, it fails length checks and raises a specific message: *"Name cannot be empty or contain only spaces."* |
| **2** | **Phone starting with 1** | Rejects numbers starting with invalid digits. Enforces Indian mobile formatting (first digit must be **6, 7, 8, or 9**). |
| **3** | **Quantity = 0 or 11** | Enforces a per-pizza order quantity limit (max **10**). Cart totals must sum to between **1 and 10** across all items, or else a capacity constraint error is displayed. |
| **4** | **Item selection out of range** | Handled inherently by Gradio's dropdown UI selectors. Any direct raw input goes through strict parsing and validation against loaded menu boundaries. |
| **5** | **Typed price instead of list number** | Direct entry validation parses inputs as menu indexes rather than price strings, identifying them as out-of-range or invalid. |
| **6** | **Empty input at every prompt** | Handled defensively on all fields. Rejects empty submissions with clear warnings, except for toppings, where empty is treated as `0` servings. |
| **7** | **Non-integer quantity (e.g. "three" / "2.5")** | Applies regular expression checks and strict integer conversion. Decimal numbers and alpha characters are immediately rejected. |
| **8** | **Menu file with missing price field** | The parser handles faulty lines gracefully. It logs startup warnings, skips the corrupted lines, and only crashes if the entire file has zero usable items. |

---

## ⚙️ Core Business Rules & Formulas

### 1. Pricing Engine

The system applies the following mathematical rules:

*   **Pizza Unit Price** = $\text{Pizza Price} + \text{Base Price} + \sum (\text{Topping Price} \times \text{Topping Qty})$
*   **Subtotal** = $\sum (\text{Pizza Unit Price} \times \text{Pizza Qty})$
*   **Discount** = If $\text{Total Pizzas} \ge 5$, apply a **10% discount** ($0.10 \times \text{Subtotal}$). Otherwise, $0.00$.
*   **GST** = **18%** applied to the **post-discount subtotal** ($\text{Post-Discount} \times 0.18$).
*   **Total Payable** = $\text{Post-Discount} + \text{GST}$.

### 2. File Formats & Persistence

Menu files (`Types_of_Base.txt`, `Types_of_Pizza.txt`, `Types_of_Toppings.txt`) use `ID;Name;Price` format:
```text
B1;Thin Crust;149
P1;Margherita;299
T2;Extra Cheese;69
```

Orders are persisted to `orders_log.txt` using a pipe-separated, multi-level nested format to capture complex carts:
```text
TIMESTAMP|CUSTOMER_NAME|PHONE|ITEMS|SUBTOTAL|DISCOUNT|GST|FINAL_TOTAL|PAYMENT_MODE
```
Items inside the `ITEMS` column are formatted as nested sub-fields:
```text
PizzaID:PizzaName:BaseID:BaseName:BasePrice:PizzaPrice:Qty:Toppings:LineSubtotal
```
*(Multiple pizza lines are separated by semicolons `;`, and toppings are serialized as `ToppingIDxQuantity` separated by pluses `+`)*
