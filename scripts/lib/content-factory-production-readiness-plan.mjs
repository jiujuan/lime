const PHASES = [
  {
    id: "local_package_preflight",
    owner: "engineering",
    title: "本地包与 App Server inspect",
    nextAction:
      "先修复 .lapp 包结构、版本、packageHash/manifestHash 或 current App Server inspect，再重新跑 production preflight。",
    commandHint:
      "npm run plugin:content-factory-production-preflight -- --content-factory-dir <content-factory-app> --output <preflight.json> --expected-version <version>",
    matches: (code) =>
      [
        "production_app_server_manifest_inspect_missing",
        "production_manifest_hash_invalid",
        "production_package_app_id_mismatch",
        "production_package_entries_missing",
        "production_package_hash_invalid",
        "production_package_missing",
        "production_package_not_readable",
        "production_package_version_mismatch",
        "production_preflight_missing",
        "production_preflight_version_mismatch",
      ].includes(code),
  },
  {
    id: "release_signing_and_trust",
    owner: "operator",
    title: "签名 proof 与可信根",
    nextAction:
      "用 readiness pipeline 显式 --generate-signature-proof 生成真实 app.signature.yaml 与 production trust root，确保 schemaVersion/signatureRef/publicKeyId/algorithm/payloadHash/signedAt 一致，trust root 带 publicKey；不要把私钥或签名原文写入 evidence。",
    commandHint:
      "npm run plugin:content-factory-production-readiness-pipeline -- --expected-version <version> --package-url <https-url> --release-id <release-id> --public-key-id <public-key-id> --generate-signature-proof --signing-private-key-env PLUGIN_SIGNING_PRIVATE_KEY_PEM # requires local env: PLUGIN_SIGNING_PRIVATE_KEY_PEM",
    matches: (code) =>
      code === "production_app_signature_yaml_missing" ||
      code === "production_app_signature_yaml_missing_or_invalid" ||
      code === "production_preflight_not_ready" ||
      code === "production_signature_algorithm_missing" ||
      code === "production_signature_payload_hash_invalid" ||
      code === "production_signature_payload_hash_mismatch" ||
      code === "production_signature_public_key_id_missing" ||
      code === "production_signature_schema_version_missing" ||
      code === "production_signature_schema_version_unsupported" ||
      code === "production_signature_signed_at_invalid" ||
      code === "production_signature_cryptographic_verification_failed" ||
      code === "production_signature_trust_root_algorithm_mismatch" ||
      code === "production_signature_trust_root_mismatch" ||
      code === "production_signature_trust_root_public_key_missing" ||
      code === "production_signature_value_missing" ||
      code.startsWith("production_preflight_signature_") ||
      code.startsWith("production_trust_root_"),
  },
  {
    id: "studio_publish_inputs",
    owner: "operator",
    title: "Studio 发布输入",
    nextAction:
      "补齐真实 HTTPS packageUrl、tenantId 和 developer token 后重新跑 Studio publish --dry-run；API base 默认使用官方地址，只有覆盖默认地址时才传 --api-base；dry-run 不能替代正式 cloud release。",
    commandHint:
      "npm run plugin:content-factory-production-readiness-pipeline -- --expected-version <version> --package-url <https-url> --tenant-id <tenant-id> --studio-token-env LIME_AGENT_APP_STUDIO_TOKEN # requires local env: LIME_AGENT_APP_STUDIO_TOKEN",
    matches: (code) =>
      [
        "production_package_url_missing",
        "production_package_url_not_https",
        "production_studio_dry_run_manifest_hash_mismatch",
        "production_studio_dry_run_missing",
        "production_studio_dry_run_not_ready",
        "production_studio_dry_run_package_hash_mismatch",
        "production_studio_dry_run_parse_failed",
        "production_studio_token_missing",
        "production_tenant_id_missing",
      ].includes(code),
  },
  {
    id: "production_catalog_bootstrap",
    owner: "operator",
    title: "production catalog 与 bootstrap",
    nextAction:
      "通过 current bulk publish 写入 production catalog，并读取带 pluginSignatureTrustRoots 的 production bootstrap；catalog 只能指向 cloud_release HTTPS 包。",
    commandHint:
      "npm run plugin:content-factory-production-readiness-pipeline -- --catalog <catalog.json> --bootstrap <bootstrap.json> --fetch-cloud-from-catalog --expected-version <version>",
    matches: (code) =>
      code === "production_bootstrap_missing" ||
      code === "production_bootstrap_trust_roots_missing" ||
      code === "production_catalog_missing" ||
      code === "production_manifest_hash_missing" ||
      code === "production_package_hash_missing" ||
      code === "production_signature_proof_missing" ||
      code === "production_signature_ref_missing" ||
      code === "production_signature_algorithm_unsupported" ||
      code === "production_signature_trust_root_missing" ||
      code === "production_trust_roots_missing" ||
      code === "production_version_mismatch" ||
      code.startsWith("production_catalog_") ||
      code.startsWith("production_preflight_catalog_") ||
      code.startsWith("production_release_evidence_bootstrap_") ||
      code.startsWith("production_release_evidence_catalog_") ||
      code === "production_release_evidence_marketplace_request_failed" ||
      code.startsWith("production_signature_catalog_"),
  },
  {
    id: "fetch_cloud_verification",
    owner: "app_server",
    title: "App Server fetchCloud 验证",
    nextAction:
      "用 current App Server pluginPackage/fetchCloud 验证 production cloud_release 包、签名、packageHash 和 manifestHash；不能手写 ready JSON。",
    commandHint:
      "npm run plugin:content-factory-production-readiness-pipeline -- --catalog <catalog.json> --bootstrap <bootstrap.json> --fetch-cloud-from-catalog --expected-version <version>",
    matches: (code) =>
      code === "production_release_evidence_not_ready" ||
      code.startsWith("production_fetch_cloud_"),
  },
  {
    id: "desktop_cloud_release_e2e",
    owner: "gui_e2e",
    title: "真实桌面 cloud_release E2E",
    nextAction:
      "在真实 Lime Desktop 安装 production cloud_release 后用 Electron CDP 跑 @写文章，证明 electron-ipc、signature verified、live Provider、文章 artifact 和 workflow JSONL/resume lifecycle。",
    commandHint:
      "LIME_ELECTRON_CDP_URL=http://127.0.0.1:9223 npm run plugin:content-factory-production-gui-evidence -- --session-id <session> --workflow-jsonl <workflow-events.jsonl>",
    matches: (code) =>
      code === "production_article_draft_document_missing" ||
      code.startsWith("production_gui_") ||
      code.startsWith("production_host_generation_") ||
      code.startsWith("production_workflow_"),
  },
  {
    id: "evidence_integrity",
    owner: "engineering",
    title: "evidence 完整性与脱敏",
    nextAction:
      "重新生成 signed gate / evidence bundle / readiness report，清理 stale、placeholder、secret 或 package URL 泄漏。",
    commandHint:
      "npm run plugin:content-factory-production-readiness-report -- --evidence-dir <evidence-dir> --studio-dry-run <studio-dry-run.json> --expected-version <version>",
    matches: (code) =>
      [
        "production_evidence_bundle_failed",
        "production_evidence_bundle_gate_stale",
        "production_evidence_bundle_stale",
        "production_placeholder_values_present",
        "production_readiness_report_failed",
        "production_secret_values_present",
        "production_signed_gate_result_stale",
      ].includes(code),
  },
];

const UNKNOWN_PHASE = {
  id: "unknown",
  owner: "engineering",
  title: "未归类 production blocker",
  nextAction:
    "先补充 blocker 分类和 nextAction，再继续复测；不能把未知 blocker 当 ready。",
  commandHint: "",
};

function normalizeCodes(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const code = typeof item === "string" ? item : item?.code;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

export function classifyContentFactoryProductionReadinessCode(code) {
  return PHASES.find((phase) => phase.matches(code)) || UNKNOWN_PHASE;
}

export function buildContentFactoryProductionReadinessBlockerPlan(items = []) {
  const codes = normalizeCodes(items);
  const grouped = new Map(PHASES.map((phase) => [phase.id, []]));
  grouped.set(UNKNOWN_PHASE.id, []);

  for (const code of codes) {
    const phase = classifyContentFactoryProductionReadinessCode(code);
    grouped.get(phase.id).push(code);
  }

  const phases = [...PHASES, UNKNOWN_PHASE].map((phase) => {
    const phaseCodes = grouped.get(phase.id) || [];
    return {
      blocked: phaseCodes.length > 0,
      codes: phaseCodes,
      commandHint: phase.commandHint,
      count: phaseCodes.length,
      id: phase.id,
      nextAction: phase.nextAction,
      owner: phase.owner,
      title: phase.title,
    };
  });
  const blockedPhases = phases.filter((phase) => phase.blocked);
  const nextPhase = blockedPhases[0] || null;

  return {
    blockedCount: codes.length,
    blockedPhaseCount: blockedPhases.length,
    nextPhase,
    phases,
    ready: codes.length === 0,
    summary: nextPhase
      ? `${nextPhase.title}: ${nextPhase.codes.join(", ")}`
      : "production readiness blockers cleared",
  };
}
