const HASH_RE = /^sha256:[a-f0-9]{64}$/i;

function acceptedStatus(status) {
  return new Set(["ready", "passed", "success", "ok", "completed"]).has(status);
}

function stringField(root, keys) {
  for (const key of keys) {
    const value = root?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstObject(root, keys) {
  for (const key of keys) {
    const value = root?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }
  return {};
}

function validSha256(value) {
  return HASH_RE.test(value || "");
}

function missingCodes(preflight) {
  const items = Array.isArray(preflight?.missingRequirements)
    ? preflight.missingRequirements
    : [];
  return items
    .map((item) => item?.code)
    .filter((code) => typeof code === "string" && code.trim());
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

export function summarizePreflight(preflight, expectedVersion = "") {
  if (!preflight || typeof preflight !== "object" || Array.isArray(preflight)) {
    return {
      appServerInspectPresent: false,
      appSignatureYamlPresent: false,
      expectedVersion: expectedVersion || null,
      manifestHash: null,
      manifestHashValid: false,
      missingRequirementCodes: [],
      packageHash: null,
      packageHashValid: false,
      present: false,
      publishReadinessConfigured: false,
      ready: false,
      signatureAlgorithm: null,
      signatureCryptographicVerificationStatus: null,
      signaturePayloadHash: null,
      signaturePayloadHashMatched: null,
      signaturePresent: false,
      signaturePublicKeyId: null,
      signatureRef: null,
      signatureSignedAt: null,
      status: "missing",
      statusReady: false,
      trustRootPresent: false,
      version: null,
      versionMatches: false,
    };
  }

  const packageSummary = firstObject(preflight, ["package", "packageSummary"]);
  const signature = firstObject(preflight, ["signature"]);
  const appServerInspect = firstObject(preflight, [
    "appServerInspect",
    "app_server_inspect",
  ]);
  const publishReadiness = firstObject(preflight, [
    "publishReadiness",
    "publish_readiness",
  ]);
  const signatureRef = stringField(signature, [
    "signatureRef",
    "signature_ref",
  ]);
  const signaturePublicKeyId = stringField(signature, [
    "publicKeyId",
    "public_key_id",
    "keyId",
    "key_id",
  ]);
  const signatureAlgorithm = stringField(signature, ["algorithm", "alg"]);
  const signaturePayloadHash = stringField(signature, [
    "payloadHash",
    "payload_hash",
  ]);
  const signatureSignedAt = stringField(signature, ["signedAt", "signed_at"]);
  const signatureCryptographicVerificationStatus = stringField(signature, [
    "signatureCryptographicVerificationStatus",
    "signature_cryptographic_verification_status",
  ]);
  const rawSignaturePayloadHashMatched =
    signature.signaturePayloadHashMatched ??
    signature.signature_payload_hash_matched;
  const signaturePayloadHashMatched =
    typeof rawSignaturePayloadHashMatched === "boolean"
      ? rawSignaturePayloadHashMatched
      : null;
  const packageHash = stringField(packageSummary, [
    "packageHash",
    "package_hash",
  ]);
  const manifestHash = stringField(packageSummary, [
    "manifestHash",
    "manifest_hash",
  ]);
  const version =
    stringField(packageSummary, ["version", "appVersion", "app_version"]) ||
    stringField(preflight, ["expectedVersion", "expected_version"]);
  const status = stringField(preflight, ["status"]) || "missing";
  const statusReady = preflight.ready === true && acceptedStatus(status);
  const versionMatches = expectedVersion
    ? version === expectedVersion
    : Boolean(version);
  const appServerInspectPresent =
    appServerInspect.present === true ||
    Boolean(
      stringField(appServerInspect, ["manifestHash", "manifest_hash"]) &&
      stringField(appServerInspect, ["packageHash", "package_hash"]),
    );

  return {
    appServerInspectPresent,
    appSignatureYamlPresent: signature.appSignatureYamlPresent === true,
    expectedVersion: expectedVersion || null,
    manifestHash: manifestHash || null,
    manifestHashValid: validSha256(manifestHash),
    missingRequirementCodes: missingCodes(preflight),
    packageHash: packageHash || null,
    packageHashValid: validSha256(packageHash),
    present: true,
    publishReadinessConfigured: publishReadiness.configured === true,
    ready:
      statusReady &&
      validSha256(packageHash) &&
      validSha256(manifestHash) &&
      appServerInspectPresent &&
      signature.appSignatureYamlPresent === true &&
      signature.trustRootPresent === true &&
      signatureCryptographicVerificationStatus === "verified" &&
      signaturePayloadHashMatched === true &&
      versionMatches,
    signatureAlgorithm: signatureAlgorithm || null,
    signatureCryptographicVerificationStatus:
      signatureCryptographicVerificationStatus || null,
    signaturePayloadHash: signaturePayloadHash || null,
    signaturePayloadHashMatched,
    signaturePresent: signature.signaturePresent === true,
    signaturePublicKeyId: signaturePublicKeyId || null,
    signatureRef: signatureRef || null,
    signatureSignedAt: signatureSignedAt || null,
    status,
    statusReady,
    trustRootPresent: signature.trustRootPresent === true,
    version: version || null,
    versionMatches,
  };
}

export function appendPreflightRequirements(
  missingRequirements,
  preflight,
  catalog,
) {
  if (!preflight.present) {
    pushRequirement(
      missingRequirements,
      "production_preflight_missing",
      "Production preflight evidence is required and must inspect the real .lapp package through current App Server pluginLocalPackage/inspect.",
    );
    return;
  }
  if (!preflight.ready) {
    const suffix =
      preflight.missingRequirementCodes.length > 0
        ? ` Missing preflight codes: ${preflight.missingRequirementCodes.join(", ")}.`
        : "";
    pushRequirement(
      missingRequirements,
      "production_preflight_not_ready",
      `Production preflight must be ready before signed release gate can pass.${suffix}`,
    );
  }
  if (!preflight.versionMatches) {
    pushRequirement(
      missingRequirements,
      "production_preflight_version_mismatch",
      "Production preflight package version must match expected content-factory-app version.",
    );
  }
  if (preflight.appSignatureYamlPresent && !preflight.signatureRef) {
    pushRequirement(
      missingRequirements,
      "production_preflight_signature_ref_missing",
      "Production preflight app.signature.yaml summary must include signatureRef.",
    );
  }
  if (preflight.appSignatureYamlPresent && !preflight.signaturePublicKeyId) {
    pushRequirement(
      missingRequirements,
      "production_preflight_signature_public_key_id_missing",
      "Production preflight app.signature.yaml summary must include publicKeyId.",
    );
  }
  if (preflight.appSignatureYamlPresent && !preflight.signatureAlgorithm) {
    pushRequirement(
      missingRequirements,
      "production_preflight_signature_algorithm_missing",
      "Production preflight app.signature.yaml summary must include algorithm.",
    );
  }
  if (preflight.appSignatureYamlPresent && !preflight.signaturePayloadHash) {
    pushRequirement(
      missingRequirements,
      "production_preflight_signature_payload_hash_missing",
      "Production preflight app.signature.yaml summary must include payloadHash.",
    );
  }
  if (preflight.appSignatureYamlPresent && !preflight.signatureSignedAt) {
    pushRequirement(
      missingRequirements,
      "production_preflight_signature_signed_at_missing",
      "Production preflight app.signature.yaml summary must include signedAt.",
    );
  }
  if (preflight.appSignatureYamlPresent && !preflight.signaturePresent) {
    pushRequirement(
      missingRequirements,
      "production_preflight_signature_value_missing",
      "Production preflight app.signature.yaml summary must prove detached signature is present.",
    );
  }
  if (
    preflight.appSignatureYamlPresent &&
    preflight.signatureCryptographicVerificationStatus !== "verified"
  ) {
    pushRequirement(
      missingRequirements,
      "production_preflight_signature_cryptographic_verification_missing",
      "Production preflight app.signature.yaml summary must prove cryptographic signature verification.",
    );
  }
  addMismatchWhenBoth(
    missingRequirements,
    preflight.signatureRef,
    catalog.signatureRef,
    "production_signature_catalog_signature_ref_mismatch",
    "Production catalog identity.signatureRef must match preflight app.signature.yaml.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    preflight.signaturePublicKeyId,
    catalog.signatureProof?.publicKeyId,
    "production_signature_catalog_public_key_id_mismatch",
    "Production catalog signatureProof.publicKeyId must match preflight app.signature.yaml.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    preflight.signatureAlgorithm,
    catalog.signatureProof?.algorithm,
    "production_signature_catalog_algorithm_mismatch",
    "Production catalog signatureProof.algorithm must match preflight app.signature.yaml.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    preflight.signaturePayloadHash,
    catalog.signatureProof?.payloadHash,
    "production_signature_catalog_payload_hash_mismatch",
    "Production catalog signatureProof.payloadHash must match preflight app.signature.yaml.",
  );
  addMismatchWhenBoth(
    missingRequirements,
    preflight.signatureSignedAt,
    catalog.signatureProof?.signedAt,
    "production_signature_catalog_signed_at_mismatch",
    "Production catalog signatureProof.signedAt must match preflight app.signature.yaml.",
  );
  if (
    preflight.packageHash &&
    catalog.packageHash &&
    preflight.packageHash !== catalog.packageHash
  ) {
    pushRequirement(
      missingRequirements,
      "production_preflight_catalog_package_hash_mismatch",
      "Production catalog packageHash must match the preflight .lapp package sha256.",
    );
  }
  if (
    preflight.manifestHash &&
    catalog.manifestHash &&
    preflight.manifestHash !== catalog.manifestHash
  ) {
    pushRequirement(
      missingRequirements,
      "production_preflight_catalog_manifest_hash_mismatch",
      "Production catalog manifestHash must match the preflight App Server manifest sha256.",
    );
  }
}
