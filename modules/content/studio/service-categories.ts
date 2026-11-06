export type CategoryChoice = { id: string; label: string; description?: string; imageUrl?: string };
export type CategoryRow = { id: string; categoryId: string };

export function resolveServiceCategories(rows: CategoryRow[], choices: CategoryChoice[]) {
  return rows.flatMap(row => {
    const category = choices.find(choice => choice.id === row.categoryId);
    return category ? [{ ...row, name: category.label, description: category.description || "", imageUrl: category.imageUrl || "" }] : [];
  });
}

export function validateServiceCategories(rows: CategoryRow[], choices: CategoryChoice[]) {
  if (new Set(rows.map(row => row.categoryId)).size !== rows.length) throw new Error("Select each category only once");
  if (rows.some(row => !choices.some(choice => choice.id === row.categoryId))) throw new Error("A selected category is unavailable for this site");
}
