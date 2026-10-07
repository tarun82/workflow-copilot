import type { Collateral, Session } from "@/lib/types";

export interface StageProps {
  session: Session;
  update: (patch: Partial<Session> | ((s: Session) => Partial<Session>)) => void;
}

export function collateral(s: Session): Collateral {
  return { rawText: s.rawText, files: s.files };
}
