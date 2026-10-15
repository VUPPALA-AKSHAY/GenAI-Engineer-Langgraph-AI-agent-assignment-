// Converts lesson Markdown to safe HTML.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(text: string): string {
  return (
    text
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, "$1<em>$2</em>")
  );
}

function safeHref(url: string): string | null {
  const decoded = url.trim();
  if (/^https?:\/\//i.test(decoded)) return decoded;
  return null;
}

export function markdownToHtml(markdown: string): string {
  if (!markdown) return "";
  const lines = escapeHtml(markdown).split(/\r?\n/);
  const out: string[] = [];

  let listType: "ul" | "ol" | null = null;
  let inCode = false;
  let codeBuffer: string[] = [];
  let paragraph: string[] = [];

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (/^```/.test(line.trim())) {
      if (inCode) {
        out.push(`<pre><code>${codeBuffer.join("\n")}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        flushParagraph();
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length, 6);
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      closeList();
      out.push("<hr />");
      continue;
    }

    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (ul) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      const quiz = /^[A-D][.)]\s/.test(ul[1]);
      out.push(`<li${quiz ? ' class="quiz-opt"' : ""}>${inline(ul[1])}</li>`);
      continue;
    }

    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    if (trimmed.startsWith("&gt;")) {
      flushParagraph();
      closeList();
      out.push(`<blockquote>${inline(trimmed.replace(/^&gt;\s?/, ""))}</blockquote>`);
      continue;
    }

    closeList();
    paragraph.push(trimmed);
  }

  if (inCode && codeBuffer.length) {
    out.push(`<pre><code>${codeBuffer.join("\n")}</code></pre>`);
  }
  flushParagraph();
  closeList();

  return out.join("\n");
}

export interface LessonPage {
  index: number;
  label: string;
  heading: string;
  html: string;
  raw: string;
}

export function splitLessonPages(markdown: string): LessonPage[] {
  if (!markdown.trim()) return [];

  const lines = markdown.split(/\r?\n/);
  const pages: { heading: string; lines: string[] }[] = [];
  let current = { heading: "Title", lines: [] as string[] };

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current.lines.some((l) => l.trim())) pages.push(current);
      current = { heading: line.replace(/^##\s+/, "").trim(), lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some((l) => l.trim())) pages.push(current);

  if (pages.length > 1) {
    const first = pages[0];
    const bodyWords = first.lines
      .filter((l) => l.trim() && !/^#{1,6}\s/.test(l.trim()))
      .join(" ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    if (bodyWords < 20) {
      pages[1].lines = [...first.lines, ...pages[1].lines];
      pages.shift();
    }
  }

  if (!pages.length) {
    return [
      { index: 0, label: "Lesson", heading: "Lesson", html: markdownToHtml(markdown), raw: markdown },
    ];
  }

  return pages.map((page, index) => ({
    index,
    label: page.heading.replace(/\s*\(.*\)\s*$/, "").slice(0, 22) || `Page ${index + 1}`,
    heading: page.heading,
    html: markdownToHtml(page.lines.join("\n").trim()),
    raw: page.lines.join("\n").trim(),
  }));
}
