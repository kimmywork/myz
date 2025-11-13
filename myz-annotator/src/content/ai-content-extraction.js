/**
 * Extract page content for AI processing
 * This is a more robust version optimized for AI use cases
 */

export function extractPageContentForAi() {
  try {
    const MAX_CONTENT_LENGTH = 15000; // Limit to avoid token limits

    // Heuristic: Try to find the main content area using multiple strategies
    let contentElement = null;
    const strategies = [
      // Strategy 1: Look for semantic HTML5 elements
      () => document.querySelector("main") || document.querySelector("article"),

      // Strategy 2: Look for common content wrapper classes
      () =>
        document.querySelector(
          ".post-content, .entry-content, .article-content, .main-content",
        ),

      // Strategy 3: Look for role attributes
      () => document.querySelector('[role="main"]'),

      // Strategy 4: Heuristic based on largest text block (fallback)
      () => {
        const elements = Array.from(document.querySelectorAll("div, section"));
        return elements
          .filter((el) => {
            // Filter out obvious non-content elements
            const className = el.className || "";
            const id = el.id || "";
            const isNoisy =
              /(nav|menu|sidebar|header|footer|comment|ad|popup|modal|cookie)/i.test(
                className + " " + id,
              );
            return !isNoisy && el.textContent.length > 500;
          })
          .sort((a, b) => b.textContent.length - a.textContent.length)[0];
      },
    ];

    for (const strategy of strategies) {
      contentElement = strategy();
      if (contentElement) break;
    }

    if (!contentElement) {
      contentElement = document.body;
    }

    // Clone to avoid modifying the DOM
    const clone = contentElement.cloneNode(true);

    // Remove noise elements
    const noiseSelectors = [
      "nav",
      "header",
      "footer",
      "aside",
      "script",
      "style",
      "noscript",
      ".nav",
      ".navigation",
      ".menu",
      ".sidebar",
      ".ads",
      ".advertisement",
      ".social-share",
      ".comments",
      ".comment",
      ".popup",
      ".modal",
      "#nav",
      "#header",
      "#footer",
      "#sidebar",
      "#ads",
      "#comments",
      '[role="navigation"]',
      ".related-posts",
      ".recommended",
      ".newsletter",
    ];

    noiseSelectors.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    });

    // Extract and clean text
    let text = clone.textContent || "";

    // Clean up whitespace
    text = text
      .replace(/\s+/g, " ")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();

    // Truncate if too long
    if (text.length > MAX_CONTENT_LENGTH) {
      text =
        text.substring(0, MAX_CONTENT_LENGTH) +
        "... (content truncated for brevity)";
    }

    // Extract metadata
    const metadata = {
      url: window.location.href,
      title: document.title || "",
      description:
        document.querySelector('meta[name="description"]')?.content || "",
      author: document.querySelector('meta[name="author"]')?.content || "",
      publishedDate:
        document.querySelector('meta[property="article:published_time"]')
          ?.content || "",
      wordCount: text.split(/\s+/).length,
      domain: window.location.hostname,
    };

    return {
      text,
      title: metadata.title,
      url: metadata.url,
      metadata,
    };
  } catch (error) {
    console.error("Error extracting page content for AI:", error);
    return {
      text: "Error extracting page content",
      title: document.title || "",
      url: window.location.href,
      metadata: { error: error.message },
    };
  }
}

// Also expose a simpler version for quick content extraction
export function extractQuickContent() {
  try {
    // Try to find main content quickly
    const contentElement =
      document.querySelector('main, article, .post-content, [role="main"]') ||
      document.body;

    const clone = contentElement.cloneNode(true);

    // Quick cleanup of nav/header/footer elements
    const quickNoise = clone.querySelectorAll(
      "nav, header, footer, .sidebar, .ads",
    );
    quickNoise.forEach((el) => el.remove());

    const text = clone.textContent?.replace(/\s+/g, " ").trim() || "";
    const truncated =
      text.length > 5000 ? text.substring(0, 5000) + "..." : text;

    return {
      text: truncated,
      title: document.title || "",
      url: window.location.href,
    };
  } catch (error) {
    console.error("Quick content extraction failed:", error);
    return {
      text: document.body.textContent?.replace(/\s+/g, " ").trim() || "",
      title: document.title || "",
      url: window.location.href,
    };
  }
}

// Extract selected text if any
export function extractSelectedText() {
  const selection = window.getSelection();
  if (selection && selection.toString().trim()) {
    return {
      text: selection.toString().trim(),
      title: document.title || "",
      url: window.location.href,
      isSelection: true,
    };
  }
  return null;
}
