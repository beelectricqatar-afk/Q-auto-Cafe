import type { PriceListItem } from '../db/schema'

/**
 * The purchase price sheet, kept as the supplier quotes it: a price for a pack
 * of a given size.
 *
 * Prices are NOT reduced to a per-unit figure here. "QAR 95.00 for 2.5 kg" and
 * "QAR 38.00 for 700 mL" are how they are actually bought, and collapsing them
 * to a rate loses the pack — which is what a request is usually asking for.
 *
 * `match` is what to look for in a barista's request line. It carries the
 * inventory's own spellings as well as the sheet's, because the two disagree
 * often ("Orange" on the sheet is "Fresh Orange" in the inventory), and a name
 * that never matches is a price that never gets used.
 */
export const PRICE_LIST: PriceListItem[] = [
  { id: 'coffee-beans', name: 'Coffee Beans', section: 'Coffee', priceQar: 90, packQty: 1, packUom: 'kg', match: ['Coffee Beans'] },
  { id: 'turkish-coffee', name: 'Turkish Coffee', section: 'Coffee', priceQar: 50, packQty: 1, packUom: 'kg', match: ['Turkish Coffee'] },
  { id: 'full-fat-fresh-milk', name: 'Full Fat Fresh Milk', section: 'Milk', priceQar: 7.5, packQty: 1, packUom: 'liter', match: ['Full Fat Fresh Milk', 'Full Fat Milk', 'Fresh Milk'] },
  // The sheet's only other milk, and the same price. Lactose-free is bought as
  // a long-life carton, so requests for it are costed here.
  { id: 'low-fat-long-life-milk', name: 'Low Fat Long Life Milk', section: 'Milk', priceQar: 7.5, packQty: 1, packUom: 'liter', match: ['Low Fat Long Life Milk', 'Long Life Milk', 'Lactose Free Milk', 'Low Fat Milk'] },
  { id: 'condensed-milk', name: 'Condensed Milk', section: 'Milk', priceQar: 5.5, packQty: 1, packUom: 'each', match: ['Condensed Milk'] },
  { id: 'matcha-powder', name: 'Matcha Powder', section: 'Matcha', priceQar: 800, packQty: 1, packUom: 'kg', match: ['Yoo Matcha Powder', 'Matcha Powder'] },
  { id: 'matcha-syrup', name: 'Matcha Syrup', section: 'Matcha', priceQar: 80, packQty: 450, packUom: 'grams', match: ['Agave Matcha Syrup', 'Matcha Syrup'] },
  { id: 'chocolate-flakes', name: 'Chocolate Flakes', section: 'Chocolate', priceQar: 2.5, packQty: 1, packUom: 'each', match: ['Chocolate Flakes'] },
  { id: 'hot-chocolate-powder', name: 'Hot Chocolate Powder', section: 'Chocolate', priceQar: 75, packQty: 1, packUom: 'kg', match: ['Hot Chocolate Powder'] },
  { id: 'hershey-chocolate-syrup', name: 'Hershey Chocolate Syrup', section: 'Chocolate', priceQar: 17.5, packQty: 650, packUom: 'grams', match: ['Hersheys Chocolate Syrup', 'Hershey Chocolate Syrup'] },
  { id: 'chocolate-sauce', name: 'Chocolate Sauce', section: 'Chocolate', priceQar: 95, packQty: 2.5, packUom: 'kg', match: ['Dark Chocolate Sauce', 'Chocolate Sauce'] },
  { id: 'caramel-syrup', name: 'Caramel Syrup', section: 'Chocolate', priceQar: 95, packQty: 2.5, packUom: 'kg', match: ['Caramel Sauce', 'Caramel Syrup'] },
  { id: 'whipped-cream', name: 'Whipped Cream', section: 'Dairy', priceQar: 17.75, packQty: 250, packUom: 'grams', match: ['Whipped Cream'] },
  { id: 'sugar', name: 'Sugar', section: 'Sundries', priceQar: 0.11, packQty: 1, packUom: 'stick', match: ['Sugar'] },
  { id: 'english-breakfast', name: 'English Breakfast', section: 'Tea', priceQar: 17.75, packQty: 100, packUom: 'bag', match: ['English Breakfast', 'Red Tea'] },
  { id: 'green-tea', name: 'Green Tea', section: 'Tea', priceQar: 17.75, packQty: 100, packUom: 'bag', match: ['Green Tea'] },
  { id: 'honey', name: 'Honey', section: 'Sundries', priceQar: 9.5, packQty: 500, packUom: 'grams', match: ['Honey'] },

  { id: 'cup-14oz', name: '14oz Cup', section: 'Plastic Cups', priceQar: 0.3, packQty: 1, packUom: 'each', match: ['Plastic cups 14OZ', 'Plastic Cup 14OZ', '14oz Cup', '14OZ Cup'] },
  { id: 'cup-16oz', name: '16oz Cup', section: 'Plastic Cups', priceQar: 0.32, packQty: 1, packUom: 'each', match: ['Plastic Cups 16Oz', 'Plastic Cup 16OZ', '16oz Cup', '16OZ Cup'] },

  { id: '7up', name: '7up 150mL', section: 'Soda / Water', priceQar: 2, packQty: 1, packUom: 'each', match: ['7 Up', '7up'] },
  { id: 'sparkling-water', name: 'Sparkling Water', section: 'Soda / Water', priceQar: 3, packQty: 1, packUom: 'bottle', match: ['Al Rayyan Sparkling Water', 'Sparkling Water'] },

  { id: 'apple', name: 'Apple', section: 'Fruits / Herb', priceQar: 1.92, packQty: 1, packUom: 'each', match: ['Fresh Apple', 'Apple'] },
  { id: 'orange', name: 'Orange', section: 'Fruits / Herb', priceQar: 2.32, packQty: 1, packUom: 'each', match: ['Fresh Orange', 'Orange'] },
  { id: 'lemon', name: 'Lemon', section: 'Fruits / Herb', priceQar: 1.02, packQty: 1, packUom: 'each', match: ['Lemon'] },
  { id: 'hibiscus-flower', name: 'Hibiscus Flower', section: 'Fruits / Herb', priceQar: 65, packQty: 1, packUom: 'kg', match: ['Hibiscus Flowers', 'Hibiscus Flower'] },
  { id: 'mint-leaves', name: 'Mint Leaves', section: 'Fruits / Herb', priceQar: 3, packQty: 1, packUom: 'bundle', match: ['Mint Leaves'] },

  { id: 'monin-strawberry', name: 'Monin Strawberry', section: 'Syrup', priceQar: 38, packQty: 700, packUom: 'mL', match: ['Monin Strawberry Syrup', 'Monin Strawberry'] },
  { id: 'monin-passion-fruit', name: 'Monin Passion Fruit', section: 'Syrup', priceQar: 38, packQty: 700, packUom: 'mL', match: ['Monin Passion Fruit Syrup', 'Monin Passion Fruit'] },
  { id: 'monin-peach', name: 'Monin Peach', section: 'Syrup', priceQar: 38, packQty: 700, packUom: 'mL', match: ['Monin Peach Syrup', 'Monin Peach'] },
  { id: 'monin-watermelon', name: 'Monin Watermelon', section: 'Syrup', priceQar: 38, packQty: 700, packUom: 'mL', match: ['Monin Watermelon Syrup', 'Monin Watermelon'] },
  { id: 'monin-pomegranate', name: 'Monin Pomegranate', section: 'Syrup', priceQar: 38, packQty: 700, packUom: 'mL', match: ['Monin Pomegranate Syrup', 'Monin Pomegranate'] },
  { id: 'monin-wild-mint', name: 'Monin Wild Mint', section: 'Syrup', priceQar: 38, packQty: 700, packUom: 'mL', match: ['Monin Wild Mint Syrup', 'Monin Wild Mint'] },
  { id: 'monin-coconut', name: 'Monin Coconut', section: 'Syrup', priceQar: 38, packQty: 700, packUom: 'mL', match: ['Monin Coconut Syrup', 'Monin Coconut'] },
  { id: 'monin-cane-sugar', name: 'Monin Syrup Pure Cane Sugar', section: 'Syrup', priceQar: 48, packQty: 1, packUom: 'liter', match: ['Monin Sugar Cane Syrup', 'Monin Syrup Pure Cane Sugar', 'Monin Pure Cane Sugar'] },
  { id: 'monin-cloudy-lemonade', name: 'Monin Cloudy Lemonade', section: 'Syrup', priceQar: 48, packQty: 1, packUom: 'liter', match: ['Monin Cloudy Lemonade Syrup', 'Monin Cloudy Lemonade'] },
  { id: 'monin-blueberry', name: 'Monin Blueberry', section: 'Syrup', priceQar: 38, packQty: 700, packUom: 'mL', match: ['Monin Blueberry Syrup', 'Monin Blueberry'] },
  { id: 'monin-blue-lagoon', name: 'Monin Blue Lagoon', section: 'Syrup', priceQar: 38, packQty: 700, packUom: 'mL', match: ['Monin Blue Lagoon Syrup', 'Monin Blue Lagoon'] },

  { id: 'paper-cup-4oz', name: '4 oz', section: 'Paper Cups', priceQar: 0.5, packQty: 1, packUom: 'each', match: ['Paper Cups 4OZ', 'Paper Cup 4OZ', '4oz Paper Cup'] },
  { id: 'paper-cup-7oz', name: '7 oz', section: 'Paper Cups', priceQar: 0.85, packQty: 1, packUom: 'each', match: ['Paper Cups 7OZ', 'Paper Cup 7OZ', '7oz Paper Cup'] },
  { id: 'paper-cup-8oz', name: '8 oz', section: 'Paper Cups', priceQar: 0.95, packQty: 1, packUom: 'each', match: ['Paper Cup 8oz', 'Paper Cups 8OZ', '8oz Paper Cup'] },

  { id: 'grenade-protein-bar', name: 'Grenade Protein Bar', section: 'Protein Bar', priceQar: 16.5, packQty: 1, packUom: 'each', match: ['Grenade Protein Bar', 'Grenade Bar'] },
  { id: 'quest-protein-bar', name: 'Quest Protein Bar', section: 'Protein Bar', priceQar: 16.5, packQty: 1, packUom: 'each', match: ['Quest Protein Bar', 'Quest Bar'] },
]
