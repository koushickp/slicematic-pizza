/**
 * menu.ts — Static menu data matching the .txt source files exactly.
 * Safe to import in any client or server component.
 * No Supabase dependency.
 */

export interface MenuItem {
  id: string;
  name: string;
  price: number;
}

export const PIZZAS: MenuItem[] = [
  { id: "P1", name: "Margherita",          price: 299 },
  { id: "P2", name: "Chicago Deep Dish",   price: 349 },
  { id: "P3", name: "Greek Mediterranean", price: 329 },
  { id: "P4", name: "California Veggie",   price: 339 },
  { id: "P5", name: "Farm House",          price: 319 },
  { id: "P6", name: "Pepperoni Classic",   price: 369 },
  { id: "P7", name: "BBQ Chicken",         price: 379 },
  { id: "P8", name: "Paneer Tikka",        price: 349 },
];

export const BASES: MenuItem[] = [
  { id: "B1", name: "Thin Crust",   price: 149 },
  { id: "B2", name: "Thick Crust",  price: 179 },
  { id: "B3", name: "Cheese Burst", price: 229 },
  { id: "B4", name: "Whole Wheat",  price: 159 },
  { id: "B5", name: "Multigrain",   price: 169 },
];

export const TOPPINGS: MenuItem[] = [
  { id: "T1",  name: "Black Olives",        price: 49 },
  { id: "T2",  name: "Extra Cheese",        price: 69 },
  { id: "T3",  name: "Button Mushrooms",    price: 49 },
  { id: "T4",  name: "Green Peppers",       price: 39 },
  { id: "T5",  name: "Jalapenos",           price: 39 },
  { id: "T6",  name: "Sun-Dried Tomatoes",  price: 59 },
  { id: "T7",  name: "Caramelised Onions",  price: 49 },
  { id: "T8",  name: "Sweet Corn",          price: 39 },
  { id: "T9",  name: "Roasted Garlic",      price: 49 },
  { id: "T10", name: "Peri-Peri Drizzle",   price: 59 },
];
