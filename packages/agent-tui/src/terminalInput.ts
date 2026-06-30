/* eslint-disable no-control-regex */
export function isLegacyMouseInput(input: string) {
  return /\x1B\[M[\s\S]{3}/.test(input)
}

function legacyMouseButtonCode(input: string) {
  const index = input.indexOf("\x1B[M")
  if (index < 0 || input.length <= index + 3) return -1
  return input.charCodeAt(index + 3) - 32
}

export function isSgrMouseInput(input: string) {
  return /\x1B\[<\d+;\d+;\d+[mM]/.test(input)
}

export function isMouseInput(input: string) {
  return isSgrMouseInput(input) || isLegacyMouseInput(input)
}

export function isMouseWheelUp(input: string) {
  return /\x1B\[<6[04];\d+;\d+M/.test(input) || legacyMouseButtonCode(input) === 64
}

export function isMouseWheelDown(input: string) {
  return /\x1B\[<6[15];\d+;\d+M/.test(input) || legacyMouseButtonCode(input) === 65
}
