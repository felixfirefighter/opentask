const profileUsernameKey = "opentask.profile.username";
const profileUsernameMaximum = 64;

export function readProfileUsername(): string | null {
  try {
    return normalizeProfileUsername(window.localStorage.getItem(profileUsernameKey));
  } catch {
    return null;
  }
}

export function saveProfileUsername(value: string): string {
  const username = normalizeProfileUsername(value);
  if (!username) throw new Error("A profile username is required.");
  window.localStorage.setItem(profileUsernameKey, username);
  return username;
}

export function validateProfileUsername(value: string): string | null {
  const username = normalizeProfileUsername(value);
  if (!username) return "Enter a username to open your workspace.";
  if (username.length > profileUsernameMaximum) {
    return `Keep your username to ${profileUsernameMaximum} characters or fewer.`;
  }
  if (/[\u0000-\u001f\u007f]/u.test(username)) return "Use visible characters only.";
  return null;
}

function normalizeProfileUsername(value: string | null): string | null {
  const username = value?.trim() ?? "";
  return username || null;
}
