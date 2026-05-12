export type CalendarEntry = {
  id: string;
  project_id: string;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  is_billable: boolean;
};

export type PopoverState =
  | { mode: "create"; date: string; startMin: number; endMin: number }
  | { mode: "edit"; entry: CalendarEntry };
