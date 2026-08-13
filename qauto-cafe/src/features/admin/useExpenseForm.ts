import { useState } from 'react'
import type { FinanceExpense } from '../../db/schema'

export interface ExpenseForm {
  date: string
  category: FinanceExpense['category']
  vendor: string
  description: string
  amountQar: string
  reference: string
  notes: string
}

export const expenseDefaults = (): ExpenseForm => ({
  date: new Date().toISOString().slice(0, 10),
  category: 'supplies',
  vendor: '',
  description: '',
  amountQar: '',
  reference: '',
  notes: '',
})

export interface ExpenseFormState {
  form: ExpenseForm
  setForm: (form: ExpenseForm) => void
  reset: () => void
  /** Start a fresh expense for a requested item; everything else is left blank. */
  fromRequest: (description: string, estimateQar?: number) => void
}

/**
 * The add-expense form's state, held by the screen rather than the panel so a
 * requested item can be sent straight into it on a click.
 *
 * The alternative — passing a value in and copying it to state in an effect —
 * would not re-fire when the same item is clicked twice, and would set state
 * during render. Filling the form is an event, so it is written as one.
 */
export function useExpenseForm(): ExpenseFormState {
  const [form, setForm] = useState(expenseDefaults)

  return {
    form,
    setForm,
    reset: () => setForm(expenseDefaults()),
    fromRequest: (description, estimateQar) => setForm({
      ...expenseDefaults(),
      // Anything raised from a request is stock being bought in.
      category: 'supplies',
      description,
      // The amount is the price sheet's estimate when the item and its quantity
      // were both recognised, and blank when they were not — see estimateCost.
      // Either way the admin types over it with what was actually paid.
      amountQar: estimateQar != null ? String(estimateQar) : '',
      // Vendor, reference and notes stay empty: a request says what is needed,
      // never who sold it or against which invoice.
    }),
  }
}
