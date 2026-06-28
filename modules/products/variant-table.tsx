"use client";

import { useCallback, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui";
import { cx } from "@/components/ui/utils";
import { useEditorTabBadge } from "./product-editor-tabs";

export type VariantRow = {
  compareAtPrice: string;
  id: string;
  inventoryQuantity: string;
  isActive: boolean;
  isDefault: boolean;
  name: string;
  optionLabel: string;
  price: string;
  sku: string;
  sortOrder: number;
  stockLabel: string;
  trackInventory: boolean;
};

type VariantTableProps = {
  productId: string;
  updateAction: (formData: FormData) => void | Promise<void>;
  variants: VariantRow[];
};

export function VariantTable({ productId, updateAction, variants }: VariantTableProps) {
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  useEditorTabBadge("variants", dirty.size);

  const markDirty = useCallback((id: string) => {
    setDirty((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  if (!variants.length) {
    return (
      <p className="muted-text">
        No variants yet. Add an option group and generate a matrix, or add a single variant below.
      </p>
    );
  }

  return (
    <div
      className="product-variant-table-scroll"
      onChange={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>("[data-variant-id]");
        if (row?.dataset.variantId) markDirty(row.dataset.variantId);
      }}>
      <table className="catalog-product-table product-variant-table">
        <thead>
          <tr>
            <th>Variant</th>
            <th>Price</th>
            <th>Compare-at</th>
            <th>SKU</th>
            <th>Track</th>
            <th>Qty</th>
            <th>Default</th>
            <th>Active</th>
            <th aria-label="Save" />
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => {
            const formId = `variant-${variant.id}`;
            const isDirty = dirty.has(variant.id);
            return (
              <tr className={cx("product-variant-row", isDirty && "is-dirty")} data-variant-id={variant.id} key={variant.id}>
                <td>
                  <div className="variant-name-cell">
                    <input aria-label="Variant name" defaultValue={variant.name} form={formId} name="name" required />
                    <small title={variant.optionLabel}>{variant.optionLabel}</small>
                  </div>
                </td>
                <td>
                  <input aria-label="Price" defaultValue={variant.price} form={formId} inputMode="decimal" name="price" />
                </td>
                <td>
                  <input aria-label="Compare-at price" defaultValue={variant.compareAtPrice} form={formId} inputMode="decimal" name="compareAtPrice" />
                </td>
                <td>
                  <input aria-label="SKU" defaultValue={variant.sku} form={formId} name="sku" />
                </td>
                <td className="variant-check-cell">
                  <input aria-label="Track inventory" defaultChecked={variant.trackInventory} form={formId} name="trackInventory" type="checkbox" />
                </td>
                <td>
                  <input aria-label="Quantity" defaultValue={variant.inventoryQuantity} form={formId} min="0" name="inventoryQuantity" type="number" />
                </td>
                <td className="variant-check-cell">
                  <input aria-label="Default variant" defaultChecked={variant.isDefault} form={formId} name="isDefault" type="checkbox" />
                </td>
                <td className="variant-check-cell">
                  <input aria-label="Active" defaultChecked={variant.isActive} form={formId} name="isActive" type="checkbox" />
                </td>
                <td>
                  <Button
                    className={cx("variant-save-button", !isDirty && "is-pristine")}
                    form={formId}
                    size="sm"
                    type="submit"
                    variant={isDirty ? "primary" : "secondary"}>
                    <Save size={14} />
                    Save
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {variants.map((variant) => (
        <form action={updateAction} id={`variant-${variant.id}`} key={variant.id}>
          <input name="id" type="hidden" value={variant.id} />
          <input name="productId" type="hidden" value={productId} />
          <input name="sortOrder" type="hidden" value={variant.sortOrder} />
        </form>
      ))}
    </div>
  );
}
