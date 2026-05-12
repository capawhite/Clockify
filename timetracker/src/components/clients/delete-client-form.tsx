"use client";

import { useTranslations } from "next-intl";
import { deleteWorkspaceClient } from "@/app/[locale]/(dashboard)/clients/actions";

export function DeleteClientForm({ clientId }: { clientId: string }) {
  const t = useTranslations("clients");
  const tCommon = useTranslations("common");

  return (
    <form
      action={deleteWorkspaceClient}
      onSubmit={(e) => {
        if (!window.confirm(t("deleteConfirm"))) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={clientId} />
      <button
        type="submit"
        className="text-xs text-red-600 hover:underline dark:text-red-400"
      >
        {tCommon("delete")}
      </button>
    </form>
  );
}
