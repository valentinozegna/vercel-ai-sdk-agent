import { defineTool } from "eve/tools";
import { z } from "zod";

/** Tiny safe arithmetic evaluator (no eval). Supports + - * / % ^ and parens. */
function evaluateExpression(input: string): number {
  const s = input.replace(/\s+/g, "");
  if (s === "" || !/^[\d+\-*/%^().]+$/.test(s)) {
    throw new Error("Invalid characters in expression");
  }
  let i = 0;

  const parseExpr = (): number => {
    let v = parseTerm();
    while (i < s.length && (s[i] === "+" || s[i] === "-")) {
      const op = s[i++];
      const rhs = parseTerm();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    while (i < s.length && (s[i] === "*" || s[i] === "/" || s[i] === "%")) {
      const op = s[i++];
      const rhs = parseFactor();
      v = op === "*" ? v * rhs : op === "/" ? v / rhs : v % rhs;
    }
    return v;
  };
  const parseFactor = (): number => {
    const base = parseUnary();
    if (i < s.length && s[i] === "^") {
      i++;
      return base ** parseFactor(); // right-associative
    }
    return base;
  };
  const parseUnary = (): number => {
    if (s[i] === "-") {
      i++;
      return -parseUnary();
    }
    if (s[i] === "+") {
      i++;
      return parseUnary();
    }
    return parsePrimary();
  };
  const parsePrimary = (): number => {
    if (s[i] === "(") {
      i++;
      const v = parseExpr();
      if (s[i] !== ")") throw new Error("Missing closing parenthesis");
      i++;
      return v;
    }
    const start = i;
    while (i < s.length && /[\d.]/.test(s[i])) i++;
    if (start === i) throw new Error(`Unexpected token at position ${i}`);
    const n = Number(s.slice(start, i));
    if (Number.isNaN(n)) throw new Error("Invalid number");
    return n;
  };

  const result = parseExpr();
  if (i !== s.length) throw new Error(`Unexpected token at position ${i}`);
  return result;
}

export default defineTool({
  description:
    "Evaluate an arithmetic expression exactly. Supports + - * / % ^ and parentheses. Use it for any math instead of computing in your head.",
  inputSchema: z.object({
    expression: z.string().describe('e.g. "(12 + 7) * 3"'),
  }),
  execute({ expression }) {
    return { expression, result: evaluateExpression(expression) };
  },
});
