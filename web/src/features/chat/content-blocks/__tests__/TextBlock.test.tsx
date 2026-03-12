import { cleanup, render, screen } from '@testing-library/react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TextBlock, type TextBlockData } from '../TextBlock';

beforeAll(() => {
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('js', javascript);
  hljs.registerLanguage('python', python);
  hljs.registerLanguage('py', python);
});

afterEach(() => {
  cleanup();
});

describe('TextBlock', () => {
  it('renders plain text', () => {
    const block: TextBlockData = { type: 'text', text: 'Hello, world!' };
    render(<TextBlock block={block} />);
    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
  });

  it('renders bold markdown as <strong>', () => {
    const block: TextBlockData = { type: 'text', text: 'This is **bold** text' };
    const { container } = render(<TextBlock block={block} />);
    const strong = container.querySelector('strong');
    expect(strong).toBeInTheDocument();
    expect(strong?.textContent).toBe('bold');
  });

  it('renders italic markdown as <em>', () => {
    const block: TextBlockData = { type: 'text', text: 'This is *italic* text' };
    const { container } = render(<TextBlock block={block} />);
    const em = container.querySelector('em');
    expect(em).toBeInTheDocument();
    expect(em?.textContent).toBe('italic');
  });

  it('renders inline code as <code>', () => {
    const block: TextBlockData = { type: 'text', text: 'Run `npm install` first' };
    const { container } = render(<TextBlock block={block} />);
    const code = container.querySelector('code.cb-inline-code');
    expect(code).toBeInTheDocument();
    expect(code?.textContent).toBe('npm install');
  });

  it('renders markdown links as <a> with target="_blank"', () => {
    const block: TextBlockData = {
      type: 'text',
      text: 'Visit [Example](https://example.com) for info',
    };
    const { container } = render(<TextBlock block={block} />);
    const link = container.querySelector('a');
    expect(link).toBeInTheDocument();
    expect(link?.textContent).toBe('Example');
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders javascript: URLs as plain text instead of links', () => {
    const block: TextBlockData = {
      type: 'text',
      text: 'Click [here](javascript:alert(1)) now',
    };
    const { container } = render(<TextBlock block={block} />);
    // No <a> tag should be rendered for javascript: URLs
    const link = container.querySelector('a');
    expect(link).not.toBeInTheDocument();
    // The markdown syntax should remain as escaped plain text
    expect(container.textContent).toContain('[here](javascript:alert(1))');
  });

  it('renders fenced code blocks with highlighting', () => {
    const block: TextBlockData = {
      type: 'text',
      text: 'Before\n```javascript\nconst x = 1;\n```\nAfter',
    };
    const { container } = render(<TextBlock block={block} />);
    // Code fence should be rendered
    const codeFence = container.querySelector('.cb-code-fence');
    expect(codeFence).toBeInTheDocument();
    // Language label should appear
    expect(screen.getByText('javascript')).toBeInTheDocument();
    // The code content should be highlighted (hljs spans)
    const codeEl = codeFence?.querySelector('code');
    const spans = codeEl?.querySelectorAll('span[class*="hljs-"]');
    expect(spans?.length).toBeGreaterThan(0);
  });

  it('renders fenced code blocks with "code" label when no language specified', () => {
    const block: TextBlockData = {
      type: 'text',
      text: '```\nno language here\n```',
    };
    const { container } = render(<TextBlock block={block} />);
    const codeFence = container.querySelector('.cb-code-fence');
    expect(codeFence).toBeInTheDocument();
    const langLabel = container.querySelector('.cb-code-fence-lang');
    expect(langLabel?.textContent).toBe('code');
  });

  it('sanitizes dangerous HTML via DOMPurify', () => {
    const block: TextBlockData = {
      type: 'text',
      text: '<img src=x onerror=alert(1)> safe text',
    };
    const { container } = render(<TextBlock block={block} />);
    // The img tag should be stripped by DOMPurify
    expect(container.querySelector('img')).not.toBeInTheDocument();
    // The safe text should still be present
    expect(container.textContent).toContain('safe text');
  });

  it('strips <script> tags via DOMPurify', () => {
    const block: TextBlockData = {
      type: 'text',
      text: '<script>alert("xss")</script> visible text',
    };
    const { container } = render(<TextBlock block={block} />);
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.textContent).toContain('visible text');
  });

  it('handles empty text without crashing', () => {
    const block: TextBlockData = { type: 'text', text: '' };
    const { container } = render(<TextBlock block={block} />);
    const wrapper = container.querySelector('.cb-text-block');
    expect(wrapper).toBeInTheDocument();
  });

  it('renders line breaks as <br/>', () => {
    const block: TextBlockData = { type: 'text', text: 'Line 1\nLine 2' };
    const { container } = render(<TextBlock block={block} />);
    const brs = container.querySelectorAll('br');
    expect(brs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders mixed inline markdown correctly', () => {
    const block: TextBlockData = {
      type: 'text',
      text: '**Bold** and *italic* and `code`',
    };
    const { container } = render(<TextBlock block={block} />);
    expect(container.querySelector('strong')?.textContent).toBe('Bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelector('code')?.textContent).toBe('code');
  });
});
