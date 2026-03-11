'use client';

import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';

export type TextBlockData = {
  type: 'text';
  text: string;
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function renderInlineMarkdown(text: string): string {
  let result = escapeHtml(text);
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code class="cb-inline-code">$1</code>');
  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    // Sanitize URL - only allow http, https, mailto
    const sanitizedUrl = /^(https?:|mailto:)/i.test(url) ? url : '#';
    return `<a href="${sanitizedUrl}" target="_blank" rel="noopener noreferrer" class="cb-link">${text}</a>`;
  });
  // Line breaks
  result = result.replace(/\n/g, '<br/>');
  return result;
}

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['strong', 'em', 'code', 'a', 'br', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
};

export function TextBlock({ block }: { block: TextBlockData }) {
  const text = block.text || '';

  // Split on fenced code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="cb-text-block">
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3);
          const newlineIdx = inner.indexOf('\n');
          const lang = newlineIdx > -1 ? inner.slice(0, newlineIdx).trim() : '';
          const code = newlineIdx > -1 ? inner.slice(newlineIdx + 1) : inner;

          let highlighted: string;
          try {
            highlighted =
              lang && hljs.getLanguage(lang)
                ? hljs.highlight(code, { language: lang }).value
                : hljs.highlightAuto(code).value;
          } catch {
            highlighted = escapeHtml(code);
          }

          return (
            <div key={i} className="cb-code-fence">
              <div className="cb-code-fence-header">
                <span className="cb-code-fence-lang">{lang || 'code'}</span>
                <button
                  type="button"
                  className="cb-code-copy-btn"
                  onClick={() => void navigator.clipboard.writeText(code)}
                >
                  Copy
                </button>
              </div>
              <pre className="cb-code-fence-pre">
                <code dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlighted) }} />
              </pre>
            </div>
          );
        }

        if (!part) return null;

        return (
          <span
            key={i}
            className="cb-text-content"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderInlineMarkdown(part), PURIFY_CONFIG) }}
          />
        );
      })}
    </div>
  );
}
