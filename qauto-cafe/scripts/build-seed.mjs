import { readFileSync, writeFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { randomUUID } from 'node:crypto'

const buf = readFileSync(new URL('../seed-source/Q-Auto Directory 2026.xlsx', import.meta.url))
const zip = unzipSync(new Uint8Array(buf))
const xml = (p) => strFromU8(zip[p])
function decode(s){ return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#10;/g,'\n').replace(/&apos;/g,"'") }

// shared strings
const ss = []
{
  const s = xml('xl/sharedStrings.xml')
  for (const m of s.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1])
    ss.push(decode(texts.join('')))
  }
}

// workbook sheet -> target
const rels = {}
for (const m of xml('xl/_rels/workbook.xml.rels').matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rels[m[1]] = m[2]
const sheets = []
for (const m of xml('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) sheets.push([decode(m[1]), rels[m[2]]])

// Row-based parser to correctly handle self-closing cells mixed with content cells
function readSheet(target){
  const s = xml('xl/' + target.replace(/^\//,''))
  const rows = {}
  // Parse row by row to avoid cross-row regex ambiguity
  for (const rowM of s.matchAll(/<row\s+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNum = rowM[1]
    const rowContent = rowM[2]
    rows[rowNum] = {}
    // Match cells within the row: handles self-closing and content cells
    for (const cm of rowContent.matchAll(/<c\s+r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = cm[1]; const attrs = cm[2]; const body = cm[3] || ''
      const t = (attrs.match(/t="([^"]+)"/) || [])[1]
      let val = ''
      const vm = body.match(/<v>([\s\S]*?)<\/v>/)
      if (vm) val = t === 's' ? (ss[+vm[1]] ?? '') : decode(vm[1])
      else { const ism = body.match(/<is>([\s\S]*?)<\/is>/); if (ism) val = decode([...ism[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x=>x[1]).join('')) }
      rows[rowNum][col] = val
    }
  }
  return rows
}

const departments = []
const staff = []
const deptByName = new Map()
function titleCase(s){ return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) }
function deptId(name){
  if (!deptByName.has(name)) { const id = randomUUID(); deptByName.set(name, id); departments.push({ id, name: titleCase(name), mainExtension: '', active: true }) }
  return deptByName.get(name)
}

for (const [name, target] of sheets) {
  if (name === 'Q Auto Directory' || !target) continue
  const sheetKey = 'xl/' + target.replace(/^\//,'')
  if (!zip[sheetKey]) continue
  const rows = readSheet(target)
  let cur = null
  for (const r of Object.keys(rows).map(Number).sort((a,b)=>a-b)) {
    const A=(rows[r].A||'').trim(), B=(rows[r].B||'').trim(), D=(rows[r].D||'').trim(), E=(rows[r].E||'').trim()
    if (A && !B && !D && A.toLowerCase() !== 'name') { cur = A; continue }
    if (A && A.toLowerCase() !== 'name' && (B || D || E)) {
      staff.push({ id: randomUUID(), name: A, position: B, email: D, extension: E, departmentId: deptId(cur || name), active: true })
    }
  }
}

// ---- Fixed menu seed (placeholders; editable in admin) ----
const ing = (name, unit, stockQty, low) => ({ id: randomUUID(), name, unit, stockQty, lowStockThreshold: low })
const ingredients = [
  ing('Milk','ml',5000,1000), ing('Coffee Beans','g',2000,300), ing('Tea Bags','pcs',200,30),
  ing('Sugar','g',3000,500), ing('Chocolate Syrup','ml',1000,200), ing('Vanilla Syrup','ml',1000,200),
  ing('Ice','g',10000,2000), ing('Mint Leaves','g',300,50), ing('Lime','pcs',100,15),
  ing('Soda Water','ml',5000,1000), ing('Orange','pcs',100,15), ing('Paper Cup 8oz','pcs',500,50),
  ing('Paper Cup 12oz','pcs',500,50), ing('Protein Bar Unit','pcs',100,20), ing('Croissant','pcs',60,10),
]
const ingId = (n) => ingredients.find(i => i.name === n).id
const cat = (name, sortOrder) => ({ id: randomUUID(), name, sortOrder })
const categories = [
  cat('Hot Drinks',1), cat('Iced Drinks',2), cat('Tea',3), cat('Mojitos',4),
  cat('Fresh Juices',5), cat('Soft Drinks',6), cat('Pastries',7), cat('Protein Bars',8),
]
const catId = (n) => categories.find(c => c.name === n).id
const item = (name, catName, price, recipe) => ({ id: randomUUID(), name, categoryId: catId(catName), price, active: true, recipe })
const menuItems = [
  item('Latte','Hot Drinks',12,[{ingredientId:ingId('Milk'),qty:250},{ingredientId:ingId('Coffee Beans'),qty:18},{ingredientId:ingId('Paper Cup 12oz'),qty:1}]),
  item('Cappuccino','Hot Drinks',12,[{ingredientId:ingId('Milk'),qty:150},{ingredientId:ingId('Coffee Beans'),qty:18},{ingredientId:ingId('Paper Cup 8oz'),qty:1}]),
  item('Espresso','Hot Drinks',8,[{ingredientId:ingId('Coffee Beans'),qty:18},{ingredientId:ingId('Paper Cup 8oz'),qty:1}]),
  item('Turkish Coffee','Hot Drinks',10,[{ingredientId:ingId('Coffee Beans'),qty:14},{ingredientId:ingId('Paper Cup 8oz'),qty:1}]),
  item('Iced Latte','Iced Drinks',14,[{ingredientId:ingId('Milk'),qty:200},{ingredientId:ingId('Coffee Beans'),qty:18},{ingredientId:ingId('Ice'),qty:150},{ingredientId:ingId('Paper Cup 12oz'),qty:1}]),
  item('Green Tea','Tea',8,[{ingredientId:ingId('Tea Bags'),qty:1},{ingredientId:ingId('Paper Cup 8oz'),qty:1}]),
  item('Mint Lemonade Mojito','Mojitos',15,[{ingredientId:ingId('Mint Leaves'),qty:10},{ingredientId:ingId('Lime'),qty:1},{ingredientId:ingId('Soda Water'),qty:200},{ingredientId:ingId('Ice'),qty:150},{ingredientId:ingId('Paper Cup 12oz'),qty:1}]),
  item('Fresh Orange Juice','Fresh Juices',16,[{ingredientId:ingId('Orange'),qty:3},{ingredientId:ingId('Paper Cup 12oz'),qty:1}]),
  item('Water','Soft Drinks',3,[]),
  item('Soft Drink Can','Soft Drinks',5,[]),
  item('Butter Croissant','Pastries',9,[{ingredientId:ingId('Croissant'),qty:1}]),
  item('Protein Bar','Protein Bars',14,[{ingredientId:ingId('Protein Bar Unit'),qty:1}]),
]

const seed = { departments, staff, ingredients, categories, menuItems }
writeFileSync(new URL('../src/db/seed.data.json', import.meta.url), JSON.stringify(seed, null, 2))
console.log(`Seed written: ${departments.length} departments, ${staff.length} staff, ${menuItems.length} items`)
