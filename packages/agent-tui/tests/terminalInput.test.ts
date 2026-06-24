import assert from "node:assert/strict"
import test from "node:test"
import { isMouseInput, isMouseWheelDown, isMouseWheelUp, isSgrMouseInput } from "../src/terminalInput"

test("terminalInput recognizes mouse sequences so InputBar can ignore them", () => {
  const legacyWheelUp = `\u001B[M${String.fromCharCode(96)}!!`
  const legacyWheelDown = `\u001B[M${String.fromCharCode(97)}!!`

  assert.equal(isSgrMouseInput("\u001B[<64;10;5M"), true)
  assert.equal(isSgrMouseInput("\u001B[<65;10;5M"), true)
  assert.equal(isMouseInput(legacyWheelUp), true)
  assert.equal(isMouseWheelUp("\u001B[<64;10;5M"), true)
  assert.equal(isMouseWheelDown("\u001B[<65;10;5M"), true)
  assert.equal(isMouseWheelUp(legacyWheelUp), true)
  assert.equal(isMouseWheelDown(legacyWheelDown), true)
  assert.equal(isMouseInput("hello"), false)
})
