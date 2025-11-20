export const AI_ACTIONS = {
  SUMMARIZE: "summarize",
  KEY_POINTS: "key_points",
  FIND_RELATED_LOGSEQ: "find_related_logseq",
  CUSTOM: "custom",
};

export const AI_MODELS = {
  GPT_4: "gpt-4",
  GPT_4_TURBO: "gpt-4-turbo",
  GPT_3_5_TURBO: "gpt-3.5-turbo",
  CLAUDE_3_5_SONNET: "claude-3-5-sonnet-20241022",
  CLAUDE_3_HAIKU: "claude-3-haiku-20240307",
  GEMINI_PRO: "gemini-pro",
};

export function buildSystemPrompt(action, context = {}) {
  const basePrompt = `You are an intelligent assistant integrated into a web annotation tool called MyZ. Your role is to help users analyze web content and connect it with their knowledge base.`;

  switch (action) {
    case AI_ACTIONS.SUMMARIZE:
      return `${basePrompt}

Please provide a comprehensive summary of the given web page content. Focus on:
1. Main topics and themes
2. Key arguments or points made
3. Important details and examples
4. Overall structure and flow
5. Any notable conclusions or takeaways

Make the summary clear, concise, and well-organized. Use markdown formatting for better readability.`;

    case AI_ACTIONS.KEY_POINTS:
      return `${basePrompt}

Please identify and list the key points from the given web page content. For each key point:
1. Provide a clear, concise statement
2. Explain why it's important or significant
3. Include relevant details or examples if available

Format the output as a bulleted list with brief explanations.`;

    case AI_ACTIONS.FIND_RELATED_LOGSEQ:
      return `${basePrompt}

The user wants to find related notes in their LogSeq knowledge base. Analyze the web page content and suggest potential connections, similar concepts, or related topics that might exist in their notes.

Focus on:
1. Key concepts and terms that might match existing notes
2. Related topics or themes
3. Potential tags or categories
4. Questions or prompts that could help find related content

Provide suggestions in a helpful, exploratory manner without assuming specific note titles.`;

    case AI_ACTIONS.CUSTOM:
    default:
      return `${basePrompt}

Respond to the user's custom query about the web page content. Be helpful, accurate, and format your response appropriately using markdown.`;
  }
}

export function buildUserPrompt(action, content, customQuery = "") {
  switch (action) {
    case AI_ACTIONS.SUMMARIZE:
      return `Please summarize the following web page content:\n\n${content}`;

    case AI_ACTIONS.KEY_POINTS:
      return `Please identify the key points from the following web page content:\n\n${content}`;

    case AI_ACTIONS.FIND_RELATED_LOGSEQ:
      return `Based on this web page content, what related notes or concepts might exist in my LogSeq knowledge base?\n\n${content}`;

    case AI_ACTIONS.CUSTOM:
      return (
        customQuery || `Please analyze the following content:\n\n${content}`
      );

    default:
      return content;
  }
}

export function extractPageContent() {
  const MAX_CONTENT_LENGTH = 15000; // Limit content length to avoid token limits

  // Try to find main content using common selectors
  const mainSelectors = [
    "main",
    "article",
    '[role="main"]',
    ".main-content",
    ".post-content",
    ".article-content",
    ".entry-content",
  ];

  let contentElement = null;
  for (const selector of mainSelectors) {
    contentElement = document.querySelector(selector);
    if (contentElement) break;
  }

  if (!contentElement) {
    // Fallback to body but remove obvious noise
    contentElement = document.body.cloneNode(true);
    const noiseSelectors = [
      "nav",
      "header",
      "footer",
      ".nav",
      ".navigation",
      ".menu",
      ".sidebar",
      ".ads",
      ".advertisement",
      ".social-share",
      ".comments",
    ];

    noiseSelectors.forEach((selector) => {
      contentElement.querySelectorAll(selector).forEach((el) => el.remove());
    });
  }

  // Extract text content
  let text = contentElement.textContent || "";

  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Truncate if too long
  if (text.length > MAX_CONTENT_LENGTH) {
    text = text.substring(0, MAX_CONTENT_LENGTH) + "... (content truncated)";
  }

  return {
    text,
    title: document.title || "",
    url: window.location.href,
  };
}

export function formatConversationForExport(conversation, format = "markdown") {
  if (format === "json") {
    return JSON.stringify(conversation, null, 2);
  }

  let markdown = `# ${conversation.title}\n\n`;
  markdown += `**URL**: ${conversation.url}\n`;
  markdown += `**Created**: ${new Date(conversation.createdAt).toLocaleString()}\n`;
  markdown += `**Updated**: ${new Date(conversation.updatedAt).toLocaleString()}\n\n`;
  markdown += `---\n\n`;

  conversation.messages.forEach((msg) => {
    const role = msg.role === "user" ? "**User**" : "**Assistant**";
    const time = new Date(msg.timestamp).toLocaleString();
    markdown += `### ${role} (${time})\n\n`;
    markdown += `${msg.content}\n\n`;
  });

  return markdown;
}

export function createConversationTitle(url, action) {
  const domain = new URL(url).hostname.replace("www.", "");
  const actionNames = {
    [AI_ACTIONS.SUMMARIZE]: "摘要",
    [AI_ACTIONS.KEY_POINTS]: "要点",
    [AI_ACTIONS.FIND_RELATED_LOGSEQ]: "关联笔记",
    [AI_ACTIONS.CUSTOM]: "对话",
  };

  return `${domain} - ${actionNames[action] || "AI对话"}`;
}
