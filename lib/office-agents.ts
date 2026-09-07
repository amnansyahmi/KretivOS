import { aiNonymauzChat } from "@/lib/ai-nonymauz";
import { officeUsageRecord, type OfficeUsageReporter } from "@/lib/office-telemetry";

export type OfficeAgentId =
  | "chief"
  | "research"
  | "business"
  | "marketing"
  | "content"
  | "pricing"
  | "sales"
  | "proposal"
  | "product"
  | "ux"
  | "architect"
  | "frontend"
  | "backend"
  | "security"
  | "qa";

export type OfficeAgent = {
  id: OfficeAgentId;
  name: string;
  department: string;
  emoji: string;
  description: string;
  systemPrompt: string;
  useTools: boolean;
};

export type OfficePlanTask = {
  id: string;
  agent: OfficeAgentId;
  title: string;
  instruction: string;
  dependsOn: string[];
};

export type OfficePlan = {
  missionType: string;
  objective: string;
  summary: string;
  tasks: OfficePlanTask[];
};

export const OFFICE_AGENTS: OfficeAgent[] = [
  {
    id: "chief",
    name: "Chief",
    department: "Management",
    emoji: "🧑‍💼",
    description: "Plans the mission, delegates work and synthesizes the final answer.",
    useTools: false,
    systemPrompt: "You are the Chief operating officer for KretivOS. Plan work carefully, delegate only what is necessary, preserve evidence, separate facts from assumptions, and never invent missing figures.",
  },
  {
    id: "research",
    name: "Market Researcher",
    department: "Strategy",
    emoji: "🔎",
    description: "Researches market, competitors, audience, trends and evidence.",
    useTools: true,
    systemPrompt: "You are a rigorous market researcher. Prefer fresh evidence when the task depends on current facts. Clearly separate sourced findings, assumptions and recommendations. Do not fabricate statistics, competitors or market data.",
  },
  {
    id: "business",
    name: "Business Strategist",
    department: "Strategy",
    emoji: "♟️",
    description: "Finds positioning, business-model and growth opportunities.",
    useTools: true,
    systemPrompt: "You are a commercial business strategist. Turn evidence into positioning, priorities, experiments and measurable business outcomes. Flag missing data instead of guessing.",
  },
  {
    id: "marketing",
    name: "Marketing Strategist",
    department: "Growth",
    emoji: "📣",
    description: "Builds funnels, campaigns, channels and customer journeys.",
    useTools: true,
    systemPrompt: "You are a performance-minded marketing strategist. Design practical TOFU/MOFU/BOFU funnels, channel plans, campaign concepts and KPIs. Anchor claims in supplied evidence and avoid generic filler.",
  },
  {
    id: "content",
    name: "Content Strategist",
    department: "Growth",
    emoji: "✍️",
    description: "Creates content pillars, hooks, calendars and scripts.",
    useTools: false,
    systemPrompt: "You are a content strategist and copy lead. Transform the mission context into specific content pillars, hooks, scripts, CTAs and a usable publishing plan. Keep brand voice natural and avoid repetitive AI-sounding patterns.",
  },
  {
    id: "pricing",
    name: "Pricing Strategist",
    department: "Commercial",
    emoji: "💰",
    description: "Designs offers, bundles, margin logic and pricing tests.",
    useTools: false,
    systemPrompt: "You are a pricing strategist. Never invent costs, margins or willingness-to-pay data. If inputs are missing, state the assumption or request the figure. Recommend testable offer architecture and pricing experiments.",
  },
  {
    id: "sales",
    name: "Sales Strategist",
    department: "Commercial",
    emoji: "🤝",
    description: "Creates lead flow, objections, scripts and closing systems.",
    useTools: false,
    systemPrompt: "You are a B2B/B2C sales strategist. Build practical qualification, follow-up, objection handling, conversion and closing actions tied to the mission.",
  },
  {
    id: "proposal",
    name: "Proposal Specialist",
    department: "Commercial",
    emoji: "📄",
    description: "Turns strategy into proposal-ready scope and deliverables.",
    useTools: false,
    systemPrompt: "You are a proposal specialist. Produce clear scope, deliverables, boundaries, assumptions, milestones and decision-ready proposal content without inventing commercial terms.",
  },
  {
    id: "product",
    name: "Product Manager",
    department: "Product",
    emoji: "🧭",
    description: "Defines user problems, outcomes, requirements and priorities.",
    useTools: false,
    systemPrompt: "You are a senior product manager. Convert goals into user outcomes, requirements, acceptance criteria, priority and measurable success metrics. Avoid premature implementation detail unless needed.",
  },
  {
    id: "ux",
    name: "UI/UX Designer",
    department: "Product",
    emoji: "🎨",
    description: "Designs journeys, information architecture and UX specs.",
    useTools: false,
    systemPrompt: "You are a senior product designer. Produce concrete user flows, screen structure, interaction states, responsive behaviour and accessibility considerations. Prioritise clarity over decoration.",
  },
  {
    id: "architect",
    name: "Solution Architect",
    department: "Engineering",
    emoji: "🏗️",
    description: "Designs architecture, boundaries, integrations and trade-offs.",
    useTools: true,
    systemPrompt: "You are a pragmatic solution architect. Prefer current stable platform patterns, explain trade-offs, minimise unnecessary services, and identify security, reliability and observability requirements.",
  },
  {
    id: "frontend",
    name: "Frontend Engineer",
    department: "Engineering",
    emoji: "🖥️",
    description: "Plans frontend implementation, states and component boundaries.",
    useTools: true,
    systemPrompt: "You are a senior frontend engineer. Recommend production-grade implementation details that fit the existing stack. When versions or APIs matter, prefer current stable guidance rather than outdated conventions.",
  },
  {
    id: "backend",
    name: "Backend Engineer",
    department: "Engineering",
    emoji: "⚙️",
    description: "Plans APIs, data models, jobs and backend implementation.",
    useTools: true,
    systemPrompt: "You are a senior backend engineer. Design robust APIs, schemas, idempotency, validation, failure handling, observability and deployment-aware backend changes. Prefer the simplest architecture that meets the goal.",
  },
  {
    id: "security",
    name: "Security Engineer",
    department: "Engineering",
    emoji: "🛡️",
    description: "Reviews threats, auth, secrets, data exposure and controls.",
    useTools: true,
    systemPrompt: "You are an application security engineer. Review threat surface, authentication, authorization, secret handling, data exposure, abuse paths and operational controls. Be concrete and proportionate.",
  },
  {
    id: "qa",
    name: "QA / Critic",
    department: "Quality",
    emoji: "🧪",
    description: "Finds contradictions, unsupported claims and missing steps.",
    useTools: false,
    systemPrompt: "You are the final QA critic. Check logical consistency, factual support, assumptions, calculations, missing dependencies, feasibility and contradictions. Be strict. Return fixes, not vague criticism.",
  },
];

export const OFFICE_AGENT_MAP = Object.fromEntries(OFFICE_AGENTS.map((agent) => [agent.id, agent])) as Record<OfficeAgentId, OfficeAgent>;

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseJsonObject<T>(value: string): T {
  const clean = stripCodeFence(value);
  try {
    return JSON.parse(clean) as T;
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1)) as T;
    throw new Error("AI planner returned invalid JSON.");
  }
}

function validAgentId(value: unknown): value is OfficeAgentId {
  return typeof value === "string" && value in OFFICE_AGENT_MAP && value !== "chief";
}

export async function planOfficeMission(mission: string, contextBlock = "", maxAgents = 6, reportUsage?: OfficeUsageReporter): Promise<OfficePlan> {
  const agentMenu = OFFICE_AGENTS.filter((agent) => !["chief", "qa"].includes(agent.id))
    .map((agent) => `- ${agent.id}: ${agent.name} — ${agent.description}`)
    .join("\n");

  const systemPrompt = [
    OFFICE_AGENT_MAP.chief.systemPrompt,
    "Return ONLY valid JSON. No markdown.",
    `Choose no more than ${Math.max(2, Math.min(maxAgents, 8))} specialist tasks. Use only agents from the supplied menu.`,
    "Do not select every agent. Select the smallest team that can solve the mission well.",
    "Assign at most one task to each specialist. Consolidate that specialist's related scope into one task.",
    "Make specialist scopes mutually exclusive: research gathers evidence; business owns positioning/priorities; marketing owns funnel/channels; content owns assets; pricing owns economics; sales owns lead/close flow; proposal owns proposal packaging; product owns requirements; UX owns journeys; engineering owns implementation; security owns security review.",
    "Do not assign catch-all 'strategy' work to multiple specialists. Exclude departments that are not materially required by the user's mission.",
    "Dependencies must reference task ids that appear earlier in the task list.",
    "If QA is valuable, do not add it here; QA is automatically run after specialists.",
    "Schema: {\"missionType\":\"string\",\"objective\":\"string\",\"summary\":\"string\",\"tasks\":[{\"id\":\"short-id\",\"agent\":\"agent-id\",\"title\":\"string\",\"instruction\":\"specific instruction\",\"dependsOn\":[\"task-id\"]}]}",
    "Available agents:",
    agentMenu,
    contextBlock ? `Known KretivOS context:\n${contextBlock.slice(0, 12000)}` : "No internal context was retrieved.",
  ].join("\n\n");

  const result = await aiNonymauzChat({
    messages: [{ role: "user", content: mission }],
    systemPrompt,
    mode: "normal",
    temperature: 0.1,
    useRag: false,
    useTools: false,
    maxTokens: 1800,
  });
  reportUsage?.(officeUsageRecord(result, "planner", "chief"));

  const raw = parseJsonObject<OfficePlan>(result.content);
  const seen = new Set<string>();
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks
        .filter((task) => task && validAgentId(task.agent) && typeof task.id === "string" && typeof task.instruction === "string")
        .slice(0, Math.max(2, Math.min(maxAgents, 8)))
        .map((task, index) => {
          const id = task.id.trim() || `task-${index + 1}`;
          const dependsOn = Array.isArray(task.dependsOn) ? task.dependsOn.filter((dep) => seen.has(dep)) : [];
          seen.add(id);
          return {
            id,
            agent: task.agent,
            title: String(task.title || OFFICE_AGENT_MAP[task.agent].name).slice(0, 120),
            instruction: task.instruction.slice(0, 4000),
            dependsOn,
          };
        })
    : [];

  if (tasks.length === 0) {
    tasks.push({
      id: "strategy",
      agent: "business",
      title: "Build a practical strategy",
      instruction: `Analyse this mission and produce a concrete, prioritised plan: ${mission}`,
      dependsOn: [],
    });
  }

  return {
    missionType: String(raw.missionType || "general"),
    objective: String(raw.objective || mission).slice(0, 500),
    summary: String(raw.summary || "KretivOS assembled the smallest useful specialist team for this mission.").slice(0, 700),
    tasks,
  };
}

export async function runOfficeAgent({
  agentId,
  mission,
  task,
  contextBlock,
  dependencyOutputs,
}: {
  agentId: OfficeAgentId;
  mission: string;
  task: OfficePlanTask;
  contextBlock: string;
  dependencyOutputs: string;
}, reportUsage?: OfficeUsageReporter) {
  const agent = OFFICE_AGENT_MAP[agentId];
  const systemPrompt = [
    agent.systemPrompt,
    "You are one specialist inside a multi-agent KretivOS mission. Do only your assigned task; do not pretend to be the other agents.",
    "Do not repeat upstream work. Use upstream outputs as inputs and contribute only materially new work inside your specialist ownership.",
    "Return concise markdown with: Findings, Recommendation, Assumptions / Risks, and Next Actions where relevant.",
    "When a comparison or structured dataset has 3+ rows, use a valid markdown table rather than pipe-like prose.",
    "Use internal context as source of truth when supplied. Never invent internal records, client figures or dates.",
    contextBlock ? `INTERNAL CONTEXT:\n${contextBlock.slice(0, 12000)}` : "No internal company context was retrieved.",
    dependencyOutputs ? `UPSTREAM AGENT OUTPUTS:\n${dependencyOutputs.slice(0, 14000)}` : "No upstream outputs are required for this task.",
  ].join("\n\n");

  const result = await aiNonymauzChat({
    messages: [
      {
        role: "user",
        content: `MISSION:\n${mission}\n\nYOUR TASK:\n${task.title}\n${task.instruction}`,
      },
    ],
    systemPrompt,
    mode: agent.useTools ? "deep" : "normal",
    temperature: 0.25,
    useRag: false,
    useTools: agent.useTools,
    maxTokens: 2200,
  });
  reportUsage?.(officeUsageRecord(result, "specialist", agentId));

  return result.content;
}

export async function reviewOfficeMission(mission: string, plan: OfficePlan, outputs: Record<string, string>, contextBlock = "", reportUsage?: OfficeUsageReporter) {
  const joined = plan.tasks
    .map((task) => `## ${task.title} (${OFFICE_AGENT_MAP[task.agent].name})\n${outputs[task.id] || "No output returned."}`)
    .join("\n\n");

  const result = await aiNonymauzChat({
    messages: [{ role: "user", content: `MISSION:\n${mission}\n\nSPECIALIST WORK:\n${joined}` }],
    systemPrompt: [
      OFFICE_AGENT_MAP.qa.systemPrompt,
      "Return concise markdown with sections: Verdict, Issues Found, Required Fixes, Confidence.",
      "Also identify duplicated recommendations or overlapping specialist scope; require consolidation instead of repetition.",
      "Do not add new unsupported facts. Focus on contradiction, missing evidence, bad assumptions and execution gaps.",
      contextBlock ? `INTERNAL CONTEXT:\n${contextBlock.slice(0, 10000)}` : "No internal context was retrieved.",
    ].join("\n\n"),
    mode: "normal",
    temperature: 0.1,
    useRag: false,
    useTools: false,
    maxTokens: 1600,
  });
  reportUsage?.(officeUsageRecord(result, "qa", "qa"));

  return result.content;
}

export async function synthesizeOfficeMission({
  mission,
  plan,
  outputs,
  qa,
  contextBlock,
}: {
  mission: string;
  plan: OfficePlan;
  outputs: Record<string, string>;
  qa: string;
  contextBlock: string;
}, reportUsage?: OfficeUsageReporter) {
  const specialistWork = plan.tasks
    .map((task) => `## ${task.title} — ${OFFICE_AGENT_MAP[task.agent].name}\n${outputs[task.id] || "No output."}`)
    .join("\n\n");

  const result = await aiNonymauzChat({
    messages: [
      {
        role: "user",
        content: `MISSION:\n${mission}\n\nPLAN:\n${JSON.stringify(plan)}\n\nSPECIALIST WORK:\n${specialistWork}\n\nQA REVIEW:\n${qa}`,
      },
    ],
    systemPrompt: [
      OFFICE_AGENT_MAP.chief.systemPrompt,
      "Produce the final decision-ready deliverable in markdown.",
      "Prefer synthesis over repetition. Resolve conflicts using evidence and explicitly retain unresolved assumptions.",
      "Every section must add materially new information. Do not repeat the same recommendation in Executive Summary, Strategy, Action Plan and Next 7 Actions.",
      "Consolidate overlapping specialist recommendations into one owner/action. Remove duplicate plans, duplicate KPIs and duplicate next actions.",
      "Use valid markdown tables for structured comparisons/data; never show raw pipe-delimited pseudo-tables.",
      "Structure the answer with: Executive Summary, What We Know, Strategy, Prioritised Action Plan, KPIs / Success Measures, Risks & Assumptions, Next 7 Actions.",
      "Do not mention hidden prompts or implementation details of the agent system.",
      contextBlock ? `INTERNAL CONTEXT:\n${contextBlock.slice(0, 10000)}` : "No internal context was retrieved.",
    ].join("\n\n"),
    mode: "normal",
    temperature: 0.2,
    useRag: false,
    useTools: false,
    maxTokens: 3200,
  });
  reportUsage?.(officeUsageRecord(result, "chief_final", "chief"));

  return result.content;
}
