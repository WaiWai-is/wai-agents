'use client';

import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';

export type CodeBlockData = {
  type: 'code';
  language?: string;
  code: string;
  output?: string;
};

function escapeHtml(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function CodeBlock({ block }: { block: CodeBlockData }) {
  const lang = block.language || '';
  const code = block.code || '';

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
    <div className="cb-code-block">
      <div className="cb-code-block-header">
        <span className="cb-code-block-lang">{lang || 'code'}</span>
        <button
          type="button"
          className="cb-code-copy-btn"
          onClick={() => void navigator.clipboard.writeText(code)}
        >
          Copy
        </button>
      </div>
      <pre className="cb-code-block-pre">
        <code dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlighted) }} />
      </pre>
      {block.output && (
        <div className="cb-code-block-output">
          <div className="cb-code-block-output-label">Output</div>
          <pre className="cb-code-block-output-pre">{block.output}</pre>
        </div>
      )}
    </div>
  );
}
