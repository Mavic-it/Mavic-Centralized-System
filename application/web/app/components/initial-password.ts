const PASSWORD_GROUPS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%+-_",
] as const;
const PASSWORD_LENGTH = 18;

function secureRandomIndex(maxExclusive: number): number {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Secure password generation is unavailable in this browser.");
  }

  const limit = Math.floor(256 / maxExclusive) * maxExclusive;
  const value = new Uint8Array(1);
  do {
    cryptoApi.getRandomValues(value);
  } while (value[0] >= limit);

  return value[0] % maxExclusive;
}

export function generateInitialPassword(): string {
  const characters = PASSWORD_GROUPS.map(
    (group) => group[secureRandomIndex(group.length)],
  );
  const allCharacters = PASSWORD_GROUPS.join("");

  while (characters.length < PASSWORD_LENGTH) {
    characters.push(allCharacters[secureRandomIndex(allCharacters.length)]);
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }

  return characters.join("");
}
