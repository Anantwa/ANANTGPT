const state = {
  rows: [],
  columns: [],
  profile: [],
  numericColumns: [],
  categoricalColumns: [],
  targetColumn: "",
  memory: [
    "The product should feel like a simple GPT-style assistant.",
    "General chat, essays, explanations, study help, and planning are the main use cases.",
  ],
  traces: [],
  turns: [],
};

const sampleCsv = `month,region,customer_segment,marketing_spend,sales,revenue,churn_risk,satisfaction_score,support_tickets
2025-01,North,Enterprise,42000,310,186000,0.12,8.7,18
2025-01,South,SMB,18000,145,52200,0.24,7.3,31
2025-02,North,Enterprise,46000,334,203000,0.10,8.9,15
2025-02,West,Mid-Market,28000,202,101000,0.18,8.0,22
2025-03,South,SMB,21000,158,58460,0.27,7.0,35
2025-03,East,Enterprise,51000,371,231000,0.09,9.1,14
2025-04,West,Mid-Market,32000,224,119400,0.16,8.2,20
2025-04,North,SMB,25000,183,71370,0.21,7.6,27
2025-05,East,Enterprise,54000,392,254800,0.08,9.2,13
2025-05,South,Mid-Market,30000,209,111800,0.17,8.0,23
2025-06,West,SMB,26000,176,68640,0.23,7.4,29
2025-06,North,Enterprise,59000,421,282070,0.07,9.3,11
2025-07,East,Mid-Market,34000,238,129710,0.14,8.4,18
2025-07,South,SMB,24000,164,62320,0.28,6.9,38
2025-08,West,Enterprise,61000,438,298000,0.06,9.4,10
2025-08,North,Mid-Market,36000,249,137200,0.13,8.5,17`;

const $ = (id) => document.getElementById(id);
const format = (value) => new Intl.NumberFormat("en-US").format(value);

function parseDelimited(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { columns: [], rows: [] };
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const columns = splitLine(lines[0], delimiter).map((x) => x.trim());
  const rows = lines.slice(1).map((line) => {
    const values = splitLine(line, delimiter);
    return Object.fromEntries(columns.map((column, index) => [column, cleanValue(values[index] ?? "")]));
  });
  return { columns, rows };
}

function splitLine(line, delimiter) {
  const out = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function cleanValue(value) {
  const trimmed = String(value).replace(/^"|"$/g, "").trim();
  if (!trimmed || ["null", "na", "n/a"].includes(trimmed.toLowerCase())) return "";
  const numeric = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(numeric) && trimmed.match(/^-?[\d,.]+$/) ? numeric : trimmed;
}

function profileDataset() {
  state.profile = state.columns.map((column) => {
    const values = state.rows.map((row) => row[column]);
    const present = values.filter((value) => value !== "");
    const numeric = present.filter((value) => typeof value === "number");
    const type = numeric.length >= Math.max(2, present.length * 0.7) ? "number" : "category";
    return {
      column,
      type,
      missing: values.length - present.length,
      unique: new Set(present.map(String)).size,
      mean: numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null,
    };
  });
  state.numericColumns = state.profile.filter((item) => item.type === "number").map((item) => item.column);
  state.categoricalColumns = state.profile.filter((item) => item.type !== "number").map((item) => item.column);
  state.targetColumn = state.numericColumns.find((column) => /revenue|sales|profit|churn|risk/i.test(column)) || state.numericColumns[0] || "";
}

function addMessage(role, content, toolText = "") {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "YOU" : "GPT";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;
  if (toolText) {
    const tool = document.createElement("div");
    tool.className = "tool-call";
    tool.textContent = toolText;
    bubble.appendChild(tool);
  }
  message.append(avatar, bubble);
  $("chatLog").appendChild(message);
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
}

function addTrace(name, detail) {
  state.traces.unshift({ name, detail });
  state.traces = state.traces.slice(0, 8);
  renderTraces();
}

function remember(text) {
  if (!$("memoryToggle").checked) return;
  const cleaned = text.trim();
  if (!cleaned) return;
  state.memory.unshift(cleaned.length > 110 ? `${cleaned.slice(0, 107)}...` : cleaned);
  state.memory = [...new Set(state.memory)].slice(0, 8);
  renderMemory();
}

function renderMemory() {
  $("memoryList").innerHTML = state.memory.length
    ? state.memory.map((item) => `<div class="memory-item"><span>remembered</span>${escapeHtml(item)}</div>`).join("")
    : `<div class="memory-item">No memory yet.</div>`;
}

function renderTraces() {
  $("traceList").innerHTML = state.traces.length
    ? state.traces.map((item) => `<div class="trace-item"><strong>${escapeHtml(item.name)}</strong><br>${escapeHtml(item.detail)}</div>`).join("")
    : `<div class="trace-item">Tool calls will appear here.</div>`;
}

function renderDatasetStats() {
  const missing = state.profile.reduce((sum, item) => sum + item.missing, 0);
  $("rowCount").textContent = format(state.rows.length);
  $("columnCount").textContent = format(state.columns.length);
  $("missingCount").textContent = format(missing);
  $("targetColumn").textContent = state.targetColumn || "None";
}

function classifyPrompt(q) {
  const tests = [
    ["greeting", /\b(hi|hello|hey|yo|namaste)\b/],
    ["identity", /\b(who are you|what are you|your name|what can you do)\b/],
    ["essay", /\b(essay|paragraph|article|write about|composition|speech|debate)\b/],
    ["creative", /\b(story|poem|caption|slogan|creative|dialogue|script)\b/],
    ["rewrite", /\b(rewrite|improve|make it better|grammar|correct|polish|formal|shorten|summarize this)\b/],
    ["study", /\b(explain|teach|simple words|notes|study|exam|homework|definition|meaning)\b/],
    ["planning", /\b(plan|routine|schedule|timetable|todo|to-do|daily|weekly|productivity|habit)\b/],
    ["advice", /\b(advice|suggest|should i|what should|help me decide|tips|motivation)\b/],
    ["food", /\b(food|recipe|cook|breakfast|lunch|dinner|diet|meal)\b/],
    ["travel", /\b(travel|trip|itinerary|visit|places|vacation)\b/],
    ["email", /\b(email|letter|application|message|reply|whatsapp|notice)\b/],
    ["own-llm", /\b(own llm|like gpt|my gpt|local llm|api key|ollama|vllm|fine.?tune|train.*llm)\b/],
    ["architecture", /\b(architecture|system design|tech stack|backend|frontend|database|scalable|production)\b/],
    ["code", /\b(code|python|sql|fastapi|react|typescript|javascript|function|class|bug|error|api endpoint)\b/],
    ["statistics", /\b(mean|median|correlation|p.?value|hypothesis|regression|variance|standard deviation|outlier|missing)\b/],
    ["visualization", /\b(charts?|plots?|graphs?|visuals?|dashboard|trend|compare|heatmap|histogram|boxplot)\b/],
    ["automl", /\b(models?|ml|automl|predict|prediction|classification|regression|random forest|xgboost|lightgbm|accuracy|f1|rmse|churn)\b/],
    ["business", /\b(executive|business|revenue|sales|profit|recommendations?|opportunities|risk|stakeholder)\b/],
    ["report", /\b(reports?|ppt|powerpoint|pdf|presentations?|summary deck|writeup)\b/],
    ["resume", /\b(resume|cv|linkedin|portfolio|github|readme|interview|hr|recruiter)\b/],
    ["roadmap", /\b(roadmap|plan|phase|timeline|build|steps|milestone|sprint)\b/],
    ["dataset", /\b(dataset|csv|excel|columns|rows|file|upload|summarize data|attached data)\b/],
    ["explain", /\b(why|how|simple terms|intuition)\b/],
  ];
  return tests.filter(([, pattern]) => pattern.test(q)).map(([intent]) => intent);
}

function datasetContextLine() {
  if (!state.rows.length) return "No file is attached, so I am answering from general reasoning.";
  const missing = state.profile.reduce((sum, item) => sum + item.missing, 0);
  return `Attached dataset context: ${state.rows.length} rows, ${state.columns.length} columns, ${state.numericColumns.length} numeric fields, ${state.categoricalColumns.length} categorical fields, ${missing} missing cells, target candidate ${state.targetColumn || "not detected"}.`;
}

function topColumns() {
  if (!state.profile.length) return "No columns are available yet.";
  return state.profile
    .slice(0, 6)
    .map((item) => `${item.column} (${item.type}${item.mean == null ? "" : `, avg ${item.mean.toFixed(2)}`})`)
    .join(", ");
}

function extractTopic(prompt) {
  return prompt
    .replace(/write|short|essay|paragraph|article|about|on|explain|simple|words|give me|make me|please/gi, "")
    .replace(/[?.!]/g, "")
    .trim() || "this topic";
}

function makeEssay(prompt) {
  const topic = extractTopic(prompt);
  return `The Importance of ${capitalize(topic)}

${capitalize(topic)} plays an important role in our personal and social life. It helps people understand the world better, make wiser decisions, and build confidence. In today's fast-changing world, knowledge and good values are necessary for success.

One major benefit of ${topic} is that it improves thinking. A person who learns regularly becomes more aware, responsible, and capable of solving problems. It also creates opportunities for growth, better communication, and a more meaningful life.

In conclusion, ${topic} is not only useful for individual progress but also for the development of society. When people value learning, discipline, and kindness, they can create a better future for everyone.`;
}

function makeCreative(prompt) {
  const topic = extractTopic(prompt);
  return `Title: ${capitalize(topic)}

The morning began quietly, but there was a strange feeling in the air, as if something new was waiting to happen. Every small sound felt important, and every ordinary moment seemed to carry a hidden meaning.

By the end of the day, one thing became clear: even simple moments can change the way we think. Sometimes the best stories do not begin with magic. They begin with curiosity.`;
}

function makeStudyAnswer(prompt) {
  const topic = extractTopic(prompt);
  if (/photosynthesis/i.test(prompt)) {
    return `Photosynthesis is the process by which green plants make their own food.

Plants take in sunlight, water from the soil, and carbon dioxide from the air. Using chlorophyll, the green pigment in leaves, they convert these into glucose, which is food for the plant. Oxygen is released as a by-product.

Simple formula:
Carbon dioxide + Water + Sunlight -> Glucose + Oxygen`;
  }
  return `${capitalize(topic)} means understanding the basic idea first, then building details around it.

Simple explanation:
It is a concept that becomes easier when you break it into small parts, connect it to real life, and practice with examples.

Best way to study it:
1. Read the definition.
2. Write it in your own words.
3. Learn one example.
4. Revise after a short break.`;
}

function makePlan(prompt) {
  if (/daily|routine|productiv/i.test(prompt)) {
    return `Productive Daily Routine

6:30 AM - Wake up, drink water, freshen up
7:00 AM - Light exercise or walk
7:30 AM - Breakfast and planning
8:00 AM - Deep work or study session
10:30 AM - Short break
11:00 AM - Continue important tasks
1:00 PM - Lunch and rest
2:00 PM - Practice, assignments, or project work
5:00 PM - Break, hobby, or exercise
7:00 PM - Review the day
8:00 PM - Dinner
9:00 PM - Light reading or preparation for tomorrow
10:30 PM - Sleep`;
  }
  return `Here is a simple plan:

1. Define the goal clearly.
2. Break it into small tasks.
3. Do the most important task first.
4. Keep one fixed time block every day.
5. Review progress at night.
6. Adjust the next day instead of quitting.`;
}

function makeGeneralAnswer(prompt) {
  return `I can help with that.

Here is a useful way to think about it: first clarify what you want, then break the problem into smaller parts, and finally choose the simplest next action.

If you want, I can turn this into a detailed answer, a short note, an essay, a formal message, a study explanation, or a step-by-step plan.`;
}

function capitalize(text) {
  const cleaned = String(text).trim();
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : "This Topic";
}

function buildResponseForIntent(intent, prompt) {
  const context = datasetContextLine();
  const model = $("modelSelect").value;
  const responses = {
    greeting: [
      `Hey. I am your general GPT-style assistant. You can ask me about daily life, essays, study topics, writing, planning, coding, ideas, or file analysis.`,
      `Hi. Ask me anything: essay writing, explanations, routines, messages, study help, creative ideas, or normal day-to-day questions.`,
    ],
    identity: [
      `I am a simple GPT-style assistant. I can chat about everyday topics, write essays, explain concepts, help with study, draft emails or letters, create plans, brainstorm ideas, write code, and analyze files if you attach them.\n\n${context}`,
    ],
    essay: [
      `Here is a clear essay:\n\n${makeEssay(prompt)}`,
    ],
    creative: [
      `Here is a creative draft:\n\n${makeCreative(prompt)}`,
    ],
    rewrite: [
      `Sure. Paste the exact text you want me to improve, and I can rewrite it.

I can make it:
- clearer
- shorter
- more formal
- more natural
- more impressive

Send the text and tell me the tone you want.`,
    ],
    study: [
      `${makeStudyAnswer(prompt)}`,
    ],
    planning: [
      `${makePlan(prompt)}`,
    ],
    advice: [
      `My advice: make the problem smaller and act on the next clear step.

1. Write down what you want.
2. Write what is stopping you.
3. Pick one action you can do today.
4. Do it for 20 minutes.
5. Review and adjust.

Tell me the exact situation and I will give more specific advice.`,
    ],
    food: [
      `For a simple meal, aim for balance: one protein, one carb, and one vegetable or fruit.

Example: rice or roti with dal/paneer/eggs/chicken, vegetables, and curd.

If you tell me what ingredients you have, I can suggest a quick recipe.`,
    ],
    travel: [
      `For a simple trip plan, use this structure:

Day 1: arrive, check in, visit one nearby place, eat local food.
Day 2: main attractions, photos, shopping, relaxed evening.
Day 3: light sightseeing, packing, return.

Tell me the city, budget, number of days, and who is travelling, and I will make a proper itinerary.`,
    ],
    email: [
      `Here is a clean message format:

Subject: Request for Assistance

Dear Sir/Madam,

I hope you are doing well. I am writing to request your help regarding this matter. Please let me know the next steps or any information required from my side.

Thank you for your time and support.

Sincerely,
[Your Name]

Tell me the purpose and I will customize it.`,
    ],
    "own-llm": [
      `To make this your own GPT-like chatbot, keep the chat experience as the main product.

Recommended build:
1. Chat UI with history, memory, model selector, and streaming.
2. FastAPI backend with a /chat endpoint.
3. Model router for OpenAI-compatible APIs, Ollama, or another local model.
4. Optional tools for files, web search, coding, and data analysis.
5. Database for conversations and user settings.

The user should feel they are talking to a helpful assistant, not operating a dashboard.`,
    ],
    architecture: [
      `Production architecture for a simple GPT-style chatbot:

Frontend: chat UI, message history, model selector, settings, memory, and optional file upload.
Backend: FastAPI with normal and streaming chat endpoints.
Model layer: connect to OpenAI-compatible APIs, Ollama, vLLM, or another local model.
Storage: PostgreSQL for users and conversations, Redis for fast session state, object storage for uploaded files.
Optional tools: writing helper, summarizer, file reader, code helper, and data analysis.

The main product should feel like a friendly assistant that can talk about normal day-to-day topics.`,
    ],
    code: [
      `For a simple GPT-like chatbot, use this structure:

Frontend:
- chat messages
- input box
- conversation history
- model/settings panel

Backend:
- POST /chat for normal replies
- POST /chat/stream for streaming replies
- POST /files/upload for optional files

Core idea: send the conversation to the model, receive an answer, save the turn, and show it in the chat.`,
    ],
    statistics: [
      `${context}\n\nFor statistical analysis, I would start with data quality, distribution shape, missingness, and relationships between variables. Use correlation only for linear numeric relationships; use group comparisons for categorical drivers; use outlier checks before trusting averages.\n\nIf you want rigor: define the question, choose a metric, check assumptions, run the analysis, then translate the result into business impact.`,
    ],
    visualization: [
      `${context}\n\nBest visualization plan:\n1. Trend chart for time-based movement.\n2. Bar chart for segment or region comparison.\n3. Histogram for distribution shape.\n4. Boxplot for outliers and spread.\n5. Correlation heatmap for numeric relationships.\n6. Feature-importance chart after modeling.\n\nFor executives, keep each chart tied to one decision: grow, reduce risk, prioritize a segment, or investigate a driver.`,
    ],
    automl: [
      `${context}

If you ask about machine learning, I can still help. A simple ML workflow is:
1. Decide what you want to predict.
2. Clean the data.
3. Split into training and testing data.
4. Try a simple baseline model.
5. Compare stronger models.
6. Explain the result in plain language.

But for normal chat, you do not need any dataset or ML tools.`,
    ],
    business: [
      `For a business-style answer, I would keep it simple:

- What is happening?
- Why does it matter?
- What should we do next?
- What risk should we watch?

Clear business writing should avoid unnecessary technical words and focus on decisions.`,
    ],
    report: [
      `Report structure I would generate:\n\n1. Executive summary\n2. Dataset overview\n3. Data quality risks\n4. Key charts and insights\n5. Model leaderboard\n6. Explainability summary\n7. Risks and limitations\n8. Recommendations\n9. Next steps\n\n${context}\n\nFor a portfolio demo, PDF and PowerPoint export are strong because they show the product communicates, not just computes.`,
    ],
    resume: [
      `Resume version:

Built a GPT-style chatbot web app with conversation history, memory, model settings, writing assistance, study help, planning prompts, optional file analysis, and a clean responsive interface using HTML, CSS, JavaScript, and a local Node preview server.

Stronger portfolio framing: "I built a ChatGPT-like assistant interface and designed it so a real LLM backend can be connected later."`,
    ],
    roadmap: [
      `Build roadmap:

Phase 1: simple chat UI with message history.
Phase 2: essay, explanation, study, planning, and rewrite modes.
Phase 3: real backend chat endpoint with streaming.
Phase 4: connect an actual LLM provider.
Phase 5: add memory and saved conversations.
Phase 6: add optional file tools.
Phase 7: deploy it with auth and a clean README.`,
    ],
    dataset: [
      `${context}\n\nColumn snapshot: ${topColumns()}\n\nIf you ask a specific question about the data, I can route to the right tool: profile, compare groups, recommend visuals, plan cleaning, train models, or draft a report.`,
    ],
    explain: [
      `Simple explanation: this app should behave like GPT. The user types any normal question. The assistant understands the intent and replies naturally. If a file is attached, it can use file tools. If not, it still helps with essays, study, planning, writing, coding, and daily questions.`,
    ],
  };
  const choices = responses[intent] || [];
  if (!choices.length) return "";
  const index = Math.abs(hash(`${prompt}-${model}-${state.turns.length}`)) % choices.length;
  return choices[index];
}

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(31, h) + text.charCodeAt(i) | 0;
  return h;
}

function analyzePrompt(prompt) {
  const q = prompt.toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);
  const intent = detectIntent(q);
  const topic = inferSubject(prompt, intent);
  const tone = q.includes("formal") ? "formal" : q.includes("funny") ? "funny" : q.includes("simple") ? "simple" : "natural";
  const length = q.includes("short") ? "short" : q.includes("long") || q.includes("detailed") ? "detailed" : "normal";
  return {
    q,
    words,
    intent,
    topic,
    tone,
    length,
    isQuestion: q.includes("?") || /^(what|why|how|when|where|which|can|should|is|are|do|does)\b/.test(q),
    hasAttachedFile: state.rows.length > 0,
    previousTopic: state.turns.at(-1)?.topic || "",
  };
}

function detectIntent(q) {
  if (/^[\d\s+\-*/().%]+$/.test(q) && /\d/.test(q)) return "math";
  if (/\b(calculate|solve|what is)\b/.test(q) && /[\d]+\s*[+\-*/%]\s*[\d]+/.test(q)) return "math";
  if (/\b(compare|difference between|versus| vs )\b/.test(q)) return "compare";
  if (/\b(pros and cons|advantages|disadvantages)\b/.test(q)) return "proscons";
  if (/\b(write|essay|paragraph|article|speech|debate)\b/.test(q)) return "essay";
  if (/\b(email|letter|application|message|reply|notice)\b/.test(q)) return "email";
  if (/\b(story|poem|caption|slogan|script|dialogue)\b/.test(q)) return "creative";
  if (/\b(plan|routine|schedule|timetable|roadmap|steps)\b/.test(q)) return "plan";
  if (/\b(explain|what is|define|meaning of)\b/.test(q)) return "explain";
  if (/\b(why)\b/.test(q)) return "why";
  if (/\b(how to|how do|how can)\b/.test(q)) return "howto";
  if (/\b(advice|tips|should i|suggest|recommend)\b/.test(q)) return "advice";
  if (/\b(summarize|summary)\b/.test(q)) return "summarize";
  if (/\b(code|python|javascript|html|css|fastapi|react|sql)\b/.test(q)) return "code";
  if (/\b(csv|excel|dataset|file|columns|rows|data)\b/.test(q)) return "file";
  if (/\b(hi|hello|hey|namaste)\b/.test(q)) return "greeting";
  if (/\b(who are you|what can you do|your name)\b/.test(q)) return "identity";
  return "general";
}

function inferSubject(prompt, intent) {
  let subject = prompt
    .replace(/\b(write|an|a|the|short|long|detailed|essay|paragraph|article|speech|debate|about|on|explain|what is|define|meaning of|how to|how do i|how can i|give me|make|please|compare|difference between|pros and cons of|advantages of|disadvantages of|tips for|advice on)\b/gi, " ")
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!subject && intent === "greeting") subject = "chat";
  if (!subject && state.turns.at(-1)?.topic) subject = state.turns.at(-1).topic;
  return subject || "this topic";
}

function safeMath(prompt) {
  const expression = (prompt.match(/[\d\s+\-*/().%]+/g) || []).join("").trim();
  if (!expression || !/^\s*[\d+\-*/().%\s]+\s*$/.test(expression)) return null;
  try {
    const normalized = expression.replace(/%/g, "/100");
    const value = Function(`"use strict"; return (${normalized})`)();
    return Number.isFinite(value) ? `${expression} = ${value}` : null;
  } catch {
    return null;
  }
}

function makeExplanation(topic, style = "normal") {
  if (/photosynthesis/i.test(topic)) return makeStudyAnswer("photosynthesis");
  if (/internet/i.test(topic)) {
    return `The internet is a huge network that connects computers and devices around the world.

Simple idea: when you open a website, your device sends a request through the network. A server receives it and sends back the page, image, video, or data you asked for.

Think of it like a postal system for information: your device asks, the server replies, and many routers help the message travel.`;
  }
  if (/ai|artificial intelligence/i.test(topic)) {
    return `Artificial intelligence means making computers perform tasks that usually need human-like intelligence.

Examples include understanding language, recognizing images, recommending videos, translating text, and answering questions.

Simple version: AI learns patterns from data and uses those patterns to make predictions or generate useful responses.`;
  }
  return `${capitalize(topic)} means understanding the main idea, why it matters, and how it is used.

Simple explanation:
It is a topic that becomes easier when you break it into smaller parts. First learn the basic definition, then look at one real-life example, then connect it to the bigger picture.

Example:
If the topic feels confusing, ask: "What is it?", "Why is it useful?", and "Where do we see it in real life?"`;
}

function makeHowTo(topic) {
  return `Here is a practical way to handle ${topic}:

1. Define the result you want.
2. Break it into small steps.
3. Start with the easiest first step.
4. Remove distractions while doing it.
5. Check your progress after a short time.
6. Improve the next attempt based on what worked.

The trick is not to wait for perfect confidence. Start small, then adjust.`;
}

function makeWhy(topic) {
  return `${capitalize(topic)} usually happens because several causes work together.

The simple way to understand it:
- There is a main cause.
- There are supporting conditions.
- There may be timing, habit, environment, or pressure involved.

So instead of looking for only one reason, ask: what changed, who is affected, what pattern repeats, and what can be controlled?`;
}

function makeComparison(topic) {
  const parts = topic.split(/\bvs\b|\bversus\b|\band\b|,/i).map((x) => x.trim()).filter(Boolean);
  const a = parts[0] || "Option A";
  const b = parts[1] || "Option B";
  return `Here is a simple comparison:

${capitalize(a)}
- Better when you want simplicity, speed, or a direct approach.
- Usually easier to start with.
- May be limited if the problem becomes complex.

${capitalize(b)}
- Better when you need more flexibility, depth, or long-term value.
- May take more effort to understand.
- Can be stronger if used in the right situation.

Quick decision: choose ${a} if you want ease and speed. Choose ${b} if you want depth and flexibility.`;
}

function makeProsCons(topic) {
  return `Pros and cons of ${topic}:

Pros:
- Can save time or effort.
- Helps create better decisions when used properly.
- Makes the task more organized.

Cons:
- Can be confusing if the basics are not clear.
- May not work well in every situation.
- Needs judgment, not blind use.

Balanced view: ${topic} is useful when you understand the goal and limitations.`;
}

function makeEmail(prompt) {
  const topic = inferSubject(prompt, "email");
  return `Subject: Regarding ${capitalize(topic)}

Dear Sir/Madam,

I hope you are doing well. I am writing to request your assistance regarding ${topic}. Please let me know the required steps or any information needed from my side.

Thank you for your time and support.

Sincerely,
[Your Name]`;
}

function makeSummary(prompt) {
  const text = prompt.replace(/summarize|summary/gi, "").trim();
  if (text.length > 80) {
    return `Summary:
${text.slice(0, 260)}${text.length > 260 ? "..." : ""}

Main idea: the text is about ${inferSubject(text, "summarize")}.

Short version: it can be reduced further if you want a one-line summary.`;
  }
  return `Send me the text you want summarized, and I can make it:
- one line
- bullet points
- simple English
- exam notes
- professional summary`;
}

function composeAnswer(prompt) {
  const analysis = analyzePrompt(prompt);
  const toolCalls = [];
  addTrace("thinking.intent", `${analysis.intent}; topic: ${analysis.topic}`);
  addTrace("thinking.plan", `Answer as ${analysis.length} ${analysis.tone} response; use file context only if requested.`);

  let answer = "";
  if (analysis.intent === "math") answer = safeMath(prompt) || "I can solve it, but please type the expression clearly, like 25 * 4 + 10.";
  else if (analysis.intent === "greeting") answer = "Hey. I’m here. Ask me anything: daily questions, essays, explanations, plans, messages, coding, or ideas.";
  else if (analysis.intent === "identity") answer = "I’m a GPT-style assistant demo. I can chat, explain topics, write essays, draft messages, plan routines, help with study, write simple code, and analyze attached CSV files.";
  else if (analysis.intent === "essay") answer = makeEssay(prompt);
  else if (analysis.intent === "creative") answer = makeCreative(prompt);
  else if (analysis.intent === "email") answer = makeEmail(prompt);
  else if (analysis.intent === "plan") answer = makePlan(prompt);
  else if (analysis.intent === "explain") answer = makeExplanation(analysis.topic, analysis.tone);
  else if (analysis.intent === "why") answer = makeWhy(analysis.topic);
  else if (analysis.intent === "howto") answer = makeHowTo(analysis.topic);
  else if (analysis.intent === "compare") answer = makeComparison(analysis.topic);
  else if (analysis.intent === "proscons") answer = makeProsCons(analysis.topic);
  else if (analysis.intent === "advice") answer = buildResponseForIntent("advice", prompt);
  else if (analysis.intent === "summarize") answer = makeSummary(prompt);
  else if (analysis.intent === "code") answer = buildResponseForIntent("code", prompt);
  else if (analysis.intent === "file") {
    toolCalls.push("inspect_attached_file()");
    answer = state.rows.length
      ? `${datasetContextLine()}

Column snapshot: ${topColumns()}

Ask a specific file question like "summarize this file", "which columns matter?", or "find missing values".`
      : "No file is attached yet. You can still chat normally, or attach a CSV if you want file analysis.";
  } else {
    answer = `Here’s my take on ${analysis.topic}:

The best way to approach it is to first understand the goal, then separate what matters from what is just noise. If it is a decision, compare options. If it is a topic, learn the definition and one example. If it is a task, break it into steps and start with the easiest useful action.

For your message, I would suggest this next step: tell me whether you want a short answer, a detailed explanation, an essay, or a practical plan.`;
  }

  if (analysis.length === "short") answer = shortenAnswer(answer);
  if (analysis.length === "detailed") answer += `\n\nMore detail:\nA good answer should include context, the main point, an example, and a next step. That makes it useful instead of just sounding correct.`;
  if (analysis.tone === "formal") answer = makeFormal(answer);
  if (analysis.tone === "funny") answer += "\n\nTiny honest note: I kept it useful first, funny second, because chaos is not a strategy.";

  remember(prompt);
  state.turns.push({ prompt, topic: analysis.topic, intents: [analysis.intent], answer });
  state.turns = state.turns.slice(-10);
  return { answer, toolText: toolCalls.length ? `Tools used: ${toolCalls.join(" -> ")}` : "" };
}

function shortenAnswer(answer) {
  const first = answer.split(/\n\n/)[0];
  return first.length > 380 ? `${first.slice(0, 377)}...` : first;
}

function makeFormal(answer) {
  return answer
    .replace(/^Hey\./, "Hello.")
    .replace(/Here’s/g, "Here is")
    .replace(/I’m/g, "I am");
}

function generateLLMResponse(prompt) {
  addTrace("model.route", `${$("modelSelect").value} selected with temperature ${$("temperature").value / 100}.`);
  return composeAnswer(prompt);
}

async function callConfiguredModel(prompt) {
  const endpoint = $("endpointUrl")?.value?.trim();
  if (!endpoint) return null;
  const apiKey = $("apiKey")?.value?.trim();
  const messages = [
    { role: "system", content: $("systemPrompt").value },
    ...state.turns.slice(-8).map((turn) => ({ role: "user", content: turn.prompt })),
    { role: "user", content: prompt },
  ];
  addTrace("model.endpoint", `Calling ${endpoint}`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: $("modelSelect").value,
      messages,
      prompt,
      temperature: Number($("temperature").value) / 100,
    }),
  });
  if (!response.ok) throw new Error(`Model endpoint returned ${response.status}`);
  const data = await response.json();
  return (
    data.answer ||
    data.response ||
    data.message?.content ||
    data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.text ||
    null
  );
}

async function sendPrompt() {
  const prompt = $("promptInput").value.trim();
  if (!prompt) return;
  $("promptInput").value = "";
  addMessage("user", prompt);
  addMessage("assistant", "Thinking...");
  const pending = $("chatLog").lastElementChild;
  setTimeout(async () => {
    let answer;
    let toolText = "";
    try {
      const modelAnswer = await callConfiguredModel(prompt);
      if (modelAnswer) {
        answer = modelAnswer;
        remember(prompt);
        state.turns.push({ prompt, topic: inferSubject(prompt, "general"), intents: ["remote-model"], answer });
        state.turns = state.turns.slice(-10);
      } else {
        const local = generateLLMResponse(prompt);
        answer = local.answer;
        toolText = local.toolText;
      }
    } catch (error) {
      addTrace("model.endpoint_error", error.message);
      const local = generateLLMResponse(prompt);
      answer = `${local.answer}\n\nModel endpoint note: I could not reach the configured model, so I used the local demo brain.`;
      toolText = local.toolText;
    }
    pending.remove();
    addMessage("assistant", answer, toolText);
  }, 280);
}

async function handleFiles(files) {
  for (const file of files) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (["csv", "tsv", "txt"].includes(ext)) {
      const parsed = parseDelimited(await file.text());
      state.columns = parsed.columns;
      state.rows = parsed.rows;
      profileDataset();
      addTrace("tool.attach_dataset", `${file.name} parsed with ${state.rows.length} rows.`);
      remember(`Attached dataset ${file.name} with columns: ${state.columns.join(", ")}`);
      addMessage("assistant", `File attached: ${file.name}. I can summarize it or answer questions about it when you ask.`);
    } else {
      addTrace("tool.attach_dataset", `${file.name} queued for backend Excel parser.`);
      addMessage("assistant", `${file.name} is accepted in the production flow. This browser demo parses CSV locally and would send Excel files to a backend parser.`);
    }
  }
  renderDatasetStats();
}

function loadSample() {
  const parsed = parseDelimited(sampleCsv);
  state.columns = parsed.columns;
  state.rows = parsed.rows;
  profileDataset();
  addTrace("tool.load_sample_dataset", "Loaded sales and churn sample data.");
  remember(`Loaded sample dataset with columns: ${state.columns.join(", ")}`);
  renderDatasetStats();
  addMessage("assistant", "Sample file loaded. You can ask me to summarize it, but I can also chat normally about essays, study, planning, and everyday topics.");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

$("sendPrompt").addEventListener("click", sendPrompt);
$("promptInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendPrompt();
  }
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    $("promptInput").value = button.dataset.prompt;
    sendPrompt();
  });
});

$("fileInput").addEventListener("change", (event) => handleFiles(event.target.files));
$("loadSample").addEventListener("click", loadSample);
$("settingsButton").addEventListener("click", () => $("settingsDialog").showModal());
$("clearMemory").addEventListener("click", () => {
  state.memory = [];
  renderMemory();
  addTrace("memory.clear", "Conversation memory cleared.");
});
$("newChat").addEventListener("click", () => {
  $("chatLog").innerHTML = "";
  addMessage("assistant", "New chat started. Ask me anything: essays, explanations, messages, routines, ideas, study help, coding, or file questions.");
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  button.animate([{ transform: "scale(1)" }, { transform: "scale(0.98)" }, { transform: "scale(1)" }], { duration: 140 });
});

renderMemory();
renderTraces();
renderDatasetStats();
addMessage(
  "assistant",
  "Hi. I am ANANTGPT(nonAPI), a simple GPT-style chatbot. I can help with day-to-day questions, essays, explanations, writing, study, planning, coding, ideas, and optional file analysis.\n\nTry: \"write an essay on education\", \"explain photosynthesis\", \"make a daily routine\", or just chat normally."
);
