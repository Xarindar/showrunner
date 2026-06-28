"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Gift, PackagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { cx } from "@/components/ui/utils";

type CatalogCreateItem = {
  content: ReactNode;
  description: string;
  id: string;
  label: string;
  title: string;
  type: "product" | "gift-card";
};

type CatalogCreateMenuProps = {
  items: CatalogCreateItem[];
};

const icons = {
  "gift-card": Gift,
  product: PackagePlus
};

export function CatalogCreateMenu({ items }: CatalogCreateMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const activeItem = items.find((item) => item.id === activeId);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      <div className="catalog-create-menu" ref={ref}>
        <Button aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((value) => !value)} size="sm" type="button">
          <Plus size={15} />
          New product
          <ChevronDown size={14} />
        </Button>

        {menuOpen ? (
          <div className="catalog-create-popover" role="menu">
            {items.map((item) => {
              const Icon = icons[item.type];

              return (
                <button
                  className="catalog-create-option"
                  key={item.id}
                  onClick={() => {
                    setMenuOpen(false);
                    setActiveId(item.id);
                  }}
                  role="menuitem"
                  type="button">
                  <Icon size={16} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <Modal
        bodyClassName="module-action-modal-body"
        className={cx("module-action-modal", "catalog-create-modal")}
        onClose={() => setActiveId(null)}
        open={Boolean(activeItem)}
        title={activeItem?.title || ""}>
        {activeItem?.content || null}
      </Modal>
    </>
  );
}
