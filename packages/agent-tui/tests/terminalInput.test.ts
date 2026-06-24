import assert from "node:assert/strict"
import test from "node:test"
import { isMouseWheelDown, isMouseWheelUp, isSgrMouseInput } from "../src/terminalInput"

test("terminalInput recognizes mouse sequences so InputBar can ignore them", () => {
  assert.equal(isSgrMouseInput("\u001B[<64;10;5M"), true)
  assert.equal(isSgrMouseInput("\u001B[<65;10;5M"), true)
  assert.equal(isMouseWheelUp("\u001B[<64;10;5M"), true)
  assert.equal(isMouseWheelDown("\u001B[<65;10;5M"), true)
  assert.equal(isSgrMouseInput("hello"), false)
})
