import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

export async function verifyPassword(
  plainText: string,
  hashedValue: string
): Promise<boolean> {
  if (!hashedValue) {
    return false;
  }

  return bcrypt.compare(plainText, hashedValue);
}
