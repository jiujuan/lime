import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

import { CONTENT_FACTORY_PRODUCTION_EVIDENCE_BUNDLE_FILE_NAME } from "./content-factory-production-evidence-bundle.mjs";
import {
  APP_ID,
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES,
} from "./plugin-content-factory-signed-release-gate-constants.mjs";
import { buildContentFactorySignedReleaseGate } from "./plugin-content-factory-signed-release-gate-core.mjs";
import { summarizePreflight } from "./plugin-content-factory-signed-release-gate-preflight.mjs";
import { buildContentFactoryProductionReadinessBlockerPlan } from "./content-factory-production-readiness-plan.mjs";

export const CONTENT_FACTORY_PRODUCTION_READINESS_REPORT_FILE_NAME =
  "content-factory-production-readiness-report.json";

const EVIDENCE_SLOTS = [
  ["preflight", "preflightPath"],
  ["catalog", "catalogPath"],
  ["bootstrap", "bootstrapPath"],
  ["fetchCloud", "fetchCloudPath"],
  ["guiEvidence", "guiEvidencePath"],
];

const FALLBACK_NEXT_ACTION =
  "补齐对应 production evidence；fixture、localhost 或手写 ready JSON 不能关闭该缺口。";

export const PRODUCTION_READINESS_NEXT_ACTIONS = {
  production_app_signature_yaml_missing:
    "在 content-factory-app 中用真实发布私钥生成 app.signature.yaml；私钥只能来自环境变量或本地私钥文件，不写入仓库或 evidence。",
  production_app_signature_yaml_missing_or_invalid:
    "在 content-factory-app 中生成字段完整的 app.signature.yaml；Studio dry-run 必须能解析 signature.package proof。",
  production_article_draft_document_missing:
    "重新跑真实 Lime Desktop cloud_release 写作流程，确认 App Server read model 中存在生成后的文章草稿文档。",
  production_app_server_manifest_inspect_missing:
    "重新运行 production preflight，并确保通过 current App Server pluginLocalPackage/inspect 取得 manifestHash。",
  production_signature_algorithm_missing:
    "重新生成 app.signature.yaml，确保包含 Host verifier 支持的 algorithm。",
  production_signature_algorithm_unsupported:
    "重新生成 app.signature.yaml，algorithm 必须是 Host verifier 支持的签名算法。",
  production_signature_cryptographic_verification_failed:
    "重新生成 app.signature.yaml，确保 detached signature 能用 production trust root publicKey 验证通过；不要手写 payloadHash 或 signature。",
  production_signature_catalog_algorithm_mismatch:
    "重新生成或修正 production catalog，确保 catalog signatureProof.algorithm 与本地 app.signature.yaml 一致。",
  production_signature_catalog_payload_hash_mismatch:
    "重新生成或修正 production catalog，确保 catalog signatureProof.payloadHash 与本地 app.signature.yaml 一致。",
  production_signature_catalog_public_key_id_mismatch:
    "重新生成或修正 production catalog，确保 catalog signatureProof.publicKeyId 与本地 app.signature.yaml 一致。",
  production_signature_catalog_signature_ref_mismatch:
    "重新生成或修正 production catalog，确保 catalog identity.signatureRef 与本地 app.signature.yaml 一致。",
  production_signature_catalog_signed_at_mismatch:
    "重新生成或修正 production catalog，确保 catalog signatureProof.signedAt 与本地 app.signature.yaml 一致。",
  production_signature_payload_hash_invalid:
    "重新生成 app.signature.yaml，payloadHash 必须是 sha256:<64 hex>。",
  production_signature_payload_hash_mismatch:
    "重新生成 app.signature.yaml，payloadHash 必须来自 canonical cloud_release payload，并与 packageUrl/packageHash/manifestHash/releaseId/signatureRef 等发布事实一致。",
  production_signature_schema_version_missing:
    "重新生成 app.signature.yaml，必须包含 signature.package.schemaVersion。",
  production_signature_schema_version_unsupported:
    "重新生成 app.signature.yaml，signature.package.schemaVersion 必须是当前 Host verifier 支持的版本。",
  production_signature_public_key_id_missing:
    "重新生成 app.signature.yaml，确保 publicKeyId 与 production trust root 匹配。",
  production_signature_ref_missing:
    "重新生成 app.signature.yaml，确保包含 signatureRef。",
  production_signature_signed_at_invalid:
    "重新生成 app.signature.yaml，signedAt 必须是有效时间戳。",
  production_signature_trust_root_algorithm_mismatch:
    "重新生成或修正 trust root，确保 app.signature.yaml algorithm 与 trust root algorithm 一致。",
  production_signature_trust_root_mismatch:
    "重新生成或修正 trust root，确保 app.signature.yaml publicKeyId 与 trust root publicKeyId 一致。",
  production_signature_trust_root_public_key_missing:
    "修正 plugin-signature-trust-root.json，必须包含 production verifier publicKey；catalog 不能自带可信公钥来让 App 自签通过。",
  production_signature_value_missing:
    "重新生成 app.signature.yaml，确保包含 detached signature 值。",
  production_bootstrap_missing:
    "读取 production LimeCore bootstrap，并确认下发 pluginSignatureTrustRoots。",
  production_bootstrap_trust_roots_missing:
    "修正 production bootstrap，必须下发 pluginSignatureTrustRoots。",
  production_catalog_missing:
    "通过 current bulk publish 写入 production catalog，或提供真实 production catalog/client plugins JSON。",
  production_catalog_manifest_hash_mismatch:
    "重新生成 production catalog，确保 catalog manifestHash 与 current preflight manifestHash 一致。",
  production_catalog_not_cloud_release:
    "修正 production catalog，sourceKind 必须是 cloud_release。",
  production_catalog_not_remote_release:
    "修正旧 evidence 中的 production catalog sourceKind；当前 content-factory-app 必须指向 cloud_release，而不是 remote、local_folder、fixture 或 localhost。",
  production_catalog_package_hash_mismatch:
    "重新生成 production catalog，确保 catalog packageHash 与真实 .lapp sha256 一致。",
  production_catalog_package_url_not_remote_https:
    "修正 production catalog，packageUrl 必须是非 localhost 的 HTTPS 地址。",
  production_catalog_release_id_missing:
    "修正 production catalog，identity.releaseId 必须存在，并与 signatureRef 绑定同一个 release。",
  production_catalog_signature_proof_missing:
    "修正 production catalog，必须包含 signatureProof。",
  production_catalog_signature_ref_release_id_mismatch:
    "修正 production catalog，identity.signatureRef 必须以 :<releaseId> 结尾。",
  production_catalog_signature_ref_missing:
    "修正 production catalog，identity.signatureRef 必须存在并与 app.signature.yaml 一致。",
  production_evidence_bundle_stale:
    "重新运行 production evidence bundle，确保 content-factory-production-evidence-bundle.json 的输入 sha256/digest 与当前 evidence files 一致。",
  production_evidence_bundle_gate_stale:
    "重新运行 production evidence bundle，确保 bundle manifest 中的 gate 摘要与当前 evidence files 重新计算的 signed gate 一致。",
  production_fetch_cloud_evidence_missing:
    "用 current App Server pluginPackage/fetchCloud 验证 production cloud_release 包、签名与 hash。",
  production_fetch_cloud_evidence_not_ready:
    "重新运行 current App Server pluginPackage/fetchCloud，必须得到 cloud_release / verified signature / verified package / hash matched。",
  production_fetch_cloud_catalog_algorithm_mismatch:
    "重新运行 current App Server pluginPackage/fetchCloud，并确认 fetchCloud signatureProof.algorithm 与 production catalog 一致。",
  production_fetch_cloud_catalog_manifest_hash_mismatch:
    "重新运行 current App Server pluginPackage/fetchCloud，并确认 fetchCloud manifestHash 与 production catalog 一致。",
  production_fetch_cloud_catalog_package_hash_mismatch:
    "重新运行 current App Server pluginPackage/fetchCloud，并确认 fetchCloud packageHash 与 production catalog 一致。",
  production_fetch_cloud_catalog_package_url_mismatch:
    "重新运行 current App Server pluginPackage/fetchCloud，并确认 fetchCloud package URL 与 production catalog 一致。",
  production_fetch_cloud_catalog_payload_hash_mismatch:
    "重新运行 current App Server pluginPackage/fetchCloud，并确认 fetchCloud signatureProof.payloadHash 与 production catalog 一致。",
  production_fetch_cloud_catalog_public_key_id_mismatch:
    "重新运行 current App Server pluginPackage/fetchCloud，并确认 fetchCloud signatureProof.publicKeyId 与 production catalog 一致。",
  production_fetch_cloud_catalog_signature_ref_mismatch:
    "重新运行 current App Server pluginPackage/fetchCloud，并确认 fetchCloud signatureRef 与 production catalog 一致。",
  production_fetch_cloud_catalog_signed_at_mismatch:
    "重新运行 current App Server pluginPackage/fetchCloud，并确认 fetchCloud signatureProof.signedAt 与 production catalog 一致。",
  production_fetch_cloud_preflight_manifest_hash_mismatch:
    "重新运行 production preflight 和 current App Server pluginPackage/fetchCloud，确保 fetchCloud manifestHash 与 preflight manifestHash 一致。",
  production_fetch_cloud_preflight_package_hash_mismatch:
    "重新运行 production preflight 和 current App Server pluginPackage/fetchCloud，确保 fetchCloud packageHash 与 preflight packageHash 一致。",
  production_gui_evidence_missing:
    "在真实 Lime Desktop 中安装 production cloud_release 后运行 production GUI evidence collector。",
  production_gui_app_server_json_rpc_missing:
    "重新用 Electron CDP 跑真实 Lime Desktop 流程，并确认 trace 中出现 app_server_handle_json_lines / App Server JSON-RPC current method。",
  production_gui_evidence_not_ready:
    "重新运行 production GUI evidence collector；必须是真实 Electron Desktop、cloud_release 安装态和通过的工作流证据。",
  production_gui_not_cloud_release:
    "从 production catalog 安装 cloud_release 包后再跑 GUI evidence；local_folder、fixture 和 localhost 不能关闭 production 缺口。",
  production_gui_signature_not_verified:
    "修复 Host 签名验证或 trust root 后重新安装 cloud_release，GUI evidence 必须显示 signatureVerificationStatus=verified。",
  production_gui_turn_start_not_electron_ipc:
    "重新用真实 Electron CDP 发送 @写文章，并确认 agentSession/turn/start 经 electron-ipc 进入 app_server_handle_json_lines。",
  production_host_generation_not_completed:
    "重新跑完整 @写文章流程直到 Host-managed generation completed；不能用占位、手写 JSON 或半程 trace 代替。",
  production_host_generation_not_live:
    "切到真实 live Provider production route 后重新生成；fixture provider 或 mock backend 不能关闭 production 缺口。",
  production_manifest_hash_missing:
    "修正 production catalog，identity.manifestHash 必须是 sha256:<64 hex>。",
  production_manifest_hash_invalid:
    "重新运行 current App Server inspect，manifestHash 必须是 sha256:<64 hex>。",
  production_package_app_id_mismatch:
    "重新打包 content-factory-app，plugin.json id 必须是 content-factory-app。",
  production_package_entries_missing:
    "补齐 .lapp 必需文件后重新打包，不能发布缺 runtime、manifest、locales 或 icon 的包。",
  production_package_hash_invalid:
    "重新生成 .lapp packageHash，必须是 sha256:<64 hex>。",
  production_package_hash_missing:
    "修正 production catalog，identity.packageHash 必须是 sha256:<64 hex>。",
  production_package_missing:
    "先构建 content-factory-app 的 dist-package .lapp，再运行 production preflight。",
  production_package_not_readable: "重新生成 .lapp，确保它是可读 ZIP 包。",
  production_package_url_missing:
    "上传真实 .lapp 到对象存储 / CDN，并向 Studio publish 传入真实 HTTPS packageUrl。",
  production_package_url_not_https:
    "修正 production catalog，package/source URL 必须是 production HTTPS 地址，不能是 localhost、fixture 或占位 URL。",
  production_package_version_mismatch:
    "重新打包 content-factory-app，确保 plugin.json version 与 expectedVersion 一致。",
  production_placeholder_values_present:
    "清理 production evidence 中的 PLACEHOLDER/fixture/localhost 占位值，并用真实 current 链路重新采集。",
  production_preflight_missing:
    "先运行 plugin:content-factory-production-preflight，对真实 .lapp 执行 App Server current inspect。",
  production_preflight_not_ready:
    "先补齐 preflight missing codes，再进入 signed release gate。",
  production_preflight_catalog_manifest_hash_mismatch:
    "重新生成 production package、preflight 和 catalog，确保 catalog manifestHash 与 preflight manifestHash 一致。",
  production_preflight_catalog_package_hash_mismatch:
    "重新生成 production package、preflight 和 catalog，确保 catalog packageHash 与 preflight packageHash 一致。",
  production_preflight_signature_algorithm_missing:
    "重新运行 production preflight，确保 app.signature.yaml 摘要包含 algorithm；不要手写 ready preflight JSON。",
  production_preflight_signature_payload_hash_missing:
    "重新运行 production preflight，确保 app.signature.yaml 摘要包含 payloadHash；不要手写 ready preflight JSON。",
  production_preflight_signature_public_key_id_missing:
    "重新运行 production preflight，确保 app.signature.yaml 摘要包含 publicKeyId；不要手写 ready preflight JSON。",
  production_preflight_signature_ref_missing:
    "重新运行 production preflight，确保 app.signature.yaml 摘要包含 signatureRef；不要手写 ready preflight JSON。",
  production_preflight_signature_signed_at_missing:
    "重新运行 production preflight，确保 app.signature.yaml 摘要包含 signedAt；不要手写 ready preflight JSON。",
  production_preflight_signature_value_missing:
    "重新运行 production preflight，确保 app.signature.yaml 摘要能证明 detached signature 已存在；不要手写 ready preflight JSON。",
  production_preflight_signature_cryptographic_verification_missing:
    "重新运行 production preflight，确保 app.signature.yaml 已通过 trust root publicKey 的密码学验证；旧 ready JSON 或字段齐备不能替代验签。",
  production_preflight_version_mismatch:
    "重新打包 content-factory-app，并确保 preflight package version 与 expectedVersion 一致。",
  production_release_evidence_not_ready:
    "重新采集 production release evidence；catalog、fetchCloud、GUI 和 workflow 审计证据必须全部来自 current production 链路。",
  production_release_evidence_bootstrap_matching_trust_root_algorithm_missing:
    "修正 production bootstrap，matching trust root 必须包含 algorithm，并与 catalog signatureProof.publicKeyId 对应。",
  production_release_evidence_bootstrap_matching_trust_root_missing:
    "修正 production bootstrap，必须下发与 catalog signatureProof.publicKeyId 匹配的 pluginSignatureTrustRoot。",
  production_release_evidence_bootstrap_matching_trust_root_public_key_missing:
    "修正 production bootstrap，matching trust root 必须包含 publicKey，Host 不能靠 catalog 自带 proof 自签通过。",
  production_release_evidence_bootstrap_request_failed:
    "重新读取 production client bootstrap；没有 bootstrap 就不能证明 production trust roots 已下发。",
  production_release_evidence_bootstrap_trust_roots_missing:
    "修正 production bootstrap，必须包含 pluginSignatureTrustRoots。",
  production_release_evidence_catalog_app_missing:
    "重新发布 content-factory-app 到 production catalog，marketplace 返回中必须能找到 content-factory-app。",
  production_release_evidence_catalog_manifest_hash_missing:
    "修正 production catalog，content-factory-app package ref 必须包含 manifestHash。",
  production_release_evidence_catalog_not_cloud_release:
    "修正 production catalog，content-factory-app 必须是 cloud_release，而不是 remote、local_folder、fixture 或空 sourceKind。",
  production_release_evidence_catalog_package_hash_missing:
    "修正 production catalog，content-factory-app package ref 必须包含 packageHash。",
  production_release_evidence_catalog_package_url_missing:
    "修正 production catalog，content-factory-app package ref 必须包含 HTTPS packageUrl/sourceUri。",
  production_release_evidence_catalog_package_url_not_https:
    "修正 production catalog，content-factory-app package URL 必须是非 localhost 的 HTTPS 地址。",
  production_release_evidence_catalog_release_id_missing:
    "修正 production catalog，content-factory-app package ref 必须包含 releaseId。",
  production_release_evidence_catalog_signature_proof_algorithm_missing:
    "修正 production catalog，signatureProof 必须包含 algorithm。",
  production_release_evidence_catalog_signature_proof_missing:
    "修正 production catalog，content-factory-app package ref 必须包含 signatureProof。",
  production_release_evidence_catalog_signature_proof_payload_hash_missing:
    "修正 production catalog，signatureProof 必须包含 payloadHash。",
  production_release_evidence_catalog_signature_proof_public_key_id_missing:
    "修正 production catalog，signatureProof 必须包含 publicKeyId。",
  production_release_evidence_catalog_signature_proof_signed_at_missing:
    "修正 production catalog，signatureProof 必须包含 signedAt。",
  production_release_evidence_catalog_signature_ref_missing:
    "修正 production catalog，content-factory-app package ref 必须包含 signatureRef。",
  production_release_evidence_marketplace_request_failed:
    "重新读取 production client plugins marketplace；没有 marketplace 返回就不能证明 production catalog 已发布。",
  production_release_id_missing:
    "修正 production catalog，identity.releaseId 必须存在，不能只用 appId@version 作为 release 签名边界。",
  production_trust_root_missing:
    "生成并部署 plugin-signature-trust-root.json / production trust root；publicKeyId 必须与签名 proof 匹配。",
  production_secret_values_present:
    "清理 evidence 中的密钥、Bearer、Provider token 或私有 URL；只保留脱敏 marker 和 hash 后重新生成报告。",
  production_signature_proof_missing:
    "修正 production catalog，必须包含完整 signatureProof（publicKeyId、algorithm、payloadHash、signature、signedAt）。",
  production_signature_ref_release_id_mismatch:
    "修正 production catalog，signatureRef 必须以 :<releaseId> 结尾，并与 app.signature.yaml/canonical payload 一致。",
  production_studio_dry_run_manifest_hash_mismatch:
    "重新运行 Studio dry-run 与 production preflight，确保两者使用同一 current App Server pluginLocalPackage/inspect manifestHash。",
  production_studio_dry_run_missing:
    "先运行 lime-agent-app-studio publish --dry-run，生成发布侧 releaseReadiness evidence。",
  production_studio_dry_run_not_ready:
    "先补齐 Studio dry-run releaseReadiness.blockers，再进入 production signed release gate。",
  production_studio_dry_run_package_hash_mismatch:
    "重新打包 content-factory-app，并确保 Studio dry-run packageHash 与 production preflight packageHash 一致。",
  production_studio_token_missing:
    "通过宿主会话、--token 或 LIME_AGENT_APP_STUDIO_TOKEN 提供开发者 token；token 不得写入 evidence。",
  production_tenant_id_missing:
    "向 Studio publish 传入 tenantId，确保 bulk publish 目标租户明确。",
  production_trust_root_algorithm_missing:
    "修正 plugin-signature-trust-root.json，确保包含 algorithm。",
  production_trust_root_algorithm_unsupported:
    "修正 plugin-signature-trust-root.json，algorithm 必须是 Host verifier 支持的签名算法。",
  production_trust_root_public_key_id_missing:
    "修正 plugin-signature-trust-root.json，确保包含 publicKeyId。",
  production_signature_trust_root_missing:
    "修正 production bootstrap/trust root，确保存在与 catalog signatureProof publicKeyId/algorithm 匹配的 trust root。",
  production_trust_roots_missing:
    "读取并提供 production bootstrap 中的 pluginSignatureTrustRoots；没有 trust root 时 Host 不能验证 cloud_release 签名。",
  production_version_mismatch:
    "修正 production catalog 中 content-factory-app version，使其与 expectedVersion 一致。",
  production_workflow_facts_visible:
    "修复 GUI 投影，右侧/详情不应展示 raw workflow facts；审计数据只写 JSONL evidence。",
  production_workflow_jsonl_missing:
    "重新跑 production workflow，并确保 workflow-events.jsonl 落盘；JSONL 是后续审计唯一事实源。",
  production_workflow_resume_lifecycle_missing:
    "重新完成 selected-actions resume 流程，确保 action/respond metadata 与 workflow.step/run.resuming JSONL 事件能互相匹配。",
  production_signed_gate_result_stale:
    "重新运行 signed release gate 或 evidence bundle，确保 content-factory-signed-release-gate.result.json 与当前 evidence files 一致。",
};

export function nextActionForProductionRequirement(code) {
  return PRODUCTION_READINESS_NEXT_ACTIONS[code] || FALLBACK_NEXT_ACTION;
}

function sha256String(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function sha256Json(value) {
  return sha256String(JSON.stringify(value));
}

function readOptionalJson(filePath) {
  if (!filePath) return null;
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) return null;
  const raw = fs.readFileSync(resolvedPath, "utf8");
  return {
    path: resolvedPath,
    sha256: sha256String(raw),
    size: Buffer.byteLength(raw, "utf8"),
    value: JSON.parse(raw),
  };
}

function fileStatus(filePath) {
  if (!filePath) return { exists: false, path: null };
  const resolvedPath = path.resolve(process.cwd(), filePath);
  try {
    const stat = fs.statSync(resolvedPath);
    return {
      exists: true,
      isFile: stat.isFile(),
      path: resolvedPath,
      size: stat.size,
    };
  } catch {
    return { exists: false, path: resolvedPath };
  }
}

function evidencePathFromDir(evidenceDir, fileName) {
  if (!evidenceDir) return "";
  return path.join(path.resolve(process.cwd(), evidenceDir), fileName);
}

function resolveEvidencePaths(input) {
  const evidenceDir = input.evidenceDir
    ? path.resolve(process.cwd(), input.evidenceDir)
    : "";
  return {
    bootstrapPath:
      input.bootstrapPath ||
      evidencePathFromDir(
        evidenceDir,
        CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.bootstrap,
      ),
    bundlePath:
      input.bundlePath ||
      evidencePathFromDir(
        evidenceDir,
        CONTENT_FACTORY_PRODUCTION_EVIDENCE_BUNDLE_FILE_NAME,
      ),
    catalogPath:
      input.catalogPath ||
      evidencePathFromDir(
        evidenceDir,
        CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.catalog,
      ),
    fetchCloudPath:
      input.fetchCloudPath ||
      evidencePathFromDir(
        evidenceDir,
        CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.fetchCloud,
      ),
    gateResultPath:
      input.gateResultPath ||
      evidencePathFromDir(
        evidenceDir,
        CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
      ),
    guiEvidencePath:
      input.guiEvidencePath ||
      evidencePathFromDir(
        evidenceDir,
        CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.guiEvidence,
      ),
    preflightPath:
      input.preflightPath ||
      evidencePathFromDir(
        evidenceDir,
        CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.preflight,
      ),
    studioDryRunPath: input.studioDryRunPath || "",
  };
}

function sourceSummary(record) {
  return {
    basename: record ? path.basename(record.path) : null,
    path: record?.path || null,
    present: Boolean(record),
    sha256: record?.sha256 || null,
    size: record?.size || 0,
  };
}

function uniqueCodes(items) {
  return [
    ...new Set(
      items
        .map((item) => item?.code)
        .filter((code) => typeof code === "string" && code.trim()),
    ),
  ];
}

function missingFromCodes(codes) {
  return codes.map((code) => ({
    code,
    nextAction: nextActionForProductionRequirement(code),
  }));
}

function sortedCodes(items) {
  return [...items].sort();
}

function codesEqual(left, right) {
  const sortedLeft = sortedCodes(left);
  const sortedRight = sortedCodes(right);
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((code, index) => code === sortedRight[index])
  );
}

function summarizeExistingGateResult(record, currentGate) {
  if (!record) {
    return {
      matchesCurrentEvidence: true,
      missingCodes: [],
      ready: false,
      source: { present: false },
      status: null,
    };
  }
  const currentMissingCodes = uniqueCodes(
    currentGate.missingRequirements || [],
  );
  const existingMissingCodes = uniqueCodes(
    record.value?.missingRequirements || [],
  );
  const existingReady = record.value?.ready === true;
  const existingStatus = record.value?.status || null;
  return {
    matchesCurrentEvidence:
      existingReady === (currentGate.ready === true) &&
      existingStatus === (currentGate.status || "blocked") &&
      codesEqual(existingMissingCodes, currentMissingCodes),
    missingCodes: existingMissingCodes,
    ready: existingReady,
    source: sourceSummary(record),
    status: existingStatus,
  };
}

function gateSummaryFromGate(gate) {
  return {
    missingCodes: uniqueCodes(gate.missingRequirements || []),
    ready: gate.ready === true,
    status: gate.status || "blocked",
  };
}

function currentEvidenceInputSlots(records) {
  return Object.fromEntries(
    EVIDENCE_SLOTS.map(([slot]) => [
      slot,
      records[slot]
        ? {
            present: true,
            sha256: records[slot].sha256,
          }
        : {
            present: false,
            sha256: null,
          },
    ]),
  );
}

function summarizeEvidenceBundle(
  record,
  records,
  appId,
  expectedVersion,
  currentGate,
) {
  if (!record) {
    return {
      digestMatches: true,
      gate: {
        digestMatches: true,
        matchesCurrentEvidence: true,
      },
      matchesCurrentEvidence: true,
      present: false,
      slotMismatches: [],
      source: { present: false },
    };
  }
  const currentSlots = currentEvidenceInputSlots(records);
  const expectedDigest = sha256Json({
    appId,
    expectedVersion: expectedVersion || null,
    slots: currentSlots,
  });
  const bundleSlots = record.value?.inputs?.slots || {};
  const slotMismatches = EVIDENCE_SLOTS.flatMap(([slot]) => {
    const currentSlot = currentSlots[slot];
    const bundleSlot = bundleSlots?.[slot] || {};
    const presentMatches = bundleSlot.present === currentSlot.present;
    const shaMatches = (bundleSlot.sha256 || null) === currentSlot.sha256;
    return presentMatches && shaMatches
      ? []
      : [
          {
            bundlePresent: bundleSlot.present === true,
            bundleSha256: bundleSlot.sha256 || null,
            currentPresent: currentSlot.present,
            currentSha256: currentSlot.sha256,
            slot,
          },
        ];
  });
  const digestMatches = record.value?.inputs?.digest === expectedDigest;
  const currentGateSummary = gateSummaryFromGate(currentGate);
  const expectedGateDigest = sha256Json(currentGateSummary);
  const bundleGate = record.value?.gate || {};
  const bundleGateMissingCodes = Array.isArray(bundleGate.missingCodes)
    ? uniqueCodes(bundleGate.missingCodes.map((code) => ({ code })))
    : [];
  const gateSummaryMatches =
    bundleGate.ready === currentGateSummary.ready &&
    (bundleGate.status || null) === currentGateSummary.status &&
    codesEqual(bundleGateMissingCodes, currentGateSummary.missingCodes);
  const gateDigestMatches = bundleGate.digest === expectedGateDigest;
  const gateMatchesCurrentEvidence = gateSummaryMatches && gateDigestMatches;
  return {
    digest: record.value?.inputs?.digest || null,
    digestMatches,
    expectedDigest,
    gate: {
      bundleDigest: bundleGate.digest || null,
      digestMatches: gateDigestMatches,
      expectedDigest: expectedGateDigest,
      expectedMissingCodes: currentGateSummary.missingCodes,
      expectedReady: currentGateSummary.ready,
      expectedStatus: currentGateSummary.status,
      matchesCurrentEvidence: gateMatchesCurrentEvidence,
      missingCodes: bundleGateMissingCodes,
      ready: bundleGate.ready === true,
      resultSha256: bundleGate.resultSha256 || null,
      status: bundleGate.status || null,
      summaryMatches: gateSummaryMatches,
    },
    matchesCurrentEvidence:
      digestMatches &&
      slotMismatches.length === 0 &&
      gateMatchesCurrentEvidence,
    present: true,
    slotMismatches,
    source: sourceSummary(record),
  };
}

function summarizeCatalogForReport(catalog) {
  if (!catalog) {
    return { present: false, ready: false };
  }
  return {
    appFound: catalog.appFound === true,
    manifestHashValid: catalog.manifestHashValid === true,
    packageHashValid: catalog.packageHashValid === true,
    packageUrlProductionHttps: catalog.packageUrlProductionHttps === true,
    present: true,
    ready:
      catalog.appFound === true &&
      catalog.sourceKindReady === true &&
      catalog.versionMatches === true &&
      catalog.packageUrlProductionHttps === true &&
      catalog.packageHashValid === true &&
      catalog.manifestHashValid === true &&
      catalog.signatureProof?.present === true &&
      catalog.signatureProof?.supportedAlgorithm !== false,
    signatureProofPresent: catalog.signatureProof?.present === true,
    sourceKind: catalog.sourceKind || null,
    sourceKindReady: catalog.sourceKindReady === true,
    version: catalog.version || null,
    versionMatches: catalog.versionMatches === true,
  };
}

function summarizeBootstrapForReport(bootstrap) {
  if (!bootstrap) {
    return { present: false, ready: false };
  }
  return {
    matchingTrustRoot: bootstrap.matchingTrustRoot === true,
    matchingTrustRootPublicKeyPresent:
      bootstrap.matchingTrustRootPublicKeyPresent === true,
    present: true,
    ready: bootstrap.ready === true,
    trustRootCount: bootstrap.trustRootCount || 0,
  };
}

function summarizeFetchCloudForReport(fetchCloud) {
  if (!fetchCloud) {
    return { present: false, ready: false };
  }
  return {
    fixtureLike: fetchCloud.fixtureLike === true,
    manifestHashMatched: fetchCloud.manifestHashMatched === true,
    packageHashMatched: fetchCloud.packageHashMatched === true,
    packageVerificationStatus: fetchCloud.packageVerificationStatus || null,
    present: true,
    ready: fetchCloud.ready === true,
    signatureVerificationStatus: fetchCloud.signatureVerificationStatus || null,
    sourceKind: fetchCloud.sourceKind || null,
    status: fetchCloud.status || null,
  };
}

function summarizeGuiForReport(guiEvidence) {
  if (!guiEvidence) {
    return { present: false, ready: false };
  }
  return {
    appServerHandleJsonLinesSeen:
      guiEvidence.appServerHandleJsonLinesSeen === true,
    articleDraftDocumentPresent:
      guiEvidence.articleDraftDocumentPresent === true,
    fixtureLike: guiEvidence.fixtureLike === true,
    hostManagedGenerationStatus:
      guiEvidence.hostManagedGenerationStatus || null,
    liveProviderUsed: guiEvidence.liveProviderUsed === true,
    present: true,
    ready: guiEvidence.ready === true,
    signatureVerificationStatus:
      guiEvidence.signatureVerificationStatus || null,
    sourceKind: guiEvidence.sourceKind || null,
    status: guiEvidence.status || null,
    turnStartViaElectronIpc: guiEvidence.turnStartViaElectronIpc === true,
    workflowJsonlPresent: guiEvidence.workflowJsonlPresent === true,
    workflowResumeLifecycle: {
      auditEventsPresent:
        guiEvidence.workflowResumeLifecycle?.auditEventsPresent === true,
      contractMetadataPresent:
        guiEvidence.workflowResumeLifecycle?.contractMetadataPresent === true,
    },
  };
}

function summarizePreflightForReport(preflight, expectedVersion) {
  const summary = summarizePreflight(preflight, expectedVersion);
  if (!summary.present) return summary;
  return {
    appServerInspectPresent: summary.appServerInspectPresent,
    appSignatureYamlPresent: summary.appSignatureYamlPresent,
    expectedVersion: summary.expectedVersion,
    manifestHash: summary.manifestHash,
    manifestHashValid: summary.manifestHashValid,
    missingRequirementCodes: summary.missingRequirementCodes,
    packageHash: summary.packageHash,
    packageHashValid: summary.packageHashValid,
    present: true,
    publishReadinessConfigured: summary.publishReadinessConfigured,
    ready: summary.ready,
    signatureCryptographicVerificationStatus:
      summary.signatureCryptographicVerificationStatus,
    signaturePayloadHashMatched: summary.signaturePayloadHashMatched,
    status: summary.status,
    trustRootPresent: summary.trustRootPresent,
    version: summary.version,
    versionMatches: summary.versionMatches,
  };
}

function summarizePublishReadiness(preflight) {
  const publishReadiness = preflight?.publishReadiness;
  if (
    !publishReadiness ||
    typeof publishReadiness !== "object" ||
    Array.isArray(publishReadiness)
  ) {
    return { configured: false, present: false, requirements: [] };
  }
  return {
    configured: publishReadiness.configured === true,
    note: "Only env names and configured booleans are reported. Secret values and package URLs are not copied.",
    present: true,
    requirements: Array.isArray(publishReadiness.requirements)
      ? publishReadiness.requirements.map((item) => ({
          configured: item?.configured === true,
          env: Array.isArray(item?.env) ? item.env : [],
          key: item?.key || "",
          remoteHttps:
            typeof item?.remoteHttps === "boolean"
              ? item.remoteHttps
              : undefined,
        }))
      : [],
  };
}

function summarizeStudioDryRun(record, preflightSummary) {
  if (!record) {
    return {
      blockers: [],
      drift: [],
      present: false,
      ready: false,
      source: { present: false },
      warnings: [],
    };
  }
  const readiness = record.value?.releaseReadiness || {};
  const checks = readiness.checks || {};
  const packageHash = checks.package?.packageHash || null;
  const manifestHash = checks.manifest?.manifestHash || null;
  const blockerCodes = uniqueCodes(readiness.blockers || []);
  const warningCodes = uniqueCodes(readiness.warnings || []);
  const driftCodes = [];
  if (
    packageHash &&
    preflightSummary.packageHash &&
    packageHash !== preflightSummary.packageHash
  ) {
    driftCodes.push("production_studio_dry_run_package_hash_mismatch");
  }
  if (
    manifestHash &&
    preflightSummary.manifestHash &&
    manifestHash !== preflightSummary.manifestHash
  ) {
    driftCodes.push("production_studio_dry_run_manifest_hash_mismatch");
  }
  const notReadyCodes =
    readiness.ready === true || blockerCodes.length > 0
      ? []
      : ["production_studio_dry_run_not_ready"];
  return {
    appId: record.value?.plan?.appId || readiness.appId || null,
    blockers: missingFromCodes([...blockerCodes, ...notReadyCodes]),
    checks: {
      auth: checks.auth || null,
      manifest: checks.manifest
        ? {
            manifestHash,
            source: checks.manifest.source || null,
            appServerBinarySource:
              checks.manifest.appServerBinarySource || null,
          }
        : null,
      package: checks.package
        ? {
            fileCount: checks.package.fileCount || 0,
            packageHash,
            packageName: checks.package.packageName || null,
            sizeBytes: checks.package.sizeBytes || 0,
            version: checks.package.version || null,
          }
        : null,
      packageUrl: checks.packageUrl
        ? {
            configured: checks.packageUrl.configured === true,
            host: checks.packageUrl.host || null,
            https: checks.packageUrl.https === true,
          }
        : null,
      signature: checks.signature
        ? {
            algorithm: checks.signature.algorithm || null,
            payloadHash: checks.signature.payloadHash || null,
            publicKeyId: checks.signature.publicKeyId || null,
            signaturePresent: checks.signature.signaturePresent === true,
            signatureRef: checks.signature.signatureRef || null,
            signedAt: checks.signature.signedAt || null,
          }
        : null,
    },
    drift: missingFromCodes(driftCodes),
    present: true,
    ready: readiness.ready === true && driftCodes.length === 0,
    source: sourceSummary(record),
    warnings: missingFromCodes(warningCodes),
  };
}

function buildGateFromEvidence(records, expectedVersion, appId) {
  return buildContentFactorySignedReleaseGate({
    appId,
    bootstrap: records.bootstrap?.value,
    catalog: records.catalog?.value,
    expectedVersion,
    fetchCloud: records.fetchCloud?.value,
    guiEvidence: records.guiEvidence?.value,
    preflight: records.preflight?.value,
  });
}

export function buildContentFactoryProductionReadinessReport(input = {}) {
  const appId = input.appId || APP_ID;
  const expectedVersion = input.expectedVersion || "";
  const evidencePaths = resolveEvidencePaths(input);
  const records = Object.fromEntries(
    EVIDENCE_SLOTS.map(([slot, key]) => [
      slot,
      readOptionalJson(evidencePaths[key]),
    ]),
  );
  const bundleRecord = readOptionalJson(evidencePaths.bundlePath);
  const gateResult = readOptionalJson(evidencePaths.gateResultPath);
  const studioDryRunRecord = readOptionalJson(evidencePaths.studioDryRunPath);
  const gate = buildGateFromEvidence(records, expectedVersion, appId);
  const missingCodes = uniqueCodes(gate.missingRequirements || []);
  const existingGateResult = summarizeExistingGateResult(gateResult, gate);
  const evidenceBundle = summarizeEvidenceBundle(
    bundleRecord,
    records,
    appId,
    expectedVersion,
    gate,
  );
  const resultDriftCodes =
    gateResult && !existingGateResult.matchesCurrentEvidence
      ? ["production_signed_gate_result_stale"]
      : [];
  const bundleInputsMatch =
    evidenceBundle.digestMatches === true &&
    evidenceBundle.slotMismatches.length === 0;
  const bundleInputDriftCodes =
    bundleRecord && !bundleInputsMatch
      ? ["production_evidence_bundle_stale"]
      : [];
  const bundleGateDriftCodes =
    bundleRecord && !evidenceBundle.gate?.matchesCurrentEvidence
      ? ["production_evidence_bundle_gate_stale"]
      : [];
  const bundleDriftCodes = [
    ...new Set([...bundleInputDriftCodes, ...bundleGateDriftCodes]),
  ];
  const reportReady =
    gate.ready === true &&
    resultDriftCodes.length === 0 &&
    bundleDriftCodes.length === 0;
  const contentFactoryDir = input.contentFactoryDir
    ? path.resolve(process.cwd(), input.contentFactoryDir)
    : null;
  const packageJsonPath = contentFactoryDir
    ? path.join(contentFactoryDir, "package.json")
    : "";
  const packageJsonStatus = fileStatus(packageJsonPath);
  const preflight = records.preflight?.value || null;
  const preflightSummary = summarizePreflightForReport(
    preflight,
    expectedVersion,
  );
  const studioDryRun = summarizeStudioDryRun(
    studioDryRunRecord,
    preflightSummary,
  );
  const studioBlockerCodes = studioDryRun.present
    ? [
        ...studioDryRun.blockers.map((item) => item.code),
        ...studioDryRun.drift.map((item) => item.code),
      ]
    : [];
  const studioReady = !studioDryRun.present || studioDryRun.ready === true;
  const finalBlockerCodes = [
    ...missingCodes,
    ...resultDriftCodes,
    ...bundleDriftCodes,
    ...studioBlockerCodes,
  ];
  const blockerPlan = buildContentFactoryProductionReadinessBlockerPlan([
    ...finalBlockerCodes,
    ...(preflightSummary.missingRequirementCodes || []),
  ]);

  return {
    schemaVersion: "content-factory-production-readiness-report.v1",
    appId,
    expectedVersion: expectedVersion || null,
    generatedAt: new Date().toISOString(),
    status: reportReady && studioReady ? "ready" : "blocked",
    ready: reportReady && studioReady,
    contentFactoryApp: {
      dir: contentFactoryDir,
      packageJson: packageJsonStatus,
    },
    sources: Object.fromEntries(
      EVIDENCE_SLOTS.map(([slot]) => [slot, sourceSummary(records[slot])]),
    ),
    signedGate: {
      missingCodes,
      missingCount: missingCodes.length,
      present:
        Boolean(gateResult) || EVIDENCE_SLOTS.some(([slot]) => records[slot]),
      ready: reportReady,
      computedReady: gate.ready === true,
      existingResult: existingGateResult,
      resultDrift: missingFromCodes(resultDriftCodes),
      status: gate.status || "blocked",
    },
    evidenceBundle: {
      ...evidenceBundle,
      drift: missingFromCodes(bundleDriftCodes),
    },
    preflight: preflightSummary,
    preflightBlockers: missingFromCodes(
      preflightSummary.missingRequirementCodes || [],
    ),
    publishReadiness: summarizePublishReadiness(preflight),
    studioDryRun,
    catalog: summarizeCatalogForReport(gate.catalog),
    bootstrap: summarizeBootstrapForReport(gate.bootstrap),
    fetchCloud: summarizeFetchCloudForReport(gate.fetchCloud),
    guiEvidence: summarizeGuiForReport(gate.guiEvidence),
    blockers: missingFromCodes(finalBlockerCodes),
    blockerPlan,
    note: "Read-only readiness report. It does not sign, upload, install, call a Provider, call production APIs, or copy secret values/package URLs.",
  };
}

export function writeContentFactoryProductionReadinessReport(filePath, report) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
