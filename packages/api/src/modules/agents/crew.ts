import type { CrewStep } from '@wai-agents/shared';
import { sql } from '../../db/connection.js';
import { emitCrewEvent } from '../../ws/emitter.js';
import { runAgentLoop } from './loop.js';

export interface RunCrewConfig {
  crewId: string;
  conversationId: string;
  userId: string;
  message: string;
}

export interface RunCrewResult {
  response: string;
  stepResults: Array<{ agentId: string; role: string; response: string }>;
}

export async function runCrew(config: RunCrewConfig): Promise<RunCrewResult> {
  const { crewId, conversationId, userId, message } = config;

  // 1. Load crew config + steps (with authorization check)
  const crewRows = await sql`
    SELECT id, steps, creator_id, visibility FROM agent_crews WHERE id = ${crewId} LIMIT 1
  `;
  if (crewRows.length === 0) {
    throw Object.assign(new Error('Crew not found'), { code: 'NOT_FOUND' });
  }

  const crew = crewRows[0] as Record<string, unknown>;

  // Authorization: user must be creator OR crew must be public/unlisted
  const isCreator = crew.creator_id === userId;
  const isAccessible = crew.visibility === 'public' || crew.visibility === 'unlisted';
  if (!isCreator && !isAccessible) {
    throw Object.assign(new Error('Crew not found'), { code: 'NOT_FOUND' });
  }

  // Validate conversation membership
  const memberRows = await sql`
    SELECT 1 FROM conversation_members
    WHERE conversation_id = ${conversationId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (memberRows.length === 0) {
    throw Object.assign(new Error('Conversation not found or access denied'), {
      code: 'NOT_FOUND',
    });
  }

  const steps = crew.steps as CrewStep[];

  if (steps.length === 0) {
    throw Object.assign(new Error('Crew has no steps'), { code: 'BAD_REQUEST' });
  }

  // 2. Group steps: sequential steps (no parallelGroup) and parallel groups
  //    Only contiguous steps with the same parallelGroup are grouped together.
  //    Non-contiguous steps with the same parallelGroup name are treated as separate groups.
  const stepGroups: Array<{
    steps: Array<CrewStep & { originalIndex: number }>;
    parallel: boolean;
  }> = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.parallelGroup) {
      // Check if the LAST group in stepGroups has the same parallelGroup
      const lastGroup = stepGroups[stepGroups.length - 1];
      if (lastGroup?.parallel && lastGroup.steps[0]?.parallelGroup === step.parallelGroup) {
        lastGroup.steps.push({ ...step, originalIndex: i });
      } else {
        stepGroups.push({
          steps: [{ ...step, originalIndex: i }],
          parallel: true,
        });
      }
    } else {
      stepGroups.push({
        steps: [{ ...step, originalIndex: i }],
        parallel: false,
      });
    }
  }

  // 3. Execute step groups in order, with error handling
  const allResults: Array<{ agentId: string; role: string; response: string }> = [];
  let contextMessage = message;

  try {
    for (const group of stepGroups) {
      if (group.parallel && group.steps.length > 1) {
        // Run parallel steps concurrently using allSettled for graceful failure handling
        const promises = group.steps.map(async (step) => {
          emitCrewEvent(conversationId, {
            type: 'crew:step_started',
            crew_id: crewId,
            step_index: step.originalIndex,
            agent_id: step.agentId,
            role: step.role,
            parallel_group: step.parallelGroup,
          });

          const result = await runAgentLoop({
            agentId: step.agentId,
            conversationId,
            userId,
            message: `[Crew role: ${step.role}]\n\n${contextMessage}`,
          });

          emitCrewEvent(conversationId, {
            type: 'crew:step_completed',
            crew_id: crewId,
            step_index: step.originalIndex,
            agent_id: step.agentId,
            role: step.role,
            response: result.response,
          });

          return { agentId: step.agentId, role: step.role, response: result.response };
        });

        const settled = await Promise.allSettled(promises);

        // Check for failures
        const failures = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (failures.length > 0) {
          // Emit error for each failed step
          for (let j = 0; j < settled.length; j++) {
            const result = settled[j];
            if (result.status === 'rejected') {
              emitCrewEvent(conversationId, {
                type: 'crew:error',
                crew_id: crewId,
                error: (result.reason as Error).message ?? 'Unknown error',
                step_index: group.steps[j].originalIndex,
              });
            }
          }
          // If ALL parallel steps failed, throw
          if (failures.length === settled.length) {
            throw Object.assign(
              new Error(`All parallel steps failed: ${(failures[0].reason as Error).message}`),
              { code: 'INTERNAL' },
            );
          }
        }

        // Collect successful results
        const results: Array<{ agentId: string; role: string; response: string }> = [];
        for (const result of settled) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          }
        }
        allResults.push(...results);

        // Merge parallel outputs as context for next step
        contextMessage = results.map((r) => `[${r.role}]: ${r.response}`).join('\n\n');
      } else {
        // Sequential step
        const step = group.steps[0];
        emitCrewEvent(conversationId, {
          type: 'crew:step_started',
          crew_id: crewId,
          step_index: step.originalIndex,
          agent_id: step.agentId,
          role: step.role,
          parallel_group: step.parallelGroup,
        });

        const result = await runAgentLoop({
          agentId: step.agentId,
          conversationId,
          userId,
          message: `[Crew role: ${step.role}]\n\n${contextMessage}`,
        });

        emitCrewEvent(conversationId, {
          type: 'crew:step_completed',
          crew_id: crewId,
          step_index: step.originalIndex,
          agent_id: step.agentId,
          role: step.role,
          response: result.response,
        });

        allResults.push({ agentId: step.agentId, role: step.role, response: result.response });
        contextMessage = result.response;
      }
    }
  } catch (error) {
    // Emit crew:error event so clients are notified
    emitCrewEvent(conversationId, {
      type: 'crew:error',
      crew_id: crewId,
      error: (error as Error).message,
    });
    throw error;
  }

  // 4. Increment usage count
  await sql`
    UPDATE agent_crews SET usage_count = usage_count + 1, updated_at = NOW()
    WHERE id = ${crewId}
  `;

  // 5. Final response is the last step's output
  const finalResponse = allResults.length > 0 ? allResults[allResults.length - 1].response : '';

  emitCrewEvent(conversationId, {
    type: 'crew:finished',
    crew_id: crewId,
    total_steps: steps.length,
    final_response: finalResponse,
  });

  return { response: finalResponse, stepResults: allResults };
}
