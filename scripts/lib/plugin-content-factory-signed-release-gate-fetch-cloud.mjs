const HASH_RE = /^sha256:[a-f0-9]{64}$/i;

function valueAtPath(root, parts) {
  let current = root;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function firstStringAtPaths(root, paths) {
  for (const parts of paths) {
    const value = valueAtPath(root, parts);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstOptionalBoolAtPaths(root, paths) {
  for (const parts of paths) {
    const value = valueAtPath(root, parts);
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function firstObjectAtPaths(root, paths) {
  for (const parts of paths) {
    const value = valueAtPath(root, parts);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }
  return null;
}

function isFixtureText(value) {
  return /fixture|localhost|127\.0\.0\.1|hostGenerationFixture|cloudReleaseFixture/i.test(
    String(value || ""),
  );
}

function stringValuesContainFixtureText(root, seen = new Set()) {
  if (typeof root === "string") return isFixtureText(root);
  if (!root || typeof root !== "object" || seen.has(root)) return false;
  seen.add(root);
  const values = Array.isArray(root) ? root : Object.values(root);
  return values.some((value) => stringValuesContainFixtureText(value, seen));
}

function validSha256(value) {
  return HASH_RE.test(value || "");
}

function summarizeSignatureProof(root) {
  const proof =
    firstObjectAtPaths(root, [
      ["signatureProof"],
      ["signature_proof"],
      ["identity", "signatureProof"],
      ["identity", "signature_proof"],
      ["cloudReleaseEvidence", "signatureProof"],
      ["cloudReleaseEvidence", "signature_proof"],
      ["setup", "cloudReleaseEvidence", "signatureProof"],
      ["descriptor", "signatureProof"],
      ["descriptor", "signature_proof"],
    ]) || {};
  const algorithm = firstStringAtPaths(proof, [["algorithm"], ["alg"]]);
  const payloadHash = firstStringAtPaths(proof, [
    ["payloadHash"],
    ["payload_hash"],
  ]);
  const publicKeyId = firstStringAtPaths(proof, [
    ["publicKeyId"],
    ["public_key_id"],
    ["keyId"],
    ["key_id"],
  ]);
  const signaturePresent = Boolean(
    firstStringAtPaths(proof, [["signature"], ["sig"]]),
  );
  const signedAt = firstStringAtPaths(proof, [["signedAt"], ["signed_at"]]);
  return {
    algorithm: algorithm || null,
    payloadHash: payloadHash || null,
    present: Boolean(
      publicKeyId && algorithm && payloadHash && signaturePresent && signedAt,
    ),
    publicKeyId: publicKeyId || null,
    signaturePresent,
    signedAt: signedAt || null,
  };
}

function pushRequirement(missingRequirements, code, detail) {
  if (missingRequirements.some((item) => item?.code === code)) return;
  missingRequirements.push({ code, detail });
}

function addMismatchWhenBoth(missingRequirements, left, right, code, detail) {
  if (left && right && left !== right) {
    pushRequirement(missingRequirements, code, detail);
  }
}

export function summarizeFetchCloud(fetchCloud) {
  const sourceKind = firstStringAtPaths(fetchCloud || {}, [
    ["sourceKind"],
    ["source_kind"],
    ["identity", "sourceKind"],
    ["identity", "source_kind"],
    ["installedState", "sourceKind"],
    ["installed_state", "source_kind"],
    ["cloudReleaseFixture", "sourceKind"],
  ]);
  const status = firstStringAtPaths(fetchCloud || {}, [
    ["status"],
    ["evidenceStatus"],
    ["evidence_status"],
    ["cloudReleaseEvidence", "status"],
    ["setup", "cloudReleaseEvidence", "status"],
    ["cloudReleaseFixture", "evidenceStatus"],
  ]);
  const signatureVerificationStatus = firstStringAtPaths(fetchCloud || {}, [
    ["signatureVerificationStatus"],
    ["signature_verification_status"],
    ["cloudReleaseEvidence", "signatureVerificationStatus"],
    ["setup", "cloudReleaseEvidence", "signatureVerificationStatus"],
    ["cloudReleaseFixture", "signatureVerificationStatus"],
  ]);
  const packageVerificationStatus = firstStringAtPaths(fetchCloud || {}, [
    ["packageVerificationStatus"],
    ["package_verification_status"],
    ["cloudReleaseEvidence", "packageVerificationStatus"],
    ["setup", "cloudReleaseEvidence", "packageVerificationStatus"],
    ["cloudReleaseFixture", "packageVerificationStatus"],
  ]);
  const packageHashMatched = firstOptionalBoolAtPaths(fetchCloud || {}, [
    ["packageHashMatched"],
    ["package_hash_matched"],
    ["cloudReleaseEvidence", "packageHashMatched"],
    ["setup", "cloudReleaseEvidence", "packageHashMatched"],
  ]);
  const manifestHashMatched = firstOptionalBoolAtPaths(fetchCloud || {}, [
    ["manifestHashMatched"],
    ["manifest_hash_matched"],
    ["cloudReleaseEvidence", "manifestHashMatched"],
    ["setup", "cloudReleaseEvidence", "manifestHashMatched"],
  ]);
  const packageHash = firstStringAtPaths(fetchCloud || {}, [
    ["packageHash"],
    ["package_hash"],
    ["identity", "packageHash"],
    ["identity", "package_hash"],
    ["cloudReleaseEvidence", "packageHash"],
    ["cloudReleaseEvidence", "package_hash"],
    ["descriptor", "packageHash"],
    ["descriptor", "package_hash"],
  ]);
  const manifestHash = firstStringAtPaths(fetchCloud || {}, [
    ["manifestHash"],
    ["manifest_hash"],
    ["identity", "manifestHash"],
    ["identity", "manifest_hash"],
    ["cloudReleaseEvidence", "manifestHash"],
    ["cloudReleaseEvidence", "manifest_hash"],
    ["descriptor", "manifestHash"],
    ["descriptor", "manifest_hash"],
  ]);
  const packageUrl = firstStringAtPaths(fetchCloud || {}, [
    ["packageUrl"],
    ["package_url"],
    ["sourceUri"],
    ["source_uri"],
    ["identity", "sourceUri"],
    ["identity", "source_uri"],
    ["cloudReleaseEvidence", "sourceUri"],
    ["cloudReleaseEvidence", "source_uri"],
    ["descriptor", "sourceUri"],
    ["descriptor", "source_uri"],
  ]);
  const signatureRef = firstStringAtPaths(fetchCloud || {}, [
    ["signatureRef"],
    ["signature_ref"],
    ["identity", "signatureRef"],
    ["identity", "signature_ref"],
    ["cloudReleaseEvidence", "signatureRef"],
    ["cloudReleaseEvidence", "signature_ref"],
    ["descriptor", "signatureRef"],
    ["descriptor", "signature_ref"],
  ]);
  const signatureProof = summarizeSignatureProof(fetchCloud || {});
  return {
    fixtureLike: stringValuesContainFixtureText(fetchCloud || {}),
    manifestHash: validSha256(manifestHash) ? manifestHash : null,
    manifestHashMatched: manifestHashMatched === true,
    packageHash: validSha256(packageHash) ? packageHash : null,
    packageHashMatched: packageHashMatched === true,
    packageUrl: packageUrl || null,
    packageVerificationStatus: packageVerificationStatus || null,
    ready:
      sourceKind === "cloud_release" &&
      status === "ready" &&
      signatureVerificationStatus === "verified" &&
      packageVerificationStatus === "verified" &&
      packageHashMatched === true &&
      manifestHashMatched === true,
    signatureProof,
    signatureRef: signatureRef || null,
    signatureVerificationStatus: signatureVerificationStatus || null,
    sourceKind: sourceKind || null,
    status: status || "missing",
  };
}

export function appendFetchCloudRequirements(
  missingRequirements,
  inputFetchCloud,
  fetchCloud,
  catalog,
  preflight,
) {
  if (!inputFetchCloud) {
    pushRequirement(
      missingRequirements,
      "production_fetch_cloud_evidence_missing",
      "pluginPackage/fetchCloud or package verification evidence is required.",
    );
    return;
  }
  if (!fetchCloud.ready) {
    pushRequirement(
      missingRequirements,
      "production_release_evidence_not_ready",
      "fetchCloud evidence must prove cloud_release, verified hashes, verified signature, and ready status.",
    );
  }
  if (fetchCloud.fixtureLike) {
    pushRequirement(
      missingRequirements,
      "fixture_cloud_release_not_allowed",
      "Fixture cloud_release evidence is not production evidence.",
    );
  }
  addMismatchWhenBoth(
    missingRequirements,
    fetchCloud.packageHash,
    catalog.packageHash,
    "production_fetch_cloud_catalog_package_hash_mismatch",
    "fetchCloud packageHash must match production catalog packageHash.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    fetchCloud.manifestHash,
    catalog.manifestHash,
    "production_fetch_cloud_catalog_manifest_hash_mismatch",
    "fetchCloud manifestHash must match production catalog manifestHash.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    fetchCloud.packageUrl,
    catalog.packageUrl,
    "production_fetch_cloud_catalog_package_url_mismatch",
    "fetchCloud package URL must match production catalog packageUrl/sourceUri.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    fetchCloud.signatureRef,
    catalog.signatureRef,
    "production_fetch_cloud_catalog_signature_ref_mismatch",
    "fetchCloud signatureRef must match production catalog identity.signatureRef.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    fetchCloud.signatureProof.publicKeyId,
    catalog.signatureProof?.publicKeyId,
    "production_fetch_cloud_catalog_public_key_id_mismatch",
    "fetchCloud signatureProof.publicKeyId must match production catalog signatureProof.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    fetchCloud.signatureProof.algorithm,
    catalog.signatureProof?.algorithm,
    "production_fetch_cloud_catalog_algorithm_mismatch",
    "fetchCloud signatureProof.algorithm must match production catalog signatureProof.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    fetchCloud.signatureProof.payloadHash,
    catalog.signatureProof?.payloadHash,
    "production_fetch_cloud_catalog_payload_hash_mismatch",
    "fetchCloud signatureProof.payloadHash must match production catalog signatureProof.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    fetchCloud.signatureProof.signedAt,
    catalog.signatureProof?.signedAt,
    "production_fetch_cloud_catalog_signed_at_mismatch",
    "fetchCloud signatureProof.signedAt must match production catalog signatureProof.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    fetchCloud.packageHash,
    preflight.packageHash,
    "production_fetch_cloud_preflight_package_hash_mismatch",
    "fetchCloud packageHash must match preflight .lapp packageHash.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    fetchCloud.manifestHash,
    preflight.manifestHash,
    "production_fetch_cloud_preflight_manifest_hash_mismatch",
    "fetchCloud manifestHash must match preflight App Server manifestHash.",
  );
}
