import { useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { MenuItem, Category, RecipeLine } from '../../db/schema'
import { CrudList } from '../../components/CrudList'
import { Modal } from '../../components/Modal'
import { RecipeEditor } from '../../components/RecipeEditor'
import { formatQar } from '../../domain/money'

export function MenuRecipesScreen({ data, refresh }: { data: Data; refresh: () => Promise<void> }) {
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null)
  const [recipe, setRecipe] = useState<RecipeLine[]>([])
  const openRecipe = (it: MenuItem) => { setRecipeItem(it); setRecipe(it.recipe) }
  const saveRecipe = async () => { if (!recipeItem) return; await repo.put('menuItems', { ...recipeItem, recipe }); setRecipeItem(null); await refresh() }
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <CrudList<Category>
        title="Categories"
        rows={[...data.categories].sort((a, b) => a.sortOrder - b.sortOrder)}
        fields={[{ name: 'name', label: 'Name' }, { name: 'sortOrder', label: 'Sort order', type: 'number' }]}
        rowLabel={c => <strong>{c.name}</strong>}
        empty={() => ({ name: '', sortOrder: data.categories.length + 1 })}
        onSave={async r => { await repo.put('categories', r); await refresh() }}
        onDelete={async id => { await repo.remove('categories', id); await refresh() }}
      />
      <CrudList<MenuItem>
        title="Menu Items"
        rows={data.menuItems}
        searchText={i => `${i.name} ${data.categories.find(c => c.id === i.categoryId)?.name ?? ''}`}
        searchPlaceholder="Search menu items by name or category…"
        fields={[
          { name: 'name', label: 'Name' },
          { name: 'categoryId', label: 'Category', type: 'select', options: data.categories.map(c => ({ value: c.id, label: c.name })) },
          { name: 'price', label: 'Price (QAR)', type: 'number' },
        ]}
        rowLabel={i => <span><strong>{i.name}</strong> · {formatQar(i.price)} · {i.recipe.length} ingredient(s) <button onClick={() => openRecipe(i)} style={{ marginLeft: 8, border: '1px solid var(--line)', borderRadius: 8, padding: '2px 10px', background: '#fff' }}>Edit recipe</button></span>}
        empty={() => ({ name: '', categoryId: data.categories[0]?.id ?? '', price: 0, active: true, recipe: [] })}
        onSave={async r => { await repo.put('menuItems', { ...r, active: true }); await refresh() }}
        onDelete={async id => { await repo.remove('menuItems', id); await refresh() }}
      />
      <Modal open={!!recipeItem} title={`Recipe — ${recipeItem?.name ?? ''}`} onClose={() => setRecipeItem(null)}>
        <div style={{ display: 'grid', gap: 8 }}>
          <RecipeEditor ingredients={data.ingredients} recipe={recipe} onChange={setRecipe} />
          <button onClick={saveRecipe} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 700 }}>Save recipe</button>
        </div>
      </Modal>
    </div>
  )
}
