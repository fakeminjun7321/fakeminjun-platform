import React from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

const DELIMITED_MATH = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/gu;
const STANDALONE_MATH = /[=<>]|\\(?:boxed|frac|sqrt|sin|cos|tan|lim|sum|int|theta|mu|pi|hbar|psi|to)\b/u;

function KatexFragment({ value, displayMode = false }) {
  const html = katex.renderToString(value, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: false,
    output: "html",
  });
  return <span className={displayMode ? "physics-math is-display" : "physics-math"} dangerouslySetInnerHTML={{ __html: html }} />;
}

function PlainPhysicsText({ value }) {
  const lines = value.split("\n");
  return lines.map((line, index) => {
    const normalizedLine = line.trim();
    const displayMath = normalizedLine && !/[가-힣]/u.test(normalizedLine) && STANDALONE_MATH.test(normalizedLine);
    return (
      <React.Fragment key={`${index}-${line.slice(0, 20)}`}>
        {displayMath ? <KatexFragment value={normalizedLine} displayMode /> : line}
        {index < lines.length - 1 ? <br /> : null}
      </React.Fragment>
    );
  });
}

export function normalizePhysicsText(value) {
  return String(value ?? "").replace(/\\n(?![A-Za-z])/gu, "\n");
}

export function PhysicsMathText({ children }) {
  const value = normalizePhysicsText(children);
  const nodes = [];
  let cursor = 0;
  for (const match of value.matchAll(DELIMITED_MATH)) {
    if (match.index > cursor) nodes.push(<PlainPhysicsText key={`plain-${cursor}`} value={value.slice(cursor, match.index)} />);
    nodes.push(<KatexFragment key={`math-${match.index}`} value={match[1] ?? match[2] ?? ""} displayMode={Boolean(match[2])} />);
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) nodes.push(<PlainPhysicsText key={`plain-${cursor}`} value={value.slice(cursor)} />);
  return nodes.length ? nodes : null;
}

export default PhysicsMathText;
