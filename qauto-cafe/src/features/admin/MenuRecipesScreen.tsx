import { useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { MenuItem, Category, RecipeLine } from '../../db/schema'
import { CrudList } from '../../components/CrudList'
import { Modal } from '../../components/Modal'
import { RecipeEditor } from '../../components/RecipeEditor'
import { formatQar } from '../../domain/money'
import { Button } from '../../components/ui/button'

export function MenuRecipesScreen({ data, refresh }: { data: Data; refresh: () => Promise<void> }) {
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null)
  const [recipe, setRecipe] = useState<RecipeLine[]>([])
  const openRecipe = (it: MenuItem) => { setRecipeItem(it); setRecipe(it.recipe) }
  const saveRecipe = async () => { if (!recipeItem) return; await repo.put('menuItems', { ...recipeItem, recipe }); setRecipeItem(null); await refresh() }
  return (
    <div className="grid gap-6">
      <CrudList<Category>
        title="Categories"
        rows={[...data.categories].sort((a, b) => a.sortOrder - b.sortOrder)}
        fields={[{ name: 'name', label: 'Name' }, { name: 'sortOrder', label: 'Sort order', type: 'number' }]}
        rowLabel={c => <strong className="font-semibold">{c.name}</strong>}
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
        rowLabel={i => (
          <div className="grid gap-1">
            <strong className="font-semibold">{i.name}</strong>
            <span className="text-xs text-muted-foreground tabular-nums">{formatQar(i.price)} · {i.recipe.length} ingredient(s)</span>
            <Button variant="outline" size="sm" className="mt-1 h-8 justify-self-start px-3 text-xs" onClick={() => openRecipe(i)}>Edit recipe</Button>
          </div>
        )}
        empty={() => ({ name: '', categoryId: data.categories[0]?.id ?? '', price: 0, active: true, recipe: [] })}
        onSave={async r => { await repo.put('menuItems', { ...r, active: true }); await refresh() }}
        onDelete={async id => { await repo.remove('menuItems', id); await refresh() }}
      />
      <Modal open={!!recipeItem} title={`Recipe — ${recipeItem?.name ?? ''}`} onClose={() => setRecipeItem(null)}>
        <div className="grid gap-3">
          <RecipeEditor ingredients={data.ingredients} recipe={recipe} onChange={setRecipe} />
          <Button size="lg" onClick={saveRecipe}>Save recipe</Button>
        </div>
      </Modal>
    </div>
  )
}
