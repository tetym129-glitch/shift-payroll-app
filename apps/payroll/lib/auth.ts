export function verifyOwnerPin(pin: string): boolean {
  const validPin = process.env.OWNER_PIN || process.env.ADMIN_PIN || ''
  return pin === validPin
}
