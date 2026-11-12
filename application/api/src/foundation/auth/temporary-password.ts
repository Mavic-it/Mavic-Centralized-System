import { randomInt } from 'node:crypto';

const groups = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  'abcdefghijkmnopqrstuvwxyz',
  '23456789',
  '!@#$%&*+-=?',
];
const alphabet = groups.join('');

export function generateTemporaryPassword(length = 12): string {
  if (!Number.isInteger(length) || length < 8 || length > 12)
    throw new Error('Temporary password length must be from 8 to 12.');
  // Rejection sampling keeps the distribution uniform over valid passwords.
  while (true) {
    const characters = Array.from(
      { length },
      () => alphabet[randomInt(alphabet.length)],
    );
    if (
      groups.every((group) =>
        characters.some((character) => group.includes(character)),
      )
    )
      return characters.join('');
  }
}
