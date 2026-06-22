export function normalizeExpertSkillRefKey(ref: string): string {
  return ref.trim().toLowerCase();
}

export function dedupeExpertSkillRefs(refs: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const ref of refs) {
    const normalized = ref.trim();
    if (!normalized) {
      continue;
    }
    const key = normalizeExpertSkillRefKey(normalized);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function addExpertSkillRef(
  refs: readonly string[],
  nextRef: string,
): string[] {
  return dedupeExpertSkillRefs([...refs, nextRef]);
}

export function removeExpertSkillRef(
  refs: readonly string[],
  refToRemove: string,
): string[] {
  const removeKey = normalizeExpertSkillRefKey(refToRemove);
  return refs.filter((ref) => normalizeExpertSkillRefKey(ref) !== removeKey);
}

export function replaceExpertSkillRef(
  refs: readonly string[],
  targetRef: string,
  replacementRef: string,
): string[] {
  const targetKey = normalizeExpertSkillRefKey(targetRef);
  const replacement = replacementRef.trim();
  if (!targetKey) {
    return addExpertSkillRef(refs, replacement);
  }
  if (!replacement) {
    return removeExpertSkillRef(refs, targetRef);
  }

  let replaced = false;
  const nextRefs = refs.map((ref) => {
    if (normalizeExpertSkillRefKey(ref) !== targetKey) {
      return ref;
    }
    replaced = true;
    return replacement;
  });
  if (!replaced) {
    nextRefs.push(replacement);
  }
  return dedupeExpertSkillRefs(nextRefs);
}
