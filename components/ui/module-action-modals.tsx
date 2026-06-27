"use client";

import { useState, type ReactNode } from "react";
import {
  Activity,
  CopyPlus,
  FilePlus,
  Filter,
  GitMerge,
  Goal,
  ImagePlus,
  KeyRound,
  Link2,
  MailPlus,
  MoreHorizontal,
  PackagePlus,
  Plus,
  ReceiptText,
  Send,
  Upload,
  UserPlus,
  Wand2
} from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { Modal } from "./modal";
import { cx } from "./utils";

const icons = {
  activity: Activity,
  copy: CopyPlus,
  file: FilePlus,
  filter: Filter,
  goal: Goal,
  image: ImagePlus,
  key: KeyRound,
  link: Link2,
  mail: MailPlus,
  merge: GitMerge,
  more: MoreHorizontal,
  package: PackagePlus,
  plus: Plus,
  receipt: ReceiptText,
  send: Send,
  upload: Upload,
  user: UserPlus,
  wand: Wand2
};

export type ModuleActionModalItem = {
  content: ReactNode;
  icon?: keyof typeof icons;
  id: string;
  label: string;
  title: string;
  variant?: ButtonProps["variant"];
};

type ModuleActionModalsProps = {
  className?: string;
  initialActiveId?: string;
  items: ModuleActionModalItem[];
  modalClassName?: string;
  toolbarLabel: string;
};

export function ModuleActionModals({ className, initialActiveId, items, modalClassName, toolbarLabel }: ModuleActionModalsProps) {
  const validInitialActiveId = initialActiveId && items.some((item) => item.id === initialActiveId) ? initialActiveId : null;
  const [manualActiveId, setManualActiveId] = useState<string | null>(null);
  const [dismissedInitialId, setDismissedInitialId] = useState<string | null>(null);
  const activeId = manualActiveId || (validInitialActiveId !== dismissedInitialId ? validInitialActiveId : null);
  const activeItem = items.find((item) => item.id === activeId);
  const close = () => {
    setManualActiveId(null);
    setDismissedInitialId(validInitialActiveId);
  };

  return (
    <>
      <div className={cx("module-action-toolbar", className)} aria-label={toolbarLabel}>
        {items.map((item) => {
          const Icon = item.icon ? icons[item.icon] : null;

          return (
            <Button
              aria-haspopup="dialog"
              key={item.id}
              onClick={() => setManualActiveId(item.id)}
              size="sm"
              type="button"
              variant={item.variant || "secondary"}>
              {Icon ? <Icon size={15} /> : null}
              {item.label}
            </Button>
          );
        })}
      </div>

      <Modal
        bodyClassName="module-action-modal-body"
        className={cx("module-action-modal", modalClassName)}
        onClose={close}
        open={Boolean(activeItem)}
        title={activeItem?.title || ""}>
        {activeItem?.content || null}
      </Modal>
    </>
  );
}
