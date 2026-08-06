export function cn(
  ...parts: ReadonlyArray<string | false | null | undefined>
): string {
  return parts.filter((part): part is string => Boolean(part)).join(" ");
}
