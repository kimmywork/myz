export function solveCaptchaQuestion(question: string): string {
  const match = question.match(/What is (\d+) ([+-]) (\d+)\?/i);
  if (!match) {
    throw new Error(`Unsupported captcha question: ${question}`);
  }

  const [, left, operator, right] = match;
  const a = Number(left);
  const b = Number(right);

  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error(`Unable to parse captcha question: ${question}`);
  }

  return operator === "+" ? String(a + b) : String(a - b);
}
