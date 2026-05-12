"use client";

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function ProjectsSuccessToast({ toastKey }: { toastKey?: string }) {
  const router = useRouter();
  const t = useTranslations("projects");
  const handled = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!toastKey || handled.current === toastKey) return;
    if (toastKey === "created") {
      handled.current = toastKey;
      toast.success(t("projectCreated"));
      router.replace("/projects", { scroll: false });
    }
  }, [toastKey, router, t]);

  return null;
}
