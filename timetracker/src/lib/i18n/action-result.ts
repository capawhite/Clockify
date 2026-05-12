/** Standard server action failure shape for client-side translation. */
export type ActionFail = {
  ok: false;
  errorKey: string;
  values?: Record<string, string | number>;
};

export type ActionOk = { ok: true };

export type ActionResult = ActionOk | ActionFail;

export function actionFail(
  errorKey: string,
  values?: Record<string, string | number>
): ActionFail {
  return { ok: false, errorKey, values };
}
