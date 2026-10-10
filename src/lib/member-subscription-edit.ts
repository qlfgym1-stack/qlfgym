export function shouldCreateSubscriptionOnMemberEdit(
  selectedTypeId: string | null | undefined,
  originalTypeId: string | null | undefined,
): boolean {
  if (!selectedTypeId) return false
  return selectedTypeId !== (originalTypeId ?? '')
}
