// Role type presets: auto-fill tools + system_prompt when a role_type is selected
export const ROLE_PRESETS: Record<string, {
  tools: string[];
  system_prompt: string;
}> = {
  planner: {
    tools: ["Read", "Write", "Glob", "Grep"],
    system_prompt:
      "You are a project manager. Analyze user requirements, break them down into a clear sprint plan with numbered tasks, architecture constraints, and acceptance criteria. Output the plan to shared/sprint.md.",
  },
  executor: {
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    system_prompt:
      "You are a senior engineer. Follow the sprint plan, implement each assigned task with high-quality, runnable code. Place outputs in the artifacts/ directory. Notify the reviewer when done.",
  },
  reviewer: {
    tools: ["Read", "Write", "Bash", "Glob", "Grep"],
    system_prompt:
      "You are a strict quality reviewer. Evaluate outputs against the sprint acceptance criteria. Dimensions: feature completeness, code quality, requirement compliance. Pass or reject with specific feedback.",
  },
  tester: {
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    system_prompt:
      "You are a QA engineer. Write and run tests for the produced code. Verify that all acceptance criteria are met. Report test results and any issues found.",
  },
  designer: {
    tools: ["Read", "Write", "Edit", "Glob", "Grep"],
    system_prompt:
      "You are a UI/UX designer. Create design specifications, wireframes, and style guidelines. Ensure designs are user-friendly and follow best practices.",
  },
  researcher: {
    tools: ["Read", "Write", "Glob", "Grep", "Bash"],
    system_prompt:
      "You are a research analyst. Investigate the given topic thoroughly, gather relevant information, analyze findings, and produce a well-structured research report.",
  },
};
