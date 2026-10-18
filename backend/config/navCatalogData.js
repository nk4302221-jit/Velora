// =====================================================
// HOMEPAGE CATEGORY-NAV CATALOG (seed data only)
//
// The storefront's category navigation bar links to 13 departments. These
// entries are the seed rows that back those links so every nav item opens a
// populated listing through the EXISTING product API (GET /api/products
// filters on products.category_name) rather than a hardcoded homepage list.
//
// - NAV_CATEGORIES are inserted into `categories` (by name, if missing).
// - NAV_PRODUCTS are inserted into `products` (by name, if missing) and are
//   linked to their category by name -> id at seed time.
//
// Prices are in Indian Rupees (the store settles in INR). The seeding
// function in config/db.js (seedNavCatalog) is idempotent, so running it any
// number of times never duplicates rows.
// =====================================================

// slugify() matches the one used by the admin category controller so slugs
// generated here are consistent with the rest of the app.
export const slugify = (value) =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const NAV_CATEGORIES = [
  {
    name: 'Fashion',
    description: 'Shirts, t-shirts, jeans, dresses, footwear and clothing accessories',
    imageUrl: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Mobiles',
    description: 'Smartphones, feature phones and mobile accessories',
    imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Electronics',
    description: 'Laptops, headphones, monitors, keyboards and other electronics',
    imageUrl: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Beauty',
    description: 'Skincare, haircare, makeup and beauty accessories',
    imageUrl: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Home',
    description: 'Home decor, storage, kitchenware and household essentials',
    imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Appliances',
    description: 'Refrigerators, washing machines, mixers, microwaves and more',
    imageUrl: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Toys & Baby',
    description: 'Toys, games, baby-care products and baby accessories',
    imageUrl: 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Food & Health',
    description: 'Packaged foods, groceries and everyday health essentials',
    imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Auto Accessories',
    description: 'Car and bike accessories, chargers, holders and maintenance gear',
    imageUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Sports & Fitness',
    description: 'Fitness equipment, sportswear and sports accessories',
    imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Furniture',
    description: 'Chairs, tables, beds, sofas and storage furniture',
    imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Books',
    description: 'Educational books, novels, reference books and stationery',
    imageUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Two Wheelers',
    description: 'Motorcycles, scooters and relevant two-wheeler accessories',
    imageUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=800&auto=format&fit=crop&q=80',
  },
];

// image: Unsplash photo URLs, formatted identically to the existing seed.
export const NAV_PRODUCTS = [
  // -------------------------------------------------
  // Fashion
  // -------------------------------------------------
  {
    name: 'Allen Solly Slim Fit Formal Shirt',
    description: 'Slim fit formal shirt in premium cotton with a modern cut, wrinkle-resistant fabric and a crisp pointed collar for office and occasion wear.',
    categoryName: 'Fashion', brand: 'Allen Solly', price: 1299, discountPrice: 999, stock: 120,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 210,
  },
  {
    name: "Levi's 511 Slim Fit Jeans",
    description: 'Classic slim fit stretch jeans with a mid-rise waist, durable denim and signature back pocket stitching for everyday comfort.',
    categoryName: 'Fashion', brand: "Levi's", price: 2999, discountPrice: 2399, stock: 85,
    image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 340,
  },
  {
    name: 'H&M Floral Midi Dress',
    description: 'Flowy midi dress with a flattering floral print, adjustable straps and a soft breathable blend ideal for brunches and evenings out.',
    categoryName: 'Fashion', brand: 'H&M', price: 1899, discountPrice: 1499, stock: 60,
    image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&auto=format&fit=crop&q=80', rating: 4.3, ratingCount: 155,
  },
  {
    name: 'Nike Revolution 6 Running Shoes',
    description: 'Lightweight running shoes with a soft foam midsole, breathable mesh upper and durable rubber outsole for daily training and walks.',
    categoryName: 'Fashion', brand: 'Nike', price: 4495, discountPrice: 3596, stock: 75,
    image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&auto=format&fit=crop&q=80', rating: 4.6, ratingCount: 520,
  },
  {
    name: 'Titan Leather Analog Watch',
    description: 'Elegant analog watch with a genuine leather strap, stainless steel case, quartz movement and water resistance for refined everyday style.',
    categoryName: 'Fashion', brand: 'Titan', price: 3295, discountPrice: 2795, stock: 40,
    image: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 280,
  },

  // -------------------------------------------------
  // Mobiles
  // -------------------------------------------------
  {
    name: 'Samsung Galaxy S24 5G',
    description: 'Flagship smartphone with a 6.2-inch Dynamic AMOLED display, Exynos 2400 chipset, 50MP triple camera and all-day 4000mAh battery.',
    categoryName: 'Mobiles', brand: 'Samsung', price: 74999, discountPrice: 67999, stock: 30,
    image: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&auto=format&fit=crop&q=80', rating: 4.7, ratingCount: 890,
  },
  {
    name: 'Apple iPhone 15',
    description: 'iPhone with a 6.1-inch Super Retina XDR display, A16 Bionic chip, 48MP main camera and USB-C for fast charging and data.',
    categoryName: 'Mobiles', brand: 'Apple', price: 79900, discountPrice: 74900, stock: 25,
    image: 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800&auto=format&fit=crop&q=80', rating: 4.8, ratingCount: 1240,
  },
  {
    name: 'Redmi Note 13 Pro 5G',
    description: 'Mid-range phone with a 6.67-inch AMOLED display, 200MP camera, Snapdragon 7s Gen 2 and 67W turbo charging.',
    categoryName: 'Mobiles', brand: 'Xiaomi', price: 23999, discountPrice: 20999, stock: 110,
    image: 'https://images.unsplash.com/photo-1533228100845-08145b01de14?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 640,
  },
  {
    name: 'OnePlus Nord CE 4 Lite',
    description: 'Smooth 5G experience with a 120Hz AMOLED screen, 5500mAh battery, 80W SUPERVOOC charging and a clean OxygenOS build.',
    categoryName: 'Mobiles', brand: 'OnePlus', price: 19999, discountPrice: 17999, stock: 95,
    image: 'https://images.unsplash.com/photo-1585060544812-6b45742d762f?w=800&auto=format&fit=crop&q=80', rating: 4.3, ratingCount: 410,
  },
  {
    name: 'boAt Airdopes 141 TWS Earbuds',
    description: 'True wireless earbuds with 42 hours total playtime, ENx noise cancellation for calls, low-latency gaming mode and IPX4 water resistance.',
    categoryName: 'Mobiles', brand: 'boAt', price: 1499, discountPrice: 1099, stock: 260,
    image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop&q=80', rating: 4.2, ratingCount: 1580,
  },

  // -------------------------------------------------
  // Electronics
  // -------------------------------------------------
  {
    name: 'Sony WH-CH720N Wireless Headphones',
    description: 'Lightweight over-ear headphones with active noise cancellation, 35-hour battery life and multipoint Bluetooth pairing.',
    categoryName: 'Electronics', brand: 'Sony', price: 9990, discountPrice: 8490, stock: 55,
    image: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 420,
  },
  {
    name: 'HP Pavilion 15 Ryzen 5 Laptop',
    description: 'Everyday laptop with AMD Ryzen 5 7530U, 16GB RAM, 512GB SSD, backlit keyboard and a 15.6-inch FHD IPS display.',
    categoryName: 'Electronics', brand: 'HP', price: 58990, discountPrice: 52990, stock: 22,
    image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 310,
  },
  {
    name: 'Dell UltraSharp 27 4K Monitor',
    description: '27-inch 4K IPS monitor with factory-calibrated colour, USB-C connectivity, height-adjustable stand and ComfortView low blue light.',
    categoryName: 'Electronics', brand: 'Dell', price: 38999, discountPrice: 34999, stock: 18,
    image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&auto=format&fit=crop&q=80', rating: 4.6, ratingCount: 190,
  },
  {
    name: 'Logitech MX Keys S Wireless Keyboard',
    description: 'Fluid, precise typing with smart illumination, multi-device switching and a rechargeable battery in a low-profile aluminium design.',
    categoryName: 'Electronics', brand: 'Logitech', price: 8995, discountPrice: 7995, stock: 64,
    image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80', rating: 4.7, ratingCount: 275,
  },
  {
    name: 'Samsung 34-inch Ultra-Wide Curved Monitor',
    description: 'Immersive ultra-wide curved monitor with a 100Hz refresh rate, HDR10 and a wide colour gamut for work and entertainment.',
    categoryName: 'Electronics', brand: 'Samsung', price: 32999, discountPrice: 28999, stock: 14,
    image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 160,
  },

  // -------------------------------------------------
  // Beauty
  // -------------------------------------------------
  {
    name: 'Mamaearth Ubtan Face Wash',
    description: 'Gentle turmeric and saffron face wash that deep-cleanses, removes tan and is free of sulphates and parabens.',
    categoryName: 'Beauty', brand: 'Mamaearth', price: 399, discountPrice: 319, stock: 240,
    image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=800&auto=format&fit=crop&q=80', rating: 4.3, ratingCount: 980,
  },
  {
    name: "L'Oreal Revitalift Night Serum",
    description: 'Anti-ageing night serum with pure retinol and hyaluronic acid that reduces fine lines and renews skin overnight.',
    categoryName: 'Beauty', brand: "L'Oreal", price: 1299, discountPrice: 1099, stock: 90,
    image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 430,
  },
  {
    name: 'Lakme Absolute Matte Lipstick',
    description: 'Long-lasting matte lipstick with intense colour payoff and a lightweight, non-drying formula that stays put for hours.',
    categoryName: 'Beauty', brand: 'Lakme', price: 850, discountPrice: 720, stock: 160,
    image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 610,
  },
  {
    name: 'The Man Company Beard Oil',
    description: 'Almond and thyme beard oil that softens, nourishes and promotes healthier beard growth with a non-greasy finish.',
    categoryName: 'Beauty', brand: 'The Man Company', price: 349, discountPrice: 299, stock: 200,
    image: 'https://images.unsplash.com/photo-1621607512214-68297480165e?w=800&auto=format&fit=crop&q=80', rating: 4.2, ratingCount: 350,
  },
  {
    name: 'Philips Hair Dryer 1600W',
    description: 'Compact hair dryer with ThermoProtect technology for gentle drying, a slim concentrator nozzle and cool-shot setting.',
    categoryName: 'Beauty', brand: 'Philips', price: 1795, discountPrice: 1499, stock: 70,
    image: 'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 260,
  },

  // -------------------------------------------------
  // Home
  // -------------------------------------------------
  {
    name: 'Prestige Omega Deluxe Granite Kadai',
    description: '2-litre granite-coated kadai with an even-heat base, cool-touch handles and a durable non-stick interior for everyday cooking.',
    categoryName: 'Home', brand: 'Prestige', price: 1499, discountPrice: 1199, stock: 130,
    image: 'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 320,
  },
  {
    name: 'Milton Thermosteel Flask 1L',
    description: 'Double-wall vacuum insulated stainless steel flask that keeps drinks hot or cold for 24 hours, with a leak-proof cap.',
    categoryName: 'Home', brand: 'Milton', price: 899, discountPrice: 699, stock: 180,
    image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 890,
  },
  {
    name: 'Cello Plastic Storage Container Set',
    description: 'Set of 12 airtight food storage containers in assorted sizes that keep the pantry organised and food fresh.',
    categoryName: 'Home', brand: 'Cello', price: 699, discountPrice: 549, stock: 220,
    image: 'https://images.unsplash.com/photo-1584473457409-ae5c91d7d8b1?w=800&auto=format&fit=crop&q=80', rating: 4.2, ratingCount: 470,
  },
  {
    name: 'Philips LED Ceiling Light Panel',
    description: 'Slim recessed LED panel with uniform flicker-free illumination, high colour rendering and an ultra-long 15,000-hour life.',
    categoryName: 'Home', brand: 'Philips', price: 1299, discountPrice: 1049, stock: 95,
    image: 'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?w=800&auto=format&fit=crop&q=80', rating: 4.3, ratingCount: 210,
  },
  {
    name: 'Bombay Dyeing Cotton Bedsheet Set',
    description: 'King-size double bedsheet with two matching pillow covers in soft, breathable 144 TC cotton with a vivid printed design.',
    categoryName: 'Home', brand: 'Bombay Dyeing', price: 1599, discountPrice: 1199, stock: 140,
    image: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 530,
  },

  // -------------------------------------------------
  // Appliances
  // -------------------------------------------------
  {
    name: 'Whirlpool 265 L 3-Star Refrigerator',
    description: 'Frost-free double-door refrigerator with 6th Sense Technology, convertible freezer and stabiliser-free operation.',
    categoryName: 'Appliances', brand: 'Whirlpool', price: 28990, discountPrice: 25990, stock: 12,
    image: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 340,
  },
  {
    name: 'LG 7 KG Front Load Washing Machine',
    description: 'Front-load washer with AI Direct Drive, steam wash, inbuilt heater and a 6-motion DD for gentler, deeper cleaning.',
    categoryName: 'Appliances', brand: 'LG', price: 32990, discountPrice: 29990, stock: 9,
    image: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=800&auto=format&fit=crop&q=80', rating: 4.6, ratingCount: 280,
  },
  {
    name: 'Philips 750W Mixer Grinder',
    description: '3-jar mixer grinder with a powerful 750W motor, stainless steel blades and overload protection for daily Indian cooking.',
    categoryName: 'Appliances', brand: 'Philips', price: 3495, discountPrice: 2995, stock: 85,
    image: 'https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 610,
  },
  {
    name: 'IFB 25 L Convection Microwave',
    description: 'Convection microwave with 10 power levels, auto-cook menus, a child lock and a stainless steel cavity for grilling and baking.',
    categoryName: 'Appliances', brand: 'IFB', price: 12990, discountPrice: 11490, stock: 16,
    image: 'https://images.unsplash.com/photo-1585515320310-259814833e62?w=800&auto=format&fit=crop&q=80', rating: 4.3, ratingCount: 190,
  },
  {
    name: 'Bajaj Popcorn Maker 1200W',
    description: 'Hot-air popcorn maker that makes oil-free popcorn in minutes, with a removable chamber for easy cleaning.',
    categoryName: 'Appliances', brand: 'Bajaj', price: 1799, discountPrice: 1499, stock: 48,
    image: 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?w=800&auto=format&fit=crop&q=80', rating: 4.1, ratingCount: 140,
  },

  // -------------------------------------------------
  // Toys & Baby
  // -------------------------------------------------
  {
    name: 'LEGO Classic Bricks Set 484 Pcs',
    description: 'Creative brick box with 484 pieces in 35 colours, idea guide and a storage tub for open-ended building fun.',
    categoryName: 'Toys & Baby', brand: 'LEGO', price: 3499, discountPrice: 2999, stock: 40,
    image: 'https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=800&auto=format&fit=crop&q=80', rating: 4.8, ratingCount: 520,
  },
  {
    name: 'Funskool Board Game - Ludo',
    description: 'Classic Ludo board game with sturdy dice and tokens, perfect for family game nights and indoor fun.',
    categoryName: 'Toys & Baby', brand: 'Funskool', price: 349, discountPrice: 299, stock: 150,
    image: 'https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=800&auto=format&fit=crop&q=80', rating: 4.3, ratingCount: 260,
  },
  {
    name: 'Fisher-Price Kick & Play Piano Gym',
    description: 'Musical activity gym with 5 repositionable toy links, piano keys and 3 modes that grow with baby from tummy time to sitting.',
    categoryName: 'Toys & Baby', brand: 'Fisher-Price', price: 4999, discountPrice: 4299, stock: 28,
    image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800&auto=format&fit=crop&q=80', rating: 4.6, ratingCount: 310,
  },
  {
    name: 'Pampers All Round Protection Pants L',
    description: 'All-round protection baby pants with 360-degree fit, up to 12-hour absorbency and a wetness indicator.',
    categoryName: 'Toys & Baby', brand: 'Pampers', price: 999, discountPrice: 849, stock: 300,
    image: 'https://images.unsplash.com/photo-1560582861-45078880e48e?w=800&auto=format&fit=crop&q=80', rating: 4.7, ratingCount: 1120,
  },
  {
    name: 'Himalaya Baby Lotion 400ml',
    description: 'Gentle everyday baby lotion with olive oil and winter cherry that moisturises and protects delicate skin without greasiness.',
    categoryName: 'Toys & Baby', brand: 'Himalaya', price: 299, discountPrice: 255, stock: 210,
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 640,
  },

  // -------------------------------------------------
  // Food & Health
  // -------------------------------------------------
  {
    name: 'Tata Sampann Toor Dal 1kg',
    description: 'Unpolished toor dal rich in protein with a naturally sweet taste, sourced and processed for everyday Indian meals.',
    categoryName: 'Food & Health', brand: 'Tata', price: 165, discountPrice: 149, stock: 500,
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 890,
  },
  {
    name: "Kellogg's Original Corn Flakes 1kg",
    description: 'Crunchy fortified corn flakes with vitamins and minerals, a quick and wholesome breakfast with milk or curd.',
    categoryName: 'Food & Health', brand: "Kellogg's", price: 285, discountPrice: 249, stock: 320,
    image: 'https://images.unsplash.com/photo-1517093157656-b9eccef91cb1?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 560,
  },
  {
    name: 'Dabur Chyawanprash 1kg',
    description: 'Ayurvedic health supplement with amla and 40+ herbs that supports immunity, digestion and daily vitality.',
    categoryName: 'Food & Health', brand: 'Dabur', price: 399, discountPrice: 349, stock: 180,
    image: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=800&auto=format&fit=crop&q=80', rating: 4.6, ratingCount: 720,
  },
  {
    name: 'Amul Gold Full Cream Milk 1L',
    description: 'Full cream milk with 6% fat, pasteurised and homogenised for a rich taste in tea, coffee, desserts and cooking.',
    categoryName: 'Food & Health', brand: 'Amul', price: 78, discountPrice: 72, stock: 600,
    image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=800&auto=format&fit=crop&q=80', rating: 4.7, ratingCount: 1340,
  },
  {
    name: 'Nutrilite Daily Multivitamin 60 Tablets',
    description: 'Complete multivitamin with 23 essential vitamins and minerals plus phytonutrients for everyday energy and immunity.',
    categoryName: 'Food & Health', brand: 'Nutrilite', price: 1299, discountPrice: 1149, stock: 75,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 410,
  },

  // -------------------------------------------------
  // Auto Accessories
  // -------------------------------------------------
  {
    name: 'Bosch 12V Car Vacuum Cleaner',
    description: 'Portable high-suction car vacuum with HEPA filter, multiple nozzles and a long cord for deep interior cleaning.',
    categoryName: 'Auto Accessories', brand: 'Bosch', price: 3499, discountPrice: 2999, stock: 45,
    image: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=800&auto=format&fit=crop&q=80', rating: 4.3, ratingCount: 180,
  },
  {
    name: 'Ambrane 65W Fast Car Charger',
    description: 'Dual-port 65W car charger with PD and QC support, aluminium body and protection against over-current and overheating.',
    categoryName: 'Auto Accessories', brand: 'Ambrane', price: 899, discountPrice: 699, stock: 210,
    image: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 340,
  },
  {
    name: 'Autofy Universal Phone Holder',
    description: '360-degree rotating car vent phone mount with a strong clamp that fits most smartphones for secure navigation.',
    categoryName: 'Auto Accessories', brand: 'Autofy', price: 399, discountPrice: 299, stock: 320,
    image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80', rating: 4.2, ratingCount: 410,
  },
  {
    name: 'Michelin Car Cover All-Weather',
    description: 'Heavy-duty all-weather car cover with breathable layers, UV protection and elastic hems for a snug outdoor fit.',
    categoryName: 'Auto Accessories', brand: 'Michelin', price: 2499, discountPrice: 1999, stock: 30,
    image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&auto=format&fit=crop&q=80', rating: 4.3, ratingCount: 120,
  },
  {
    name: 'BikeMaster Chain Lubricant 500ml',
    description: 'High-performance dry chain lube that reduces friction, resists fling and keeps the drivetrain clean in all conditions.',
    categoryName: 'Auto Accessories', brand: 'BikeMaster', price: 649, discountPrice: 549, stock: 90,
    image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 95,
  },

  // -------------------------------------------------
  // Sports & Fitness
  // -------------------------------------------------
  {
    name: 'Adidas Resistance Bands Set',
    description: 'Set of 5 latex resistance bands in graduated strengths with a carry bag for strength training, rehab and stretching.',
    categoryName: 'Sports & Fitness', brand: 'Adidas', price: 1299, discountPrice: 999, stock: 160,
    image: 'https://images.unsplash.com/photo-1598289431512-b97b0917affc?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 380,
  },
  {
    name: 'Yonex Nanoray Light 18i Racket',
    description: 'Ultra-light badminton racket with an isometric head shape and nanomesh frame for fast, powerful clears and smashes.',
    categoryName: 'Sports & Fitness', brand: 'Yonex', price: 3299, discountPrice: 2799, stock: 55,
    image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 210,
  },
  {
    name: 'Nivia Storm Football Size 5',
    description: 'Hand-stitched thermobonded football with a durable rubber bladder and textured surface for grip on all surfaces.',
    categoryName: 'Sports & Fitness', brand: 'Nivia', price: 899, discountPrice: 749, stock: 120,
    image: 'https://images.unsplash.com/photo-1614632537190-23e4146777db?w=800&auto=format&fit=crop&q=80', rating: 4.3, ratingCount: 290,
  },
  {
    name: 'Boldfit Yoga Mat 6mm Anti-Skid',
    description: 'Non-slip 6mm TPE yoga mat with alignment lines, cushioning for joints and a free carry strap.',
    categoryName: 'Sports & Fitness', brand: 'Boldfit', price: 999, discountPrice: 799, stock: 200,
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 640,
  },
  {
    name: 'Kookaburra County Cricket Kit Bag',
    description: 'Spacious wheelie cricket kit bag with multiple compartments, padded shoulder straps and durable wheels for easy travel.',
    categoryName: 'Sports & Fitness', brand: 'Kookaburra', price: 4999, discountPrice: 4299, stock: 22,
    image: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&auto=format&fit=crop&q=80', rating: 4.2, ratingCount: 85,
  },

  // -------------------------------------------------
  // Furniture
  // -------------------------------------------------
  {
    name: 'Godrej Interio Aer-O-Form Chair',
    description: 'Ergonomic office chair with breathable mesh back, adjustable lumbar support, height-adjustable arms and a sturdy metal base.',
    categoryName: 'Furniture', brand: 'Godrej Interio', price: 8999, discountPrice: 7499, stock: 18,
    image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 240,
  },
  {
    name: 'Wakefit Orthopaedic Memory Foam Mattress Queen',
    description: 'Medium-firm memory foam mattress with zoned support and a washable cool-gel cover for restful, spine-friendly sleep.',
    categoryName: 'Furniture', brand: 'Wakefit', price: 15999, discountPrice: 12999, stock: 12,
    image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800&auto=format&fit=crop&q=80', rating: 4.6, ratingCount: 520,
  },
  {
    name: 'Durian Solid Wood Dining Table Set',
    description: '4-seater solid wood dining table with two chairs and two stools, finished with a protective lacquer for daily family meals.',
    categoryName: 'Furniture', brand: 'Durian', price: 24999, discountPrice: 21999, stock: 6,
    image: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 130,
  },
  {
    name: 'GreenSoul Urban 3-Seater Fabric Sofa',
    description: 'Modern 3-seater sofa with solid wood frame, high-density foam and a stain-resistant premium fabric upholstery.',
    categoryName: 'Furniture', brand: 'GreenSoul', price: 28999, discountPrice: 24999, stock: 5,
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 95,
  },
  {
    name: 'Nilkamal Freedom Cabinet Storage Unit',
    description: 'Multi-shelf plastic storage cabinet that is rust-proof, easy to assemble and ideal for bedrooms, kitchens and balconies.',
    categoryName: 'Furniture', brand: 'Nilkamal', price: 3499, discountPrice: 2999, stock: 40,
    image: 'https://images.unsplash.com/photo-1594026112284-02bb6f3352fe?w=800&auto=format&fit=crop&q=80', rating: 4.3, ratingCount: 310,
  },

  // -------------------------------------------------
  // Books
  // -------------------------------------------------
  {
    name: 'Wings of Fire - APJ Abdul Kalam',
    description: 'Inspiring autobiography of Dr. APJ Abdul Kalam, chronicling his journey from a small-town newspaper boy to the President of India.',
    categoryName: 'Books', brand: 'Bluemoon', price: 349, discountPrice: 299, stock: 260,
    image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&auto=format&fit=crop&q=80', rating: 4.8, ratingCount: 1580,
  },
  {
    name: 'NCERT Mathematics Class 10 (Set of 2)',
    description: 'Official NCERT mathematics textbooks for Class 10 as per the latest CBSE syllabus, with worked examples and exercises.',
    categoryName: 'Books', brand: 'NCERT', price: 450, discountPrice: 420, stock: 400,
    image: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800&auto=format&fit=crop&q=80', rating: 4.6, ratingCount: 720,
  },
  {
    name: "Oxford Advanced Learner's Dictionary 10th Ed",
    description: 'Best-selling learner dictionary with 193,500 words, Oxford 3000 keywords, example sentences and free digital access.',
    categoryName: 'Books', brand: 'Oxford', price: 999, discountPrice: 849, stock: 120,
    image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&auto=format&fit=crop&q=80', rating: 4.7, ratingCount: 380,
  },
  {
    name: 'The Psychology of Money (Paperback)',
    description: 'Morgan Housel timeless essays on the strange ways people think about money and the lessons that build lasting wealth.',
    categoryName: 'Books', brand: 'Jaico', price: 399, discountPrice: 339, stock: 180,
    image: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&auto=format&fit=crop&q=80', rating: 4.7, ratingCount: 940,
  },
  {
    name: 'Classmate Notebook Pack of 6 (172 pages)',
    description: 'Pack of six ruled notebooks with 172 double-sided pages, sturdy cover and smooth paper ideal for school and office notes.',
    categoryName: 'Books', brand: 'Classmate', price: 399, discountPrice: 349, stock: 350,
    image: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 510,
  },

  // -------------------------------------------------
  // Two Wheelers
  // -------------------------------------------------
  {
    name: 'Honda Activa 6G Scooter',
    description: '110cc gearless scooter with a refined eSP engine, external fuel filler, LED headlamp and enhanced fuel efficiency.',
    categoryName: 'Two Wheelers', brand: 'Honda', price: 78000, discountPrice: 74900, stock: 8,
    image: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=800&auto=format&fit=crop&q=80', rating: 4.6, ratingCount: 430,
  },
  {
    name: 'Royal Enfield Classic 350',
    description: 'Timeless 349cc cruiser with the J-series engine, dual-channel ABS and iconic styling for relaxed highway riding.',
    categoryName: 'Two Wheelers', brand: 'Royal Enfield', price: 193000, discountPrice: 187000, stock: 4,
    image: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=800&auto=format&fit=crop&q=80', rating: 4.7, ratingCount: 320,
  },
  {
    name: 'TVS Jupiter 125 Scooter',
    description: '125cc scooter with a large under-seat storage, external fuel fill, silent start and a comfortable long seat.',
    categoryName: 'Two Wheelers', brand: 'TVS', price: 92000, discountPrice: 88500, stock: 6,
    image: 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 280,
  },
  {
    name: 'Steelbird Full Face Helmet',
    description: 'ISI-certified full-face helmet with a scratch-resistant visor, hypoallergenic padding and aerodynamic ventilation.',
    categoryName: 'Two Wheelers', brand: 'Steelbird', price: 1999, discountPrice: 1699, stock: 90,
    image: 'https://images.unsplash.com/photo-1591637333184-19aa84b3e01f?w=800&auto=format&fit=crop&q=80', rating: 4.4, ratingCount: 460,
  },
  {
    name: 'Bajaj Pulsar NS200',
    description: '200cc sporty street bike with a triple spark engine, perimeter frame, dual-channel ABS and aggressive styling.',
    categoryName: 'Two Wheelers', brand: 'Bajaj', price: 149000, discountPrice: 143000, stock: 5,
    image: 'https://images.unsplash.com/photo-1449426468159-d96dbf08f19f?w=800&auto=format&fit=crop&q=80', rating: 4.5, ratingCount: 210,
  },
];
