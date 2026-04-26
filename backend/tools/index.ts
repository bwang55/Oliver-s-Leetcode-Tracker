import { addProblemTool } from "./add-problem.js";
import { updateProblemTool } from "./update-problem.js";
import { deleteProblemTool } from "./delete-problem.js";
import { listProblemsTool } from "./list-problems.js";
import { getProblemTool } from "./get-problem.js";
import { analyzeProfileTool } from "./analyze-profile.js";
import { suggestNextProblemTool } from "./suggest-next-problem.js";
import { generateStudyPlanTool } from "./generate-study-plan.js";
import { dailySummaryTool } from "./daily-summary.js";
import type { ToolDefinition } from "./_types.js";

export const ALL_TOOLS: Record<string, ToolDefinition<any, any>> = {
  add_problem: addProblemTool,
  update_problem: updateProblemTool,
  delete_problem: deleteProblemTool,
  list_problems: listProblemsTool,
  get_problem: getProblemTool,
  analyze_profile: analyzeProfileTool,
  suggest_next_problem: suggestNextProblemTool,
  generate_study_plan: generateStudyPlanTool,
  daily_summary: dailySummaryTool
};

// OpenAI SDK-compatible tools array (function calling shape)
export const OPENAI_TOOLS = Object.values(ALL_TOOLS).map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.jsonSchema }
}));

export function toolByName(name: string) {
  const tool = ALL_TOOLS[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool;
}

export * from "./_types.js";
