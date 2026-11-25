import React from 'react';
import katex from 'katex';

interface MathTextProps {
  text: string;
  className?: string;
}

type Segment =
  | { type: 'text'; content: string }
  | { type: 'inline'; content: string }
  | { type: 'display'; content: string };

/**
 * Splits text into plain text segments and LaTeX math segments ($$...$$ and $...$),
 * respecting escaped dollar signs (\$).
 */
function parseMathSegments(input: string): Segment[] {
  if (!input) return [];

  const segments: Segment[] = [];
  let i = 0;
  let buffer = '';

  const flushText = () => {
    if (buffer.length > 0) {
      segments.push({ type: 'text', content: buffer });
      buffer = '';
    }
  };

  while (i < input.length) {
    if (input[i] === '\\' && input[i + 1] === '$') {
      buffer += '$';
      i += 2;
      continue;
    }

    if (input[i] === '$' && input[i + 1] === '$') {
      const closeIdx = input.indexOf('$$', i + 2);
      if (closeIdx !== -1) {
        flushText();
        segments.push({
          type: 'display',
          content: input.slice(i + 2, closeIdx).trim(),
        });
        i = closeIdx + 2;
        continue;
      }
    }

    if (input[i] === '$') {
      let closeIdx = i + 1;
      let found = false;
      while (closeIdx < input.length) {
        if (input[closeIdx] === '\\' && input[closeIdx + 1] === '$') {
          closeIdx += 2;
          continue;
        }
        if (input[closeIdx] === '$') {
          found = true;
          break;
        }
        if (input[closeIdx] === '\n') {
          break;
        }
        closeIdx++;
      }

      if (found && closeIdx > i + 1) {
        flushText();
        segments.push({
          type: 'inline',
          content: input.slice(i + 1, closeIdx),
        });
        i = closeIdx + 1;
        continue;
      }
    }

    buffer += input[i];
    i++;
  }

  flushText();
  return segments;
}

function renderLatexHtml(latex: string, displayMode: boolean): string {
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    strict: false,
    trust: false,
  });
}

export const MathText: React.FC<MathTextProps> = ({ text, className }) => {
  const segments = React.useMemo(() => parseMathSegments(text), [text]);

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return <React.Fragment key={idx}>{seg.content}</React.Fragment>;
        }
        if (seg.type === 'display') {
          return (
            <span
              key={idx}
              className="my-1.5 block overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: renderLatexHtml(seg.content, true) }}
            />
          );
        }
        return (
          <span
            key={idx}
            className="inline-block align-baseline"
            dangerouslySetInnerHTML={{ __html: renderLatexHtml(seg.content, false) }}
          />
        );
      })}
    </span>
  );
};
