"use client";
import { t } from "@/lib/i18n/zh";

import { Plus } from "lucide-react";
import { useQuickAddClient } from "./quick-add-client-dialog";

/** Globally-available "Add client" button — opens the one-field modal. */
export function AddClientButton() {
  const { open } = useQuickAddClient();
  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-500/15 px-3 text-[13px] font-medium text-violet-200 ring-1 ring-inset ring-violet-500/30 transition-colors hover:bg-violet-500/25 hover:text-white"
      title={t("Add client")}
    >
      <Plus className="size-3.5" />
      {t("Add client")}
    </button>
  );
}
