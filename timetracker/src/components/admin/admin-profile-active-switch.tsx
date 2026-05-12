"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Switch } from "@/components/ui/switch";
import { setProfileActive } from "@/app/[locale]/(dashboard)/admin/actions";

export function AdminProfileActiveSwitch({
  profileId,
  initiallyActive,
  disabled,
}: {
  profileId: string;
  initiallyActive: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const tErr = useTranslations("errors");
  const [checked, setChecked] = useState(initiallyActive);
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={checked}
      disabled={disabled || pending}
      onCheckedChange={(next) => {
        startTransition(async () => {
          const res = await setProfileActive(profileId, next);
          if (!res.ok) {
            window.alert(tErr(res.errorKey, res.values));
            setChecked(!next);
            return;
          }
          setChecked(next);
          router.refresh();
        });
      }}
    />
  );
}
