# code-golf-expr — AiProve entry

`evalExpr(s)` evaluates a tiny arithmetic expression string and returns a number.
Supports `+ - * /`, integer and decimal literals, parentheses, normal precedence,
and unary minus. No variables, no functions. Implemented as a compact recursive
descent parser (no `eval`/`Function`).

- File: `evalExpr.js` (383 bytes), exports `evalExpr` via `module.exports`.
- Public cases pass: `1+2*3`→7, `(1+2)*3`→9, `10/4`→2.5, `2*2*2*2`→16,
  `7-3-2`→2, `(8-2)/(1+2)`→2, `3.5+1.5`→5, `100`→100, `2*(3+(4-1))`→12.
- Also handles unary minus (`-5+3`→-2, `2*-3`→-6) and nested parentheses.
