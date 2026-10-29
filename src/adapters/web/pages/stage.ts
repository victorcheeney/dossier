import { type ApplicationRow, closedReasons, stages } from '../../../core/domain.ts';

export function stageLabel({ stage, closedReason }: Pick<ApplicationRow, 'stage' | 'closedReason'>) {
  return closedReason ? `${stage} · ${closedReason}` : stage;
}

export const stageChoices = stages.flatMap((stage) =>
  stage === 'Closed' ? closedReasons.map((closedReason) => stageLabel({ stage, closedReason })) : [stage],
);

export function parseStageChoice(choice: string) {
  const [stage, reason] = choice.split(' · ');
  return { stage, reason };
}
