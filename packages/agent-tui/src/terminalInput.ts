export function isSgrMouseInput(input: string) {
  return /\x1B\[<\d+;\d+;\d+[mM]/.test(input)
}

export function isMouseWheelUp(input: string) {
  return /\x1B\[<6[04];\d+;\d+M/.test(input)
}

export function isMouseWheelDown(input: string) {
  return /\x1B\[<6[15];\d+;\d+M/.test(input)
}
